import type { Prisma, PrismaClient } from '@prisma/client';
import { ROOM_COLUMNS, roomNoCompare, toRoomView, type RoomRow, type RoomView, type ScoreMap } from './rooms.js';
import { scoreRooms, toDisplayScore, type RoomScore, type ScoreWeights } from './scoring.js';
import type { FreshnessSettings } from './settings.js';

// 一個遊戲的分數排名：推薦、房間列表的分數欄與 sort=score、訊號綁房共用。
// 母體＝同遊戲、列表層未逾時的房間（所有狀態）；精品＝其中「空台」分數前 premiumPercent%。

export interface ScoredRoom {
  room: RoomView;
  score: RoomScore;
  premium: boolean;
}

export interface ScoreBoard {
  rooms: ScoredRoom[];
  map: ScoreMap;
}

const num = (v: string | number | null) => (v === null ? null : Number(v));

// 換日處理（2026-11-20 業主同意）：ATG 的「今日」數據在台北時間 24 點歸零。
// - 今日下注是細項層、輪流抓取，換日後一段時間內有些機台仍是昨天整天的累積值
//   → 細項在今天 00:00 前抓到的今日下注視同缺值（不比熱度、不產生理由），直到重新抓到
// - 開盤保護時段：00:00 起 MIDNIGHT_GUARD_MINUTES 分鐘內下注量少、今日 RTP 忽高忽低
//   → 今日 RTP、今日下注權重歸零，改以未開轉數、近 30 天 RTP 排序，也不產生這兩項理由
const TAIPEI_OFFSET_MS = 8 * 3_600_000;
const DAY_MS = 86_400_000;
export const MIDNIGHT_GUARD_MINUTES = 30;

/** 台北時間當天 00:00（台灣無日光節約時間，固定 UTC+8） */
export function taipeiDayStart(now: Date): Date {
  return new Date(Math.floor((now.getTime() + TAIPEI_OFFSET_MS) / DAY_MS) * DAY_MS - TAIPEI_OFFSET_MS);
}

export const inMidnightGuard = (now: Date) =>
  now.getTime() - taipeiDayStart(now).getTime() < MIDNIGHT_GUARD_MINUTES * 60_000;

export async function loadScoreBoard(
  prisma: PrismaClient | Prisma.TransactionClient,
  gameId: string,
  now: Date,
  f: FreshnessSettings,
  weights: ScoreWeights,
  premiumPercent: number,
): Promise<ScoreBoard> {
  const freshSince = new Date(now.getTime() - f.listMaxAgeSeconds * 1000);
  const rows = await prisma.$queryRaw<RoomRow[]>`
    SELECT ${ROOM_COLUMNS} FROM "Room" r
    WHERE r."gameId" = ${gameId} AND r.enabled AND r."listCapturedAt" >= ${freshSince}`;
  const views = rows.map((r) => toRoomView(r, now, f));
  const dayStart = taipeiDayStart(now).getTime();
  const guard = inMidnightGuard(now);
  const scores = scoreRooms(
    views.map((r) => ({
      id: r.id,
      values: {
        todayRtp: guard ? null : num(r.todayRtp),
        // 細項層逾時的值視同缺值（以 0.5 計，不產生理由）
        unopened: r.detailStale ? null : num(r.unopenedSpins),
        thirtyDayRtp: r.detailStale ? null : num(r.thirtyDayRtp),
        // 今天 00:00 前抓到的今日下注是昨天的數字
        todayBet:
          guard || r.detailStale || !r.detailCapturedAt || Date.parse(r.detailCapturedAt) < dayStart
            ? null
            : num(r.todayBet),
      },
    })),
    guard ? { ...weights, todayRtp: 0, todayBet: 0 } : weights,
  );

  const rooms = views
    .map((room) => ({ room, score: scores.get(room.id)!, premium: false }))
    .sort((a, b) => b.score.score - a.score.score || roomNoCompare(a.room, b.room));

  const idle = rooms.filter((x) => x.room.status === 'idle');
  const premiumCount = premiumPercent > 0 ? Math.ceil((idle.length * premiumPercent) / 100) : 0;
  for (const x of idle.slice(0, premiumCount)) x.premium = true;

  // rooms 內是原始分數（推薦、訊號用）；map 給房間列表與詳細資料，是會員看到的顯示分數
  const map: ScoreMap = new Map(rooms.map((x) => [x.room.id, { score: toDisplayScore(x.score.score), premium: x.premium }]));
  return { rooms, map };
}
