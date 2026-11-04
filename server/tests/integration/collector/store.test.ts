import { beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../../src/db.js';
import { encryptCredential } from '../../../src/assistant/credentials.js';
import { ensureGame, pickDetailTargets, pruneSnapshots, saveRound } from '../../../src/collector/atg/store.js';
import { loadCredentials, readCollectorSettings } from '../../../src/collector/settings.js';
import type { ListRoom, RoomDetail } from '../../../src/collector/atg/parse.js';
import { resetDb } from '../../helpers/db.js';

const GAME = { providerCode: 'atg', providerName: 'ATG', code: 'golden-seth', name: '戰神賽特 II' };

const room = (roomNo: string, sourceRoomId: string, todayRtp = '96.50', status: ListRoom['status'] = 'idle'): ListRoom => ({
  roomNo,
  sourceRoomId,
  status,
  todayRtp,
});

const detail = (roomNo: string, unopenedSpins: number): RoomDetail => ({
  roomNo,
  unopenedSpins,
  prev1Spins: 2,
  prev2Spins: 4,
  todayBet: '231384.80',
  thirtyDayBet: '132214952.99',
  todayRtp: '92.31',
  thirtyDayRtp: '94.45',
});

async function round(gameId: string, capturedAt: Date, rooms: ListRoom[], details: RoomDetail[]) {
  const run = await prisma.collectorRun.create({ data: { gameId } });
  await saveRound(prisma, { runId: run.id, gameId, capturedAt, rooms, details, durationMs: 1000 });
  return run.id;
}

// 每個測試會跑好幾輪寫入；測試 DB 在遠端（Railway）時單一測試可能超過預設 15 秒
describe('collector store', { timeout: 60_000 }, () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('upserts rooms, keeps earlier detail when a round has none, writes snapshots', async () => {
    const game = await ensureGame(prisma, GAME);
    const t1 = new Date('2026-11-03T02:00:00.000Z');
    const run1 = await round(game.id, t1, [room('001', '307041', '121.14', 'busy'), room('002', '308142')], [detail('001', 109)]);

    const t2 = new Date('2026-11-03T02:10:00.000Z');
    const run2 = await round(game.id, t2, [room('001', '307041', '120.00', 'locked'), room('002', '308142')], [detail('002', 7)]);

    const r1 = await prisma.room.findUniqueOrThrow({ where: { gameId_roomNo: { gameId: game.id, roomNo: '001' } } });
    expect(r1.status).toBe('locked');
    expect(r1.todayRtp?.toString()).toBe('120');
    expect(r1.listCapturedAt?.toISOString()).toBe(t2.toISOString());
    // 第二輪沒抓 001 的細項：保留第一輪的值與時間
    expect(r1.unopenedSpins).toBe(109);
    expect(r1.thirtyDayBet?.toString()).toBe('132214952.99');
    expect(r1.detailCapturedAt?.toISOString()).toBe(t1.toISOString());

    const r2 = await prisma.room.findUniqueOrThrow({ where: { gameId_roomNo: { gameId: game.id, roomNo: '002' } } });
    expect(r2.unopenedSpins).toBe(7);
    expect(r2.detailCapturedAt?.toISOString()).toBe(t2.toISOString());

    expect(await prisma.roomSnapshot.count({ where: { collectorRunId: run1 } })).toBe(2);
    const snap = await prisma.roomSnapshot.findFirstOrThrow({ where: { collectorRunId: run2, roomId: r1.id } });
    expect(snap.unopenedSpins).toBeNull(); // 該輪沒抓細項

    const run = await prisma.collectorRun.findUniqueOrThrow({ where: { id: run2 } });
    expect(run.status).toBe('succeeded');
    expect(run.evalStatus).toBe('pending');
    expect(run.roomsListed).toBe(2);
    expect(run.roomsDetailed).toBe(1);
  });

  it('dedupes a room number seen twice in one round (keeps the last)', async () => {
    const game = await ensureGame(prisma, GAME);
    const runId = await round(game.id, new Date(), [room('001', 'a', '90.00'), room('001', 'a', '91.00')], []);
    const r = await prisma.room.findFirstOrThrow({ where: { gameId: game.id, roomNo: '001' } });
    expect(r.todayRtp?.toString()).toBe('91');
    expect((await prisma.collectorRun.findUniqueOrThrow({ where: { id: runId } })).roomsListed).toBe(1);
  });

  it('allows the source to reassign a roomId to another room', async () => {
    const game = await ensureGame(prisma, GAME);
    await round(game.id, new Date(), [room('001', '1'), room('002', '2')], []);
    await round(game.id, new Date(), [room('001', '2'), room('002', '1')], []);
    const rooms = await prisma.room.findMany({ where: { gameId: game.id }, orderBy: { roomNo: 'asc' } });
    expect(rooms.map((r) => r.sourceRoomId)).toEqual(['2', '1']);
  });

  it('picks never-detailed rooms first, then oldest, skips disabled, sorted by page desc', async () => {
    const game = await ensureGame(prisma, GAME);
    await round(game.id, new Date('2026-11-03T01:00:00Z'), [room('001', 'a'), room('2501', 'b')], [detail('001', 1), detail('2501', 1)]);
    await round(game.id, new Date('2026-11-03T02:00:00Z'), [room('001', 'a'), room('2501', 'b')], [detail('2501', 1)]);
    await round(game.id, new Date('2026-11-03T03:00:00Z'), [room('001', 'a'), room('2501', 'b'), room('4100', 'c')], []);
    await prisma.room.create({ data: { gameId: game.id, roomNo: '1500', sourceRoomId: 'd', enabled: false } });

    const rooms = [room('001', 'a'), room('1500', 'd'), room('2501', 'b'), room('4100', 'c'), room('4099', 'e')];
    // 4099 不在 DB、4100 從未抓細項 → 最優先；其次 001（最舊）；1500 停用不抓
    expect(await pickDetailTargets(prisma, game.id, rooms, 3)).toEqual(['4099', '4100', '001']);
    expect(await pickDetailTargets(prisma, game.id, rooms, 10)).toEqual(['4099', '4100', '2501', '001']);
  });

  it('prunes snapshots older than 3 days', async () => {
    const game = await ensureGame(prisma, GAME);
    await round(game.id, new Date('2026-10-31T00:59:59Z'), [room('001', 'a')], []);
    await round(game.id, new Date('2026-10-31T01:00:01Z'), [room('001', 'a')], []);
    expect(await pruneSnapshots(prisma, new Date('2026-11-03T01:00:00Z'))).toBe(1);
    expect(await prisma.roomSnapshot.count()).toBe(1);
  });

  it('reads settings with defaults and validation', async () => {
    expect(await readCollectorSettings(prisma)).toEqual({ intervalMinutes: 10, detailBatchSize: 1000 });
    await prisma.appSetting.createMany({
      data: [
        { key: 'atgCollectIntervalMinutes', value: '20' },
        { key: 'atgDetailBatchSize', value: 'abc' },
      ],
    });
    expect(await readCollectorSettings(prisma)).toEqual({ intervalMinutes: 20, detailBatchSize: 1000 });
  });

  it('loads credentials from the DB first, then env', async () => {
    const keyRaw = randomBytes(32).toString('base64');
    const key = Buffer.from(keyRaw, 'base64');
    const env = {
      COLLECTOR_CREDENTIALS_KEY: keyRaw,
      ATG_COLLECTOR_CASINO_URL: 'https://env.example',
      ATG_COLLECTOR_ACCOUNT: 'envuser',
      ATG_COLLECTOR_PASSWORD: "'envpass'",
    };
    expect(await loadCredentials(prisma, env)).toEqual({
      accountId: null,
      casinoUrl: 'https://env.example',
      account: 'envuser',
      password: 'envpass',
    });

    const row = await prisma.collectorAccount.create({
      data: {
        label: '採集帳號',
        casinoUrl: 'https://db.example',
        accountEnc: encryptCredential('dbuser', key),
        passwordEnc: encryptCredential('dbpass', key),
      },
    });
    expect(await loadCredentials(prisma, env)).toEqual({
      accountId: row.id,
      casinoUrl: 'https://db.example',
      account: 'dbuser',
      password: 'dbpass',
    });

    // DB 有帳號但金鑰缺失或不符：明確報 CREDENTIALS_INVALID，不改用環境變數
    await expect(loadCredentials(prisma, { ...env, COLLECTOR_CREDENTIALS_KEY: undefined })).rejects.toMatchObject({
      code: 'CREDENTIALS_INVALID',
    });
    await expect(
      loadCredentials(prisma, { ...env, COLLECTOR_CREDENTIALS_KEY: randomBytes(32).toString('base64') }),
    ).rejects.toMatchObject({ code: 'CREDENTIALS_INVALID' });

    await prisma.collectorAccount.update({ where: { id: row.id }, data: { enabled: false } });
    expect((await loadCredentials(prisma, env))?.accountId).toBeNull();
    expect(await loadCredentials(prisma, {})).toBeNull();
  });
});
