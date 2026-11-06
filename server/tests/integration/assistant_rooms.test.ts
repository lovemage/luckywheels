import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/index.js';
import { prisma } from '../../src/db.js';
import { signSession } from '../../src/auth/jwt.js';
import { SESSION_COOKIE } from '../../src/auth/cookies.js';
import { resetDb } from '../helpers/db.js';
import { createUser, grantAssistantPass } from '../helpers/factories.js';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

async function cookieFor(o: Parameters<typeof createUser>[0] = {}) {
  const u = await createUser(o);
  await grantAssistantPass(u.id);
  return { cookie: `${SESSION_COOKIE}=${await signSession({ userId: u.id })}` };
}

async function seedGame() {
  const provider = await prisma.gameProvider.create({ data: { code: 'atg', name: 'ATG' } });
  const game = await prisma.game.create({ data: { providerId: provider.id, code: 'golden-seth', name: '戰神賽特 II' } });
  const room = (roomNo: string, data: Record<string, unknown>) =>
    prisma.room.create({ data: { gameId: game.id, roomNo, sourceRoomId: `s${roomNo}`, ...data } });
  const fresh = minutesAgo(5);
  const rooms = {
    r001: await room('001', { status: 'idle', todayRtp: '96.50', listCapturedAt: fresh, unopenedSpins: 10, todayBet: '1000.00', detailCapturedAt: minutesAgo(30) }),
    r200: await room('200', { status: 'busy', todayRtp: '114.44', listCapturedAt: fresh, unopenedSpins: 300, todayBet: '279185.00', detailCapturedAt: minutesAgo(400) }),
    r1001: await room('1001', { status: 'idle', todayRtp: '1379.58', listCapturedAt: fresh }),
    // 列表層逾時（採集 2 小時沒更新到這台）
    r1500: await room('1500', { status: 'idle', todayRtp: '90.00', listCapturedAt: minutesAgo(120), unopenedSpins: 999 }),
    // 停用
    r2000: await room('2000', { status: 'idle', todayRtp: '99.00', listCapturedAt: fresh, enabled: false }),
  };
  return { provider, game, rooms };
}

async function get(path: string, headers: Record<string, string>) {
  const r = await app.request(path, { headers });
  return { status: r.status, body: await r.json() };
}

describe('member assistant rooms API', { timeout: 60_000 }, () => {
  const savedFlag = process.env.DATA_ASSISTANT_ENABLED;

  beforeEach(async () => {
    await resetDb();
    process.env.DATA_ASSISTANT_ENABLED = 'true';
  });

  afterEach(() => {
    if (savedFlag === undefined) delete process.env.DATA_ASSISTANT_ENABLED;
    else process.env.DATA_ASSISTANT_ENABLED = savedFlag;
  });

  it('applies the feature flag and member gates', async () => {
    const ok = await cookieFor();
    expect((await get('/api/assistant/games', {})).status).toBe(401);
    expect((await get('/api/assistant/games', ok)).status).toBe(200);
    expect((await get('/api/assistant/games', await cookieFor({ accountType: 'blacklisted' }))).body.error.code).toBe('USER_BLACKLISTED');
    expect((await get('/api/assistant/games', await cookieFor({ accountType: 'pending' }))).body.error.code).toBe('ACCOUNT_PENDING_APPROVAL');
    expect((await get('/api/assistant/games', await cookieFor({ entertainmentMemberCode: null }))).body.error.code).toBe('ONBOARDING_REQUIRED');
    process.env.DATA_ASSISTANT_ENABLED = 'false';
    expect((await get('/api/assistant/games', ok)).status).toBe(404);
  });

  it('lists games with room counts and freshness', async () => {
    await seedGame();
    const { body } = await get('/api/assistant/games', await cookieFor());
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ code: 'golden-seth', name: '戰神賽特 II', roomCount: 4, stale: false });
  });

  it('lists rooms in numeric room order with exact decimals and freshness flags', async () => {
    await seedGame();
    const { body } = await get('/api/assistant/rooms', await cookieFor());
    expect(body.game.code).toBe('golden-seth');
    expect(body.total).toBe(4);
    expect(body.items.map((r: { roomNo: string }) => r.roomNo)).toEqual(['001', '200', '1001', '1500']);
    const [r001, r200, r1001, r1500] = body.items;
    expect(r200).toMatchObject({ status: 'busy', todayRtp: '114.44', todayBet: '279185.00', stale: false, detailStale: true });
    expect(r1001).toMatchObject({ todayRtp: '1379.58', unopenedSpins: null, detailStale: true });
    // 逾時：不顯示狀態
    expect(r1500).toMatchObject({ status: null, stale: true });
    expect(r001.detailStale).toBe(false);
  });

  it('sorts, filters by fresh status, searches and paginates', async () => {
    await seedGame();
    const h = await cookieFor();
    const nos = async (qs: string) => (await get(`/api/assistant/rooms?${qs}`, h)).body.items.map((r: { roomNo: string }) => r.roomNo);
    expect(await nos('sort=rtp')).toEqual(['1001', '200', '001', '1500']);
    expect(await nos('sort=unopened')).toEqual(['1500', '200', '001', '1001']);
    expect(await nos('sort=todayBet')).toEqual(['200', '001', '1001', '1500']);
    // 1500 雖然是 idle 但資料逾時，不列入狀態篩選
    expect(await nos('status=idle')).toEqual(['001', '1001']);
    expect(await nos('q=00')).toEqual(['001', '200', '1001', '1500']);
    expect(await nos('q=15')).toEqual(['1500']);
    const page2 = (await get('/api/assistant/rooms?pageSize=3&page=2', h)).body;
    expect(page2).toMatchObject({ total: 4, page: 2, pageSize: 3 });
    expect(page2.items.map((r: { roomNo: string }) => r.roomNo)).toEqual(['1500']);
    expect((await get('/api/assistant/rooms?sort=evil', h)).status).toBe(400);
    expect((await get('/api/assistant/rooms?q=%27%3B', h)).status).toBe(400);
    expect((await get('/api/assistant/rooms?game=nope', h)).status).toBe(404);
  });

  it('adds the composite score and sorts by it, with stale rooms last and unscored', async () => {
    await seedGame();
    const h = await cookieFor();
    const { body } = await get('/api/assistant/rooms?sort=score', h);
    expect(body.items.map((r: { roomNo: string }) => r.roomNo)).toEqual(['001', '200', '1001', '1500']);
    const [r001, r200, r1001, r1500] = body.items;
    // 母體只有未逾時的 001／200／1001；200 細項逾時 → 細項以 0.5 計，今日 RTP 居中 → 50 分
    // 顯示分數：原始 55 分以下都是 83
    expect(r200.score).toBe(83);
    expect(r001.score).toBeGreaterThan(83);
    expect(r1001.score).toBe(83);
    expect(r1500).toMatchObject({ score: null, premium: false });
    // 精品：未逾時空台（001、1001）前 5% → 至少 1 間
    expect(r001.premium).toBe(true);
    // 一般排序也帶分數
    const plain = (await get('/api/assistant/rooms', h)).body.items;
    expect(plain.find((r: { roomNo: string }) => r.roomNo === '200').score).toBe(83);
  });

  it('requires an active assistant pass for paid data', async () => {
    const u = await createUser({});
    const h = { cookie: `${SESSION_COOKIE}=${await signSession({ userId: u.id })}` };
    expect((await get('/api/assistant/rooms', h)).body.error.code).toBe('ASSISTANT_EXPIRED');
    await prisma.assistantPass.create({ data: { userId: u.id, startsAt: minutesAgo(120), expiresAt: minutesAgo(1) } });
    expect((await get('/api/assistant/games', h)).body.error.code).toBe('ASSISTANT_EXPIRED');
    // /me 不需要使用期限
    expect((await get('/api/assistant/me', h)).status).toBe(200);
  });

  it('shows a teaser of the top idle rooms without a pass, with room numbers and ids masked', async () => {
    const { rooms } = await seedGame();
    const u = await createUser({});
    const headers = { cookie: `${SESSION_COOKIE}=${await signSession({ userId: u.id })}` };
    // 未開通：付費排行 403，預覽 200
    expect((await get('/api/assistant/rooms?sort=score&status=idle', headers)).body.error.code).toBe('ASSISTANT_EXPIRED');
    const r = await app.request('/api/assistant/rooms/teaser', { headers });
    expect(r.status).toBe(200);
    const text = await r.text();
    const body = JSON.parse(text);
    expect(body.masked).toBe(true);
    // 只有未逾時的空台（001、1001），使用中與逾時、停用的不列入
    expect(body.items).toHaveLength(2);
    for (const item of body.items) expect(item).toMatchObject({ roomNo: '8888', masked: true, status: 'idle' });
    // 回應中不得出現真實房號或房間 id
    for (const room of Object.values(rooms)) expect(text).not.toContain(room.id);
    expect(text).not.toMatch(/"roomNo":"(001|1001)"/);
    expect((await get('/api/assistant/rooms/teaser', {})).status).toBe(401);
  });

  it('respects the freshness settings from AppSetting', async () => {
    await seedGame();
    await prisma.appSetting.create({ data: { key: 'assistantDataMaxAgeSeconds', value: '180' } });
    const { body } = await get('/api/assistant/rooms?status=idle', await cookieFor());
    // 5 分鐘前的資料超過 3 分鐘門檻 → 全部逾時
    expect(body.items).toEqual([]);
    expect(body.game.stale).toBe(true);
  });

  it('returns room detail with a 24-hour or 3-day trend, and 404 for disabled rooms', async () => {
    const { game, rooms } = await seedGame();
    const h = await cookieFor();
    const at = (m: number) => minutesAgo(m);
    for (const [i, m] of [80 * 60, 25 * 60, 120, 60, 10].entries()) {
      const run = await prisma.collectorRun.create({ data: { gameId: game.id, status: 'succeeded', startedAt: at(m) } });
      await prisma.roomSnapshot.create({
        data: { roomId: rooms.r200.id, collectorRunId: run.id, capturedAt: at(m), status: 'busy', todayRtp: `${100 + i}.00` },
      });
    }
    const { status, body } = await get(`/api/assistant/rooms/${rooms.r200.id}`, h);
    expect(status).toBe(200);
    expect(body.game).toEqual({ code: 'golden-seth', name: '戰神賽特 II' });
    expect(body.room).toMatchObject({ roomNo: '200', thirtyDayBet: null });
    // 預設近 24 小時：超過的不回傳；依時間排序
    expect(body.trend.map((t: { todayRtp: string }) => t.todayRtp)).toEqual(['102.00', '103.00', '104.00']);
    // 3 天：80 小時前那筆超過保存期限，不回傳
    const d3 = (await get(`/api/assistant/rooms/${rooms.r200.id}?range=3d`, h)).body;
    expect(d3.trend.map((t: { todayRtp: string }) => t.todayRtp)).toEqual(['101.00', '102.00', '103.00', '104.00']);
    expect((await get(`/api/assistant/rooms/${rooms.r200.id}?range=7d`, h)).status).toBe(400);
    expect((await get(`/api/assistant/rooms/${rooms.r200.id}?range=constructor`, h)).status).toBe(400);
    expect((await get(`/api/assistant/rooms/${rooms.r2000.id}`, h)).status).toBe(404);
    expect((await get('/api/assistant/rooms/nope', h)).status).toBe(404);
  });
});
