import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { ListRoom, RoomDetail } from './parse.js';
import { pageOfRoomNo } from './parse.js';

// 採集結果寫入 DB。一輪約 4,100 台，逐筆寫入在遠端 DB 上會花好幾分鐘，
// 所以每張表都用 unnest 陣列一次寫完（單一 SQL）。

export interface SaveRoundInput {
  runId: string;
  gameId: string;
  capturedAt: Date;
  rooms: ListRoom[];
  details: RoomDetail[];
  durationMs: number;
}

export async function ensureGame(
  prisma: PrismaClient,
  game: { providerCode: string; providerName: string; code: string; name: string },
) {
  const provider = await prisma.gameProvider.upsert({
    where: { code: game.providerCode },
    create: { code: game.providerCode, name: game.providerName },
    update: {},
  });
  return prisma.game.upsert({
    where: { providerId_code: { providerId: provider.id, code: game.code } },
    create: { providerId: provider.id, code: game.code, name: game.name },
    update: {},
  });
}

/**
 * 本輪要抓細項的機台：DB 還沒有的新機台與從未抓過細項的優先，其次細項最舊的；停用的機台不抓。
 * 選出後依分頁由後往前排序（列表讀完時停在最後一頁），減少切頁次數。
 */
export async function pickDetailTargets(
  prisma: PrismaClient,
  gameId: string,
  rooms: ListRoom[],
  batchSize: number,
): Promise<string[]> {
  const known = await prisma.room.findMany({
    where: { gameId },
    select: { roomNo: true, enabled: true, detailCapturedAt: true },
  });
  const byNo = new Map(known.map((r) => [r.roomNo, r]));
  const candidates = rooms
    .filter((r) => byNo.get(r.roomNo)?.enabled !== false)
    .map((r) => ({ roomNo: r.roomNo, at: byNo.get(r.roomNo)?.detailCapturedAt?.getTime() ?? -1 }));
  candidates.sort((a, b) => a.at - b.at || a.roomNo.localeCompare(b.roomNo));
  return candidates
    .slice(0, Math.max(0, batchSize))
    .map((c) => c.roomNo)
    .sort((a, b) => pageOfRoomNo(b) - pageOfRoomNo(a) || a.localeCompare(b));
}

/**
 * 單一 transaction：更新 Room（細項只在本輪有抓時覆寫）→ 寫 RoomSnapshot
 * → CollectorRun 標為 succeeded 並設 evalStatus = pending（計劃 1.3）。任一步失敗整批 rollback。
 */
export async function saveRound(prisma: PrismaClient, input: SaveRoundInput): Promise<void> {
  const detailByNo = new Map(input.details.map((d) => [d.roomNo, d]));
  // 同一機台號在一輪內出現兩次時保留最後一筆；否則 ON CONFLICT 會因同一列被更新兩次而讓整輪 rollback
  const uniqueRooms = [...new Map(input.rooms.map((r) => [r.roomNo, r])).values()];
  const rows = uniqueRooms.map((r) => ({ room: r, detail: detailByNo.get(r.roomNo) ?? null }));
  // Prisma 的 DateTime 欄位是不帶時區的 timestamp、存 UTC；ISO 字串轉 ::timestamp 會忽略 Z，正好是 UTC 時間。
  // 金額／百分比陣列以 text[] 傳入再於 SELECT 轉 numeric：Prisma 對「字串與 null 混合」的 numeric[] 參數編碼有誤（22P03）
  const at = input.capturedAt.toISOString();

  const ids = rows.map(() => randomUUID());
  const roomNos = rows.map((r) => r.room.roomNo);
  const sourceIds = rows.map((r) => r.room.sourceRoomId);
  const statuses = rows.map((r) => r.room.status);
  const rtps = rows.map((r) => r.room.todayRtp);
  const hasDetail = rows.map((r) => r.detail !== null);
  const unopened = rows.map((r) => r.detail?.unopenedSpins ?? null);
  const prev1 = rows.map((r) => r.detail?.prev1Spins ?? null);
  const prev2 = rows.map((r) => r.detail?.prev2Spins ?? null);
  const todayBets = rows.map((r) => r.detail?.todayBet ?? null);
  const thirtyBets = rows.map((r) => r.detail?.thirtyDayBet ?? null);
  const thirtyRtps = rows.map((r) => r.detail?.thirtyDayRtp ?? null);

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "Room" ("id", "gameId", "roomNo", "sourceRoomId", "status", "statusUpdatedAt", "todayRtp",
          "listCapturedAt", "unopenedSpins", "prev1Spins", "prev2Spins", "todayBet", "thirtyDayBet", "thirtyDayRtp",
          "detailCapturedAt", "updatedAt")
        SELECT r.id, ${input.gameId}, r.room_no, r.source_id, r.status::"RoomStatus", ${at}::timestamp(3), r.rtp::numeric,
          ${at}::timestamp(3), r.unopened, r.prev1, r.prev2, r.today_bet::numeric, r.thirty_bet::numeric, r.thirty_rtp::numeric,
          CASE WHEN r.has_detail THEN ${at}::timestamp(3) END, ${at}::timestamp(3)
        FROM unnest(${ids}::text[], ${roomNos}::text[], ${sourceIds}::text[], ${statuses}::text[], ${rtps}::text[],
          ${hasDetail}::boolean[], ${unopened}::int[], ${prev1}::int[], ${prev2}::int[], ${todayBets}::text[],
          ${thirtyBets}::text[], ${thirtyRtps}::text[])
          AS r(id, room_no, source_id, status, rtp, has_detail, unopened, prev1, prev2, today_bet, thirty_bet, thirty_rtp)
        ON CONFLICT ("gameId", "roomNo") DO UPDATE SET
          "sourceRoomId" = EXCLUDED."sourceRoomId",
          "status" = EXCLUDED."status",
          "statusUpdatedAt" = EXCLUDED."statusUpdatedAt",
          "todayRtp" = EXCLUDED."todayRtp",
          "listCapturedAt" = EXCLUDED."listCapturedAt",
          "unopenedSpins" = CASE WHEN EXCLUDED."detailCapturedAt" IS NULL THEN "Room"."unopenedSpins" ELSE EXCLUDED."unopenedSpins" END,
          "prev1Spins" = CASE WHEN EXCLUDED."detailCapturedAt" IS NULL THEN "Room"."prev1Spins" ELSE EXCLUDED."prev1Spins" END,
          "prev2Spins" = CASE WHEN EXCLUDED."detailCapturedAt" IS NULL THEN "Room"."prev2Spins" ELSE EXCLUDED."prev2Spins" END,
          "todayBet" = CASE WHEN EXCLUDED."detailCapturedAt" IS NULL THEN "Room"."todayBet" ELSE EXCLUDED."todayBet" END,
          "thirtyDayBet" = CASE WHEN EXCLUDED."detailCapturedAt" IS NULL THEN "Room"."thirtyDayBet" ELSE EXCLUDED."thirtyDayBet" END,
          "thirtyDayRtp" = CASE WHEN EXCLUDED."detailCapturedAt" IS NULL THEN "Room"."thirtyDayRtp" ELSE EXCLUDED."thirtyDayRtp" END,
          "detailCapturedAt" = COALESCE(EXCLUDED."detailCapturedAt", "Room"."detailCapturedAt"),
          "updatedAt" = EXCLUDED."updatedAt"`;

      await tx.$executeRaw`
        INSERT INTO "RoomSnapshot" ("roomId", "collectorRunId", "capturedAt", "status", "todayRtp", "unopenedSpins",
          "prev1Spins", "prev2Spins", "todayBet", "thirtyDayBet", "thirtyDayRtp")
        SELECT room."id", ${input.runId}, ${at}::timestamp(3), r.status::"RoomStatus", r.rtp::numeric, r.unopened, r.prev1,
          r.prev2, r.today_bet::numeric, r.thirty_bet::numeric, r.thirty_rtp::numeric
        FROM unnest(${roomNos}::text[], ${statuses}::text[], ${rtps}::text[], ${unopened}::int[], ${prev1}::int[],
          ${prev2}::int[], ${todayBets}::text[], ${thirtyBets}::text[], ${thirtyRtps}::text[])
          AS r(room_no, status, rtp, unopened, prev1, prev2, today_bet, thirty_bet, thirty_rtp)
        JOIN "Room" room ON room."gameId" = ${input.gameId} AND room."roomNo" = r.room_no`;

      await tx.collectorRun.update({
        where: { id: input.runId },
        data: {
          status: 'succeeded',
          finishedAt: new Date(),
          durationMs: input.durationMs,
          roomsListed: uniqueRooms.length,
          roomsDetailed: input.details.length,
          evalStatus: 'pending',
        },
      });
    },
    { timeout: 120_000 },
  );
}

/** 業主規定（2026-11-03 改為 3 天）：機台歷史資料只保存 3 天，超過即刪除；趨勢分析只用這段時間內的資料 */
export const SNAPSHOT_RETENTION_HOURS = 72;

/** 刪除超過保存期限的 RoomSnapshot；分批刪，避免一次鎖住大量資料列 */
export async function pruneSnapshots(prisma: PrismaClient, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - SNAPSHOT_RETENTION_HOURS * 3_600_000).toISOString();
  let total = 0;
  for (;;) {
    const deleted = await prisma.$executeRaw`
      DELETE FROM "RoomSnapshot" WHERE "id" IN (
        SELECT "id" FROM "RoomSnapshot" WHERE "capturedAt" < ${cutoff}::timestamp(3) LIMIT 20000)`;
    total += deleted;
    if (deleted < 20000) return total;
  }
}
