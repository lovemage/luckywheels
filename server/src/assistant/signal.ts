import { randomInt } from 'node:crypto';
import type { AssistantSignal, AssistantSignalEndReason, Prisma, PrismaClient, Room } from '@prisma/client';
import { AppError } from '../errors.js';
import { loadScoreBoard } from './board.js';
import type { FreshnessSettings, RecommendSettings, SignalSettings } from './settings.js';

// 訊號（計劃 M3 訊號草案，2026-11-03 折衷做法）：
// - 符號組合隨機（2–3 種原創寶石符號，各配 ×2–×6），但每則都綁一間「發出當下」未逾時、分數 ≥ 門檻的真實空台
// - 會員端不顯示綁定的房間，後台可追查；強度 % 由綁定房間的分數換算，不是亂數
// - 換組條件（任一成立）：會員按「免遊結束，換一組」、綁定房間開過免遊、今日 RTP 變動達門檻、
//   房間變成有人／被預約／停用、資料逾時
// - 每位會員同時只有一則有效訊號；在讀取時檢查換組條件（之後的推播 worker 沿用 endReasonFor）

export const SIGNAL_SYMBOLS = ['yellow_gem', 'red_gem', 'blue_gem', 'green_gem', 'purple_gem', 'scarab'] as const;
export type SignalSymbol = (typeof SIGNAL_SYMBOLS)[number];
export interface SignalSymbolPick {
  symbol: SignalSymbol;
  multiplier: number;
}

export const SIGNAL_DISCLAIMER = '數據僅供參考，不承諾獲利';

const END_MESSAGES: Record<AssistantSignalEndReason, string> = {
  member_refresh: '已換一組新訊號',
  bonus_detected: '機台已開過免遊，已換一組新訊號',
  rtp_changed: '機台數據變動，已換一組新訊號',
  room_unavailable: '機台已有人使用，已換一組新訊號',
  data_stale: '數據暫停更新，已換一組新訊號',
};

type Rand = (min: number, maxExclusive: number) => number;

/** 隨機 2–3 種不重複符號，各配 ×2–×6 */
export function randomSymbols(rand: Rand = randomInt): SignalSymbolPick[] {
  const pool = [...SIGNAL_SYMBOLS];
  const count = rand(2, 4);
  const out: SignalSymbolPick[] = [];
  for (let i = 0; i < count; i++) {
    const [symbol] = pool.splice(rand(0, pool.length), 1);
    out.push({ symbol: symbol!, multiplier: rand(2, 7) });
  }
  return out;
}

/** 分數 0 → strengthMin、100 → strengthMax */
export const strengthFor = (score: number, s: SignalSettings) =>
  Math.round(s.strengthMin + ((s.strengthMax - s.strengthMin) * Math.min(100, Math.max(0, score))) / 100);

type SignalRoomState = Pick<Room, 'enabled' | 'status' | 'todayRtp' | 'listCapturedAt' | 'unopenedSpins' | 'prev1Spins'>;

/** 換組條件；null＝訊號仍有效 */
export function endReasonFor(
  signal: Pick<AssistantSignal, 'rtpAtIssue' | 'unopenedAtIssue' | 'prev1AtIssue'>,
  room: SignalRoomState | null,
  now: Date,
  f: FreshnessSettings,
  s: SignalSettings,
): AssistantSignalEndReason | null {
  if (!room || !room.enabled) return 'room_unavailable';
  if (!room.listCapturedAt || now.getTime() - room.listCapturedAt.getTime() > f.listMaxAgeSeconds * 1000) return 'data_stale';
  // 開過免遊：未開轉數變少（歸零後重新累計），或「前一」開出轉數改變
  const unopenedDropped =
    signal.unopenedAtIssue !== null && room.unopenedSpins !== null && room.unopenedSpins < signal.unopenedAtIssue;
  const prev1Changed = signal.prev1AtIssue !== null && room.prev1Spins !== null && room.prev1Spins !== signal.prev1AtIssue;
  if (unopenedDropped || prev1Changed) return 'bonus_detected';
  if (room.todayRtp !== null && Math.abs(Number(room.todayRtp) - Number(signal.rtpAtIssue)) >= s.rtpChangePoints) return 'rtp_changed';
  if (room.status !== 'idle') return 'room_unavailable';
  return null;
}

export interface SignalView {
  id: string;
  symbols: SignalSymbolPick[];
  strength: number;
  issuedAt: string;
}

const present = (s: AssistantSignal): SignalView => ({
  id: s.id,
  symbols: s.symbols as unknown as SignalSymbolPick[],
  strength: s.strength,
  issuedAt: s.issuedAt.toISOString(),
});

export interface SignalResult {
  signal: SignalView | null;
  /** 這次讀取時換掉了舊訊號：原因與提示文字 */
  replaced: { reason: AssistantSignalEndReason; message: string } | null;
  /** 沒有可綁定的空台時的提示 */
  message: string | null;
  disclaimer: string;
}

export interface SignalContext {
  prisma: PrismaClient;
  userId: string;
  gameId: string;
  now: Date;
  freshness: FreshnessSettings;
  recommend: RecommendSettings;
  signal: SignalSettings;
  rand?: Rand;
}

async function issue(tx: Prisma.TransactionClient, ctx: SignalContext, excludeRoomId: string | null): Promise<AssistantSignal | null> {
  const board = await loadScoreBoard(tx, ctx.gameId, ctx.now, ctx.freshness, ctx.recommend.weights, ctx.recommend.premiumPercent);
  const candidates = board.rooms.filter(
    (x) => x.room.status === 'idle' && x.score.score >= ctx.signal.minScore && x.room.id !== excludeRoomId,
  );
  if (candidates.length === 0) return null;
  // 同一間房同時有效的訊號數有上限，避免把太多會員導到同一台
  const busy = await tx.assistantSignal.groupBy({
    by: ['roomId'],
    where: { endedAt: null, roomId: { in: candidates.map((x) => x.room.id) } },
    _count: { _all: true },
  });
  const full = new Set(busy.filter((b) => b._count._all >= ctx.signal.maxPerRoom).map((b) => b.roomId));
  const open = candidates.filter((x) => !full.has(x.room.id));
  if (open.length === 0) return null;
  const rand = ctx.rand ?? randomInt;
  const pick = open[rand(0, open.length)]!;
  return tx.assistantSignal.create({
    data: {
      userId: ctx.userId,
      gameId: ctx.gameId,
      roomId: pick.room.id,
      symbols: randomSymbols(rand) as unknown as Prisma.InputJsonValue,
      strength: strengthFor(pick.score.score, ctx.signal),
      scoreAtIssue: pick.score.score,
      rtpAtIssue: pick.room.todayRtp!,
      unopenedAtIssue: pick.room.detailStale ? null : pick.room.unopenedSpins,
      prev1AtIssue: pick.room.detailStale ? null : pick.room.prev1Spins,
      issuedAt: ctx.now,
    },
  });
}

/**
 * 取得會員目前的訊號；舊訊號符合換組條件時換一組。
 * refresh＝會員按「免遊結束，換一組」（有冷卻時間）。
 */
export async function currentSignal(ctx: SignalContext, refresh = false): Promise<SignalResult> {
  return ctx.prisma.$transaction(
    async (tx) => {
      // 每位會員同時只有一則有效訊號：同一會員的讀取／換組依序執行
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assistant-signal:${ctx.userId}`}))`;
      const active = await tx.assistantSignal.findFirst({
        where: { userId: ctx.userId, gameId: ctx.gameId, endedAt: null },
        include: { room: true },
        orderBy: { issuedAt: 'desc' },
      });

      let replaced: SignalResult['replaced'] = null;
      if (active) {
        let reason: AssistantSignalEndReason | null;
        if (refresh) {
          const waitMs = active.issuedAt.getTime() + ctx.signal.refreshCooldownSeconds * 1000 - ctx.now.getTime();
          if (waitMs > 0) {
            throw new AppError('SIGNAL_REFRESH_COOLDOWN', `please wait ${Math.ceil(waitMs / 1000)} seconds`, 429);
          }
          reason = 'member_refresh';
        } else {
          reason = endReasonFor(active, active.room, ctx.now, ctx.freshness, ctx.signal);
        }
        if (!reason) return { signal: present(active), replaced: null, message: null, disclaimer: SIGNAL_DISCLAIMER };
        await tx.assistantSignal.update({ where: { id: active.id }, data: { endedAt: ctx.now, endReason: reason } });
        replaced = { reason, message: END_MESSAGES[reason] };
      }

      const next = await issue(tx, ctx, active?.roomId ?? null);
      return {
        signal: next ? present(next) : null,
        replaced,
        message: next ? null : '目前沒有符合條件的空台，稍後資料更新再試',
        disclaimer: SIGNAL_DISCLAIMER,
      };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}
