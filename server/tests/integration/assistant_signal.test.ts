import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/index.js';
import { prisma } from '../../src/db.js';
import { signSession } from '../../src/auth/jwt.js';
import { SESSION_COOKIE } from '../../src/auth/cookies.js';
import { resetDb } from '../helpers/db.js';
import { roomSignalFor } from '../../src/assistant/signal.js';
import { createUser, grantAssistantPass } from '../helpers/factories.js';
import { adminHeaders, createAdmin } from '../helpers/admin.ts';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

async function member() {
  const u = await createUser({});
  await grantAssistantPass(u.id);
  return { user: u, headers: { cookie: `${SESSION_COOKIE}=${await signSession({ userId: u.id })}`, 'content-type': 'application/json' } };
}

// 同推薦測試：分數 002＝100（使用中）、001＝75、005＝50、003＝25、004＝0
async function seedRooms() {
  const provider = await prisma.gameProvider.create({ data: { code: 'atg', name: 'ATG' } });
  const game = await prisma.game.create({ data: { providerId: provider.id, code: 'golden-seth', name: '戰神賽特 II' } });
  const fresh = minutesAgo(5);
  const ids: Record<string, string> = {};
  for (const [roomNo, status, unopened, rtp, rtp30, bet] of [
    ['001', 'idle', 900, '50.00', '99.00', '9000.00'],
    ['002', 'busy', 1000, '40.00', '100.00', '10000.00'],
    ['003', 'idle', 500, '90.00', '97.00', '5000.00'],
    ['004', 'idle', 100, '200.00', '90.00', '100.00'],
    ['005', 'idle', 700, '70.00', '98.00', '7000.00'],
  ] as const) {
    const r = await prisma.room.create({
      data: {
        gameId: game.id, roomNo, sourceRoomId: `s${roomNo}`, status, todayRtp: rtp, listCapturedAt: fresh,
        unopenedSpins: unopened, prev1Spins: 300, prev2Spins: 500, todayBet: bet, thirtyDayRtp: rtp30, detailCapturedAt: fresh,
      },
    });
    ids[roomNo] = r.id;
  }
  return ids;
}

async function req(path: string, headers: Record<string, string>, method = 'GET', body?: unknown) {
  const r = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}

const setting = (key: string, value: string) =>
  prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });

const boundRoom = async (signalId: string) => (await prisma.assistantSignal.findUniqueOrThrow({ where: { id: signalId } })).roomId;

describe('assistant signals', { timeout: 120_000 }, () => {
  const savedFlag = process.env.DATA_ASSISTANT_ENABLED;

  beforeEach(async () => {
    await resetDb();
    process.env.DATA_ASSISTANT_ENABLED = 'true';
  });

  afterEach(() => {
    if (savedFlag === undefined) delete process.env.DATA_ASSISTANT_ENABLED;
    else process.env.DATA_ASSISTANT_ENABLED = savedFlag;
  });

  it('binds a signal to a qualifying idle room, hides the room and keeps it while valid', async () => {
    const ids = await seedRooms();
    const { headers } = await member();
    const first = await req('/api/assistant/signal', headers);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ replaced: null, message: null, disclaimer: '數據攻略僅供參考' });
    // 門檻 70：只有 001（75 分）符合；強度 30 + 60 × 0.75 = 75
    expect(first.body.signal.strength).toBe(75);
    expect(first.body.signal.symbols.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(first.body)).not.toContain(ids['001']!);
    expect(first.body.signal.roomNo).toBeUndefined();
    expect(await boundRoom(first.body.signal.id)).toBe(ids['001']);
    // 符號＝那台的第 1 組房間訊號
    const room001 = await prisma.room.findUniqueOrThrow({ where: { id: ids['001']! } });
    expect(first.body.signal.symbols).toEqual(roomSignalFor(room001, new Date()).symbols);
    const rs = await req('/api/assistant/room-signal?roomNo=001', headers);
    expect(rs.body.sets).toHaveLength(5);
    expect(rs.body.symbols).toEqual(first.body.signal.symbols);
    expect(rs.body.sets[0].symbols).toEqual(first.body.signal.symbols);

    const again = await req('/api/assistant/signal', headers);
    expect(again.body.signal.id).toBe(first.body.signal.id);
  });

  it('replaces the signal when the room is taken, opened a free game or its RTP moved', async () => {
    const ids = await seedRooms();
    await setting('assistantSignalMinScore', '20');
    const { headers } = await member();
    await setting('assistantSignalMaxPerRoom', '1');

    // 固定綁到 001：先讓其他房暫時不符合
    await prisma.room.updateMany({ where: { id: { in: [ids['003']!, ids['005']!] } }, data: { status: 'busy' } });
    const s1 = (await req('/api/assistant/signal', headers)).body.signal;
    expect(await boundRoom(s1.id)).toBe(ids['001']);
    await prisma.room.updateMany({ where: { id: { in: [ids['003']!, ids['005']!] } }, data: { status: 'idle' } });

    // 開過免遊：未開轉數歸零
    await prisma.room.update({ where: { id: ids['001']! }, data: { unopenedSpins: 5 } });
    const r2 = await req('/api/assistant/signal', headers);
    expect(r2.body.replaced).toEqual({ reason: 'bonus_detected', message: '機台已開過免遊，已換一組新訊號' });
    const room2 = await boundRoom(r2.body.signal.id);
    expect(room2).not.toBe(ids['001']);

    // 今日 RTP 變動 ≥ 5 個百分點
    const before = await prisma.room.findUniqueOrThrow({ where: { id: room2 } });
    await prisma.room.update({ where: { id: room2 }, data: { todayRtp: Number(before.todayRtp) + 6 } });
    const r3 = await req('/api/assistant/signal', headers);
    expect(r3.body.replaced.reason).toBe('rtp_changed');

    // 有人入座
    const room3 = await boundRoom(r3.body.signal.id);
    await prisma.room.update({ where: { id: room3 }, data: { status: 'busy' } });
    expect((await req('/api/assistant/signal', headers)).body.replaced.reason).toBe('room_unavailable');

    const ended = await prisma.assistantSignal.findMany({ where: { endedAt: { not: null } }, orderBy: { issuedAt: 'asc' } });
    expect(ended.map((s) => s.endReason)).toEqual(['bonus_detected', 'rtp_changed', 'room_unavailable']);
  });

  it('lets the member refresh after the cooldown, and reports when no room qualifies', async () => {
    const ids = await seedRooms();
    const { headers } = await member();
    await req('/api/assistant/signal', headers);
    const early = await req('/api/assistant/signal/refresh', headers, 'POST');
    expect(early.status).toBe(429);
    expect(early.body.error.code).toBe('SIGNAL_REFRESH_COOLDOWN');

    await setting('assistantSignalRefreshCooldownSeconds', '0');
    // 換組時避開剛才那間；但 001 是 TOP5 裡唯一符合的空台 → 仍綁回 001
    const r = await req('/api/assistant/signal/refresh', headers, 'POST');
    expect(r.body).toMatchObject({ replaced: { reason: 'member_refresh' }, message: null });
    expect(await boundRoom(r.body.signal.id)).toBe(ids['001']);

    // 資料逾時；之後沒有符合的空台 → 暫時沒有訊號
    await prisma.room.update({ where: { id: ids['001']! }, data: { listCapturedAt: minutesAgo(120) } });
    const stale = await req('/api/assistant/signal', headers);
    expect(stale.body).toMatchObject({ signal: null, replaced: { reason: 'data_stale' }, message: '目前沒有符合條件的空台，稍後資料更新再試' });
  });

  it('replaces the signal when the room drops out of the home TOP 5', async () => {
    const ids = await seedRooms();
    await setting('assistantSignalMinScore', '0');
    await setting('assistantSignalMaxPerRoom', '50');
    const { headers } = await member();
    // 固定綁到 004（0 分、TOP5 第 4 名）
    await prisma.room.updateMany({ where: { id: { in: [ids['001']!, ids['003']!, ids['005']!] } }, data: { status: 'busy' } });
    const s1 = (await req('/api/assistant/signal', headers)).body.signal;
    expect(await boundRoom(s1.id)).toBe(ids['004']);
    await prisma.room.updateMany({ where: { id: { in: [ids['001']!, ids['003']!, ids['005']!] } }, data: { status: 'idle' } });
    // 原始分數 55 以下都顯示 83（003、004、005 同分，依房號排）；多三台高分空台 → TOP5＝001、006–008、003，004 掉出
    const game = await prisma.game.findFirstOrThrow();
    for (const roomNo of ['006', '007', '008']) {
      await prisma.room.create({
        data: {
          gameId: game.id, roomNo, sourceRoomId: `s${roomNo}`, status: 'idle', todayRtp: '50.00', listCapturedAt: minutesAgo(5),
          unopenedSpins: 900, prev1Spins: 300, prev2Spins: 500, todayBet: '9000.00', thirtyDayRtp: '99.00', detailCapturedAt: minutesAgo(5),
        },
      });
    }
    const r = await req('/api/assistant/signal', headers);
    expect(r.body.replaced.reason).toBe('left_top');
    expect(await boundRoom(r.body.signal.id)).not.toBe(ids['004']);
  });

  it('spreads members across TOP 5 rooms, falling back to the least-bound room when all are full', async () => {
    const ids = await seedRooms();
    await setting('assistantSignalMinScore', '20');
    await setting('assistantSignalMaxPerRoom', '1');
    const bound: string[] = [];
    for (let i = 0; i < 4; i++) {
      const m = await member();
      bound.push(await boundRoom((await req('/api/assistant/signal', m.headers)).body.signal.id));
    }
    // 符合的空台 001、005、003：前三位各一台，第四位滿了仍拿得到（最少人綁的其中一台）
    expect(new Set(bound.slice(0, 3))).toEqual(new Set([ids['001'], ids['005'], ids['003']]));
    expect([ids['001'], ids['005'], ids['003']]).toContain(bound[3]);
  });

  it('admin can read and update recommend/signal settings and trace bound rooms', async () => {
    await seedRooms();
    const admin = await createAdmin();
    const ah = await adminHeaders(admin.id, admin.email);
    const { user, headers } = await member();
    await req('/api/assistant/signal', headers);

    const cur = (await req('/api/admin/assistant/settings', ah)).body;
    expect(cur.recommend.tiers).toHaveLength(3);
    expect(cur.signal).toMatchObject({ minScore: 70, rtpChangePoints: 5, strengthMin: 30, strengthMax: 90 });
    expect(cur.freshness).toEqual({ listMaxAgeSeconds: 1800, detailMaxAgeSeconds: 10800 });

    expect(cur.casino).toEqual({ testCasinoUrl: 'https://ck-3.hau888.net/mobile/sty4_home.php' });
    const badCasino = await req('/api/admin/assistant/settings', ah, 'PUT', { ...cur, casino: { testCasinoUrl: 'http://ck-3.hau888.net/' } });
    expect(badCasino.body.error.code).toBe('ASSISTANT_SETTINGS_INVALID');

    const bad = await req('/api/admin/assistant/settings', ah, 'PUT', { ...cur, signal: { ...cur.signal, strengthMin: 95 } });
    expect(bad.body.error.code).toBe('ASSISTANT_SETTINGS_INVALID');
    const badTiers = await req('/api/admin/assistant/settings', ah, 'PUT', {
      ...cur,
      recommend: { ...cur.recommend, tiers: [{ minPrincipal: 100, minScore: 60, maxMultiplier: 2 }] },
    });
    expect(badTiers.status).toBe(400);

    const next = { ...cur, recommend: { ...cur.recommend, multiplierStepScore: 4, count: 3 }, freshness: { listMaxAgeSeconds: 900, detailMaxAgeSeconds: 7200 } };
    const saved = await req('/api/admin/assistant/settings', ah, 'PUT', next);
    expect(saved.body.recommend).toMatchObject({ multiplierStepScore: 4, count: 3 });
    expect(saved.body.freshness.listMaxAgeSeconds).toBe(900);
    const casinoSaved = await req('/api/admin/assistant/settings', ah, 'PUT', { ...saved.body, casino: { testCasinoUrl: 'https://ck-9.example.net/mobile/sty4_home.php' } });
    expect(casinoSaved.body.casino.testCasinoUrl).toBe('https://ck-9.example.net/mobile/sty4_home.php');
    // 會員端不會拿到測試網址
    expect(JSON.stringify((await req('/api/assistant/me', headers)).body)).not.toContain('ck-9');
    // 會員端立即套用
    expect((await req('/api/assistant/recommend/config', headers)).body).toMatchObject({ multiplierStepScore: 4, count: 3 });
    expect(await prisma.adminActionLog.count({ where: { event: 'assistant.settings_updated' } })).toBe(2);

    const signals = (await req('/api/admin/assistant/signals', ah)).body.items;
    expect(signals[0]).toMatchObject({ userId: user.id, userName: user.nickname, roomNo: '001', scoreAtIssue: 75, endedAt: null });
  });
});
