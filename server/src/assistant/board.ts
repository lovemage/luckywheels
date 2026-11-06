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
  const scores = scoreRooms(
    views.map((r) => ({
      id: r.id,
      values: {
        todayRtp: num(r.todayRtp),
        // 細項層逾時的值視同缺值（以 0.5 計，不產生理由）
        unopened: r.detailStale ? null : num(r.unopenedSpins),
        thirtyDayRtp: r.detailStale ? null : num(r.thirtyDayRtp),
        todayBet: r.detailStale ? null : num(r.todayBet),
      },
    })),
    weights,
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
