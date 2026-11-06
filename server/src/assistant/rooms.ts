import { Prisma, type PrismaClient, type RoomStatus } from '@prisma/client';
import { SNAPSHOT_RETENTION_HOURS } from '../collector/atg/store.js';
import type { FreshnessSettings } from './settings.js';

export { readFreshnessSettings, type FreshnessSettings } from './settings.js';

// 會員端房間資料（計劃 M3、1.5）。只讀 collector 寫入的 Room／RoomSnapshot。
// 新鮮度分兩層：列表層（狀態、今日 RTP）每輪更新；細項層（未開轉數、下注額…）輪流抓取。
// 列表層逾時：不顯示狀態、不能用狀態篩選（之後也不參與推薦與訊號）；細項層逾時：前端標示「資料較舊」。

export const ROOM_SORTS = ['roomNo', 'score', 'rtp', 'unopened', 'todayBet'] as const;
export type RoomSort = (typeof ROOM_SORTS)[number];

// 白名單：ORDER BY 只能是這幾個固定運算式
// score 不在 SQL 排序（分數是即時算的），見 listRooms
const ORDER_BY: Record<Exclude<RoomSort, 'score'>, Prisma.Sql> = {
  roomNo: Prisma.sql`length(r."roomNo"), r."roomNo"`,
  rtp: Prisma.sql`r."todayRtp" DESC NULLS LAST, length(r."roomNo"), r."roomNo"`,
  unopened: Prisma.sql`r."unopenedSpins" DESC NULLS LAST, length(r."roomNo"), r."roomNo"`,
  todayBet: Prisma.sql`r."todayBet" DESC NULLS LAST, length(r."roomNo"), r."roomNo"`,
};

export interface RoomRow {
  id: string;
  roomNo: string;
  status: RoomStatus | null;
  todayRtp: string | null;
  listCapturedAt: Date | null;
  unopenedSpins: number | null;
  prev1Spins: number | null;
  prev2Spins: number | null;
  todayBet: string | null;
  thirtyDayBet: string | null;
  thirtyDayRtp: string | null;
  detailCapturedAt: Date | null;
}

export interface RoomView {
  id: string;
  roomNo: string;
  /** 列表層逾時時為 null（不顯示空台／使用中） */
  status: RoomStatus | null;
  todayRtp: string | null;
  listCapturedAt: string | null;
  stale: boolean;
  unopenedSpins: number | null;
  prev1Spins: number | null;
  prev2Spins: number | null;
  todayBet: string | null;
  thirtyDayBet: string | null;
  thirtyDayRtp: string | null;
  detailCapturedAt: string | null;
  detailStale: boolean;
}

/** 房間 id → 顯示分數與精品標記（只含列表層未逾時的房間；見 board.ts） */
export type ScoreMap = Map<string, { score: number; premium: boolean }>;

export interface ScoredRoomView extends RoomView {
  /** 綜合分數（顯示分數 83–98，見 toDisplayScore）；列表層逾時的房間為 null */
  score: number | null;
  /** 未逾時空台中分數前 N%（精品） */
  premium: boolean;
}

export const withScore = (room: RoomView, scores: ScoreMap): ScoredRoomView => {
  const s = scores.get(room.id);
  return { ...room, score: s?.score ?? null, premium: s?.premium ?? false };
};

/** 房號數字順序（"001" < "200" < "1001"） */
export const roomNoCompare = (a: { roomNo: string }, b: { roomNo: string }) =>
  a.roomNo.length - b.roomNo.length || (a.roomNo < b.roomNo ? -1 : a.roomNo > b.roomNo ? 1 : 0);

const olderThan = (at: Date | null, now: Date, seconds: number) =>
  !at || now.getTime() - at.getTime() > seconds * 1000;

export function toRoomView(row: RoomRow, now: Date, f: FreshnessSettings): RoomView {
  const stale = olderThan(row.listCapturedAt, now, f.listMaxAgeSeconds);
  return {
    id: row.id,
    roomNo: row.roomNo,
    status: stale ? null : row.status,
    todayRtp: row.todayRtp,
    listCapturedAt: row.listCapturedAt?.toISOString() ?? null,
    stale,
    unopenedSpins: row.unopenedSpins,
    prev1Spins: row.prev1Spins,
    prev2Spins: row.prev2Spins,
    todayBet: row.todayBet,
    thirtyDayBet: row.thirtyDayBet,
    thirtyDayRtp: row.thirtyDayRtp,
    detailCapturedAt: row.detailCapturedAt?.toISOString() ?? null,
    detailStale: olderThan(row.detailCapturedAt, now, f.detailMaxAgeSeconds),
  };
}

// numeric 欄位以字串取出（保留兩位小數，不經浮點數）
export const ROOM_COLUMNS = Prisma.sql`
  r.id, r."roomNo", r.status, r."todayRtp"::text AS "todayRtp", r."listCapturedAt",
  r."unopenedSpins", r."prev1Spins", r."prev2Spins",
  r."todayBet"::text AS "todayBet", r."thirtyDayBet"::text AS "thirtyDayBet",
  r."thirtyDayRtp"::text AS "thirtyDayRtp", r."detailCapturedAt"`;

export interface GameView {
  id: string;
  code: string;
  name: string;
  provider: { code: string; name: string };
  roomCount: number;
  /** 最近一次列表層更新時間 */
  updatedAt: string | null;
  /** 整個遊戲都逾時（採集中斷）：前端顯示「資料暫停更新」 */
  stale: boolean;
}

export async function listGames(prisma: PrismaClient, now: Date, f: FreshnessSettings): Promise<GameView[]> {
  const games = await prisma.game.findMany({
    where: { enabled: true, provider: { enabled: true } },
    include: { provider: true },
    orderBy: { createdAt: 'asc' },
  });
  const stats = await prisma.room.groupBy({
    by: ['gameId'],
    where: { enabled: true, gameId: { in: games.map((g) => g.id) } },
    _count: { _all: true },
    _max: { listCapturedAt: true },
  });
  return games.map((g) => {
    const s = stats.find((x) => x.gameId === g.id);
    const updatedAt = s?._max.listCapturedAt ?? null;
    return {
      id: g.id,
      code: g.code,
      name: g.name,
      provider: { code: g.provider.code, name: g.provider.name },
      roomCount: s?._count._all ?? 0,
      updatedAt: updatedAt?.toISOString() ?? null,
      stale: olderThan(updatedAt, now, f.listMaxAgeSeconds),
    };
  });
}

export interface RoomQuery {
  gameId: string;
  status?: RoomStatus;
  /** 房號包含此字串 */
  q?: string;
  sort: RoomSort;
  page: number;
  pageSize: number;
}

export async function listRooms(
  prisma: PrismaClient,
  query: RoomQuery,
  now: Date,
  f: FreshnessSettings,
  scores: ScoreMap,
): Promise<{ items: ScoredRoomView[]; total: number }> {
  const conds: Prisma.Sql[] = [Prisma.sql`r."gameId" = ${query.gameId}`, Prisma.sql`r.enabled`];
  if (query.q) {
    const escaped = query.q.replace(/[\\%_]/g, (m) => `\\${m}`);
    conds.push(Prisma.sql`r."roomNo" LIKE ${`%${escaped}%`}`);
  }
  if (query.status) {
    // 用狀態篩選時只列出資料未逾時的房間
    const freshSince = new Date(now.getTime() - f.listMaxAgeSeconds * 1000);
    conds.push(Prisma.sql`r.status = ${query.status}::"RoomStatus"`);
    conds.push(Prisma.sql`r."listCapturedAt" >= ${freshSince}`);
  }
  const where = Prisma.join(conds, ' AND ');
  const offset = (query.page - 1) * query.pageSize;

  if (query.sort === 'score') {
    // 分數即時計算：取出全部符合條件的房間（單一遊戲約 4,500 台）在記憶體排序後分頁；逾時（無分數）排最後
    const rows = await prisma.$queryRaw<RoomRow[]>`SELECT ${ROOM_COLUMNS} FROM "Room" r WHERE ${where}`;
    const items = rows
      .map((r) => withScore(toRoomView(r, now, f), scores))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || roomNoCompare(a, b));
    return { items: items.slice(offset, offset + query.pageSize), total: items.length };
  }

  const [rows, count] = await Promise.all([
    prisma.$queryRaw<RoomRow[]>`
      SELECT ${ROOM_COLUMNS} FROM "Room" r WHERE ${where}
      ORDER BY ${ORDER_BY[query.sort]}
      LIMIT ${query.pageSize} OFFSET ${offset}`,
    prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Room" r WHERE ${where}`,
  ]);
  return { items: rows.map((r) => withScore(toRoomView(r, now, f), scores)), total: Number(count[0]?.n ?? 0) };
}

export interface TrendPoint {
  capturedAt: string;
  status: RoomStatus;
  todayRtp: string;
  unopenedSpins: number | null;
  todayBet: string | null;
}

/** 走勢區間：近 24 小時或整個保存期限（3 天） */
export const TREND_RANGES = { '24h': 24, '3d': SNAPSHOT_RETENTION_HOURS } as const;
export type TrendRange = keyof typeof TREND_RANGES;

/** 單一房間＋走勢（RoomSnapshot 只保存 3 天）。房間或遊戲停用時回 null。 */
export async function getRoomDetail(
  prisma: PrismaClient,
  roomId: string,
  now: Date,
  f: FreshnessSettings,
  scoresFor: (gameId: string) => Promise<ScoreMap>,
  range: TrendRange = '24h',
): Promise<{ game: { code: string; name: string }; room: ScoredRoomView; trend: TrendPoint[] } | null> {
  const [row] = await prisma.$queryRaw<(RoomRow & { gameId: string; gameCode: string; gameName: string })[]>`
    SELECT ${ROOM_COLUMNS}, g.id AS "gameId", g.code AS "gameCode", g.name AS "gameName"
    FROM "Room" r
    JOIN "Game" g ON g.id = r."gameId"
    JOIN "GameProvider" p ON p.id = g."providerId"
    WHERE r.id = ${roomId} AND r.enabled AND g.enabled AND p.enabled`;
  if (!row) return null;
  const since = new Date(now.getTime() - TREND_RANGES[range] * 3600_000);
  const trend = await prisma.$queryRaw<TrendPointRow[]>`
    SELECT "capturedAt", status, "todayRtp"::text AS "todayRtp", "unopenedSpins", "todayBet"::text AS "todayBet"
    FROM "RoomSnapshot" WHERE "roomId" = ${roomId} AND "capturedAt" >= ${since}
    ORDER BY "capturedAt"`;
  return {
    game: { code: row.gameCode, name: row.gameName },
    room: withScore(toRoomView(row, now, f), await scoresFor(row.gameId)),
    trend: trend.map((t) => ({ ...t, capturedAt: t.capturedAt.toISOString() })),
  };
}

interface TrendPointRow extends Omit<TrendPoint, 'capturedAt'> {
  capturedAt: Date;
}
