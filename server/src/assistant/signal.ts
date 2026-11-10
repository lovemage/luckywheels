import { createHash, randomInt } from 'node:crypto';
import type { AssistantSignal, AssistantSignalEndReason, Prisma, PrismaClient, Room } from '@prisma/client';
import { AppError } from '../errors.js';
import { loadScoreBoard, type ScoreBoard, type ScoredRoom } from './board.js';
import { roomNoCompare } from './rooms.js';
import { toDisplayScore } from './scoring.js';
import type { FreshnessSettings, RecommendSettings, SignalSettings } from './settings.js';

// 曜金訊號（計劃 M3 訊號草案；2026-11-09 改為「TOP5 其中一台的房間訊號」）：
// - 每則綁一間「發出當下」首頁精選空台 TOP5 裡、分數 ≥ 門檻的空台，符號＝那台的第 1 組房間訊號（roomSignalFor），
//   所以會員從 TOP5 逐台查房間訊號，對得上的就是那台
// - 會員端不顯示綁定的房間，後台可追查；強度 % 由綁定房間的分數換算，不是亂數
// - 換組條件（任一成立）：會員按「免遊結束，換一組」、綁定房間開過免遊、今日 RTP 變動達門檻、
//   房間變成有人／被預約／停用、資料逾時、掉出 TOP5、台北時間換日（房間訊號每天換）
// - 每位會員同時只有一則有效訊號；在讀取時檢查換組條件（之後的推播 worker 沿用 endReasonFor）

/** 戰神賽特 II 的盤面符號（圖片 public/assets/assistant/atg/symbol_01–09、15、16.webp；倍數球不列入） */
// 大圖：一般高分符號＋兩種 Scatter（甲蟲、彩甲），門檻是「剛好等於」；寶石門檻是「大於等於」（2026-11-10 業主）
export const HIGH_SYMBOLS = ['eye', 'cobra', 'bow', 'sickle'] as const;
export const GEM_SYMBOLS = ['gem_yellow', 'gem_red', 'gem_purple', 'gem_blue', 'gem_green'] as const;
/** scarab＝甲蟲（金色 Scatter，symbol_15，盤面最多 3 個，4 個就進免遊）；scarab_color＝彩甲（symbol_16，最多 1 個） */
export const SCATTER_SYMBOLS = ['scarab', 'scarab_color'] as const;
export const SIGNAL_SYMBOLS = [...HIGH_SYMBOLS, ...SCATTER_SYMBOLS, ...GEM_SYMBOLS] as const;
export type SignalSymbol = (typeof SIGNAL_SYMBOLS)[number];
export interface SignalSymbolPick {
  symbol: SignalSymbol;
  /** 一轉結束時的盤面數量門檻：大圖要剛好等於、寶石要大於等於 */
  count: number;
}

export const isGem = (s: string) => (GEM_SYMBOLS as readonly string[]).includes(s);

// 一轉結束時的大約機率。2026-11-09 實測盤面（docs/plans/2026-11-09-board-signal-recon.md），九種一般符號分布相近，取平均；
// Scatter 樣本很少，只是粗估。用來讓一般訊號的整組達標機率落在合理範圍。
/** 寶石：至少 k 個 */
const P_AT_LEAST: Record<number, number> = { 3: 0.62, 4: 0.45, 5: 0.27, 6: 0.14 };
/** 高分符號：剛好 k 個 */
const P_EXACT_HIGH: Record<number, number> = { 3: 0.15, 4: 0.14, 5: 0.11, 6: 0.09 };
/** Scatter：剛好 k 個 */
const P_EXACT_SCATTER: Record<string, Record<number, number>> = {
  scarab: { 1: 0.08, 2: 0.03, 3: 0.02 },
  scarab_color: { 1: 0.04 },
};
const COUNT_MIN = 3;
const COUNT_MAX = 6;
/** 一般訊號整組（各符號都達標）的大約機率：每轉 4%–15%，平均 7–25 轉碰到一次 */
const HIT_RATE: [number, number] = [0.04, 0.15];
const pOf = (x: SignalSymbolPick) =>
  isGem(x.symbol)
    ? (P_AT_LEAST[x.count] ?? 0)
    : (P_EXACT_SCATTER[x.symbol]?.[x.count] ?? P_EXACT_HIGH[x.count] ?? 0);
export const hitRate = (picks: SignalSymbolPick[]) => picks.reduce((p, x) => p * pOf(x), 1);

/** 含 Scatter 的訊號比例（每組獨立抽） */
const SCATTER_SET_RATE = 0.25;
/** Scatter 組合（甲蟲最多 3 個、彩甲最多 1 個；彩甲只搭 1–2 個甲蟲，避免 3 甲蟲＋彩甲直接觸發），權重越大越常出現 */
const SCATTER_COMBOS: { weight: number; picks: SignalSymbolPick[] }[] = [
  { weight: 30, picks: [{ symbol: 'scarab', count: 1 }] },
  { weight: 25, picks: [{ symbol: 'scarab', count: 2 }] },
  { weight: 5, picks: [{ symbol: 'scarab', count: 3 }] },
  { weight: 20, picks: [{ symbol: 'scarab_color', count: 1 }] },
  { weight: 10, picks: [{ symbol: 'scarab', count: 1 }, { symbol: 'scarab_color', count: 1 }] },
  { weight: 10, picks: [{ symbol: 'scarab', count: 2 }, { symbol: 'scarab_color', count: 1 }] },
];

export const SIGNAL_DISCLAIMER = '數據攻略僅供參考';

const END_MESSAGES: Record<AssistantSignalEndReason, string> = {
  member_refresh: '已換一組新訊號',
  bonus_detected: '機台已開過免遊，已換一組新訊號',
  rtp_changed: '機台數據變動，已換一組新訊號',
  room_unavailable: '機台已有人使用，已換一組新訊號',
  data_stale: '數據暫停更新，已換一組新訊號',
  left_top: '機台已不在 TOP5，已換一組新訊號',
  day_changed: '房間訊號每日更新，已換一組新訊號',
};

/** 首頁「精選空台 TOP 5」的筆數；曜金訊號只綁這幾台 */
export const SIGNAL_TOP_SIZE = 5;

/** 與首頁 TOP5 相同的排序（空台、顯示分數高到低、房號）；listRooms sort=score 也是這個順序 */
export function topIdle(board: ScoreBoard, n = SIGNAL_TOP_SIZE): ScoredRoom[] {
  return board.rooms
    .filter((x) => x.room.status === 'idle')
    .map((x) => ({ x, d: toDisplayScore(x.score.score) }))
    .sort((a, b) => b.d - a.d || roomNoCompare(a.x.room, b.x.room))
    .slice(0, n)
    .map((v) => v.x);
}

const sameSymbols = (a: unknown, b: SignalSymbolPick[]) =>
  Array.isArray(a) &&
  a.length === b.length &&
  (a as SignalSymbolPick[]).every((x, i) => x?.symbol === b[i]!.symbol && x?.count === b[i]!.count);

type Rand = (min: number, maxExclusive: number) => number;

const bySymbolOrder = (a: SignalSymbolPick, b: SignalSymbolPick) => SIGNAL_SYMBOLS.indexOf(a.symbol) - SIGNAL_SYMBOLS.indexOf(b.symbol);

/**
 * 一組訊號（2026-11-10 業主：大圖＝、寶石≥）：
 * - 一般（約 75%）：1 種高分符號（剛好 3–6 個）＋1–2 種寶石（至少 3–6 個），整組達標機率落在 HIT_RATE
 * - Scatter（約 25%）：甲蟲／彩甲組合（見 SCATTER_COMBOS）＋1 種寶石（至少 3–5 個），較少見
 * 大圖排前面、寶石在後。
 */
export function randomSymbols(rand: Rand = randomInt): SignalSymbolPick[] {
  const gems = [...GEM_SYMBOLS];
  const pickGem = () => gems.splice(rand(0, gems.length), 1)[0]!;
  if (rand(0, 1000) < SCATTER_SET_RATE * 1000) {
    let roll = rand(0, SCATTER_COMBOS.reduce((n, c) => n + c.weight, 0));
    const combo = SCATTER_COMBOS.find((c) => (roll -= c.weight) < 0)!;
    return [...combo.picks.map((x) => ({ ...x })), { symbol: pickGem(), count: rand(3, 6) }].sort(bySymbolOrder);
  }
  const high = HIGH_SYMBOLS[rand(0, HIGH_SYMBOLS.length)]!;
  const symbols: SignalSymbol[] = [high, pickGem()];
  if (rand(0, 2) === 1) symbols.push(pickGem());
  // 重抽數量直到整組機率落在範圍內；抽不到就用最低門檻（大圖 =3、寶石 ≥3，一定落在範圍內）
  for (let attempt = 0; attempt < 100; attempt++) {
    const picks = symbols.map((symbol) => ({ symbol, count: rand(COUNT_MIN, COUNT_MAX + 1) })).sort(bySymbolOrder);
    const p = hitRate(picks);
    if (p >= HIT_RATE[0] && p <= HIT_RATE[1]) return picks;
  }
  return symbols.map((symbol) => ({ symbol, count: COUNT_MIN })).sort(bySymbolOrder);
}

/** 由字串產生固定的亂數序列（同一個種子永遠得到同一組訊號） */
export function seededRand(seed: string): Rand {
  let s = createHash('sha256').update(seed).digest().readUInt32LE(0);
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return (min, maxExclusive) => min + Math.floor(next() * (maxExclusive - min));
}

const TAIPEI_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' });

/** 每間房每天依序有幾組房間訊號（買完免遊按「換一組」接下一組） */
export const ROOM_SIGNAL_SETS = 5;

/**
 * 房間訊號（App 遊戲內浮窗、網頁版查房號）：每間房一串 ROOM_SIGNAL_SETS 組，所有會員看到的相同。
 * 種子＝房間＋前一次開出免遊的轉數（開過免遊就整串換新）＋台北日期（每天換）＋第幾組，所以不必存資料表。
 * 第 1 組（index 0）的種子沿用改成多組以前的寫法，舊版 App 讀 symbols 拿到的就是第 1 組。
 */
export function roomSignalFor(
  room: { id: string; prev1Spins: number | null },
  now: Date,
  index = 0,
): { key: string; symbols: SignalSymbolPick[] } {
  const base = `${room.id}:${room.prev1Spins ?? '-'}:${TAIPEI_DATE.format(now)}`;
  const seed = index === 0 ? base : `${base}#${index}`;
  return { key: createHash('sha256').update(seed).digest('hex').slice(0, 12), symbols: randomSymbols(seededRand(seed)) };
}

export const roomSignalSets = (room: { id: string; prev1Spins: number | null }, now: Date) =>
  Array.from({ length: ROOM_SIGNAL_SETS }, (_, i) => roomSignalFor(room, now, i));

/** 目前格式的訊號（遊戲符號＋數量）；舊的金屬／寶石訊號回傳 false，讀取時無聲換新 */
const hasCurrentSymbols = (s: Pick<AssistantSignal, 'symbols'>) =>
  Array.isArray(s.symbols) &&
  (s.symbols as unknown as SignalSymbolPick[]).every(
    (x) => (SIGNAL_SYMBOLS as readonly string[]).includes(x?.symbol) && Number.isInteger(x?.count),
  );

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

async function issue(
  tx: Prisma.TransactionClient,
  ctx: SignalContext,
  board: ScoreBoard,
  excludeRoomId: string | null,
): Promise<AssistantSignal | null> {
  const top = topIdle(board).filter((x) => x.score.score >= ctx.signal.minScore);
  // 換組時避開剛結束的那台；TOP5 只剩那台時仍可再發（符號會不同或換日）
  const candidates = top.length > 1 ? top.filter((x) => x.room.id !== excludeRoomId) : top;
  if (candidates.length === 0) return null;
  // 同一間房同時有效的訊號數有上限，分散會員；TOP5 都滿了就挑目前最少人綁的那幾台
  const busy = await tx.assistantSignal.groupBy({
    by: ['roomId'],
    where: { endedAt: null, roomId: { in: candidates.map((x) => x.room.id) } },
    _count: { _all: true },
  });
  const load = new Map(busy.map((b) => [b.roomId, b._count._all]));
  const loadOf = (x: ScoredRoom) => load.get(x.room.id) ?? 0;
  let open = candidates.filter((x) => loadOf(x) < ctx.signal.maxPerRoom);
  if (open.length === 0) {
    const least = Math.min(...candidates.map(loadOf));
    open = candidates.filter((x) => loadOf(x) === least);
  }
  const rand = ctx.rand ?? randomInt;
  const pick = open[rand(0, open.length)]!;
  return tx.assistantSignal.create({
    data: {
      userId: ctx.userId,
      gameId: ctx.gameId,
      roomId: pick.room.id,
      symbols: roomSignalFor(pick.room, ctx.now).symbols as unknown as Prisma.InputJsonValue,
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

      const board = await loadScoreBoard(tx, ctx.gameId, ctx.now, ctx.freshness, ctx.recommend.weights, ctx.recommend.premiumPercent);
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
          if (!reason && TAIPEI_DATE.format(active.issuedAt) !== TAIPEI_DATE.format(ctx.now)) reason = 'day_changed';
          if (!reason && !topIdle(board).some((x) => x.room.id === active.roomId)) reason = 'left_top';
        }
        // 舊格式訊號（2026-11-05 以前的寶石、2026-11-09 以前的金屬、改成房間訊號以前的隨機組合）：
        // 直接換成新訊號，不提示會員
        // 其他換組原因優先（照常提示）；只有格式不符時才無聲換新
        const legacy =
          !reason &&
          (!hasCurrentSymbols(active) || (active.room !== null && !sameSymbols(active.symbols, roomSignalFor(active.room, ctx.now).symbols)));
        if (legacy) reason = 'member_refresh';
        if (!reason) return { signal: present(active), replaced: null, message: null, disclaimer: SIGNAL_DISCLAIMER };
        await tx.assistantSignal.update({ where: { id: active.id }, data: { endedAt: ctx.now, endReason: reason } });
        replaced = legacy ? null : { reason, message: END_MESSAGES[reason] };
      }

      const next = await issue(tx, ctx, board, active?.roomId ?? null);
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
