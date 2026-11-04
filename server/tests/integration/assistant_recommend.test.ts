import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/index.js';
import { prisma } from '../../src/db.js';
import { signSession } from '../../src/auth/jwt.js';
import { SESSION_COOKIE } from '../../src/auth/cookies.js';
import { resetDb } from '../helpers/db.js';
import { createUser, grantAssistantPass } from '../helpers/factories.js';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

async function member() {
  const u = await createUser({});
  await grantAssistantPass(u.id);
  return { user: u, headers: { cookie: `${SESSION_COOKIE}=${await signSession({ userId: u.id })}` } };
}

// 母體＝未逾時房間（001–005）。各指標名次一致：002 最好 → 001 → 005 → 003 → 004。
// 分數：002＝100（使用中，不推薦）、001＝75、005＝50、003＝25、004＝0；006 逾時，不列入母體也不推薦。
async function seedRooms() {
  const provider = await prisma.gameProvider.create({ data: { code: 'atg', name: 'ATG' } });
  const game = await prisma.game.create({ data: { providerId: provider.id, code: 'golden-seth', name: '戰神賽特 II' } });
  const fresh = minutesAgo(5);
  const room = (roomNo: string, status: 'idle' | 'busy', unopened: number, rtp: string, rtp30: string, bet: string, listAt = fresh) =>
    prisma.room.create({
      data: {
        gameId: game.id, roomNo, sourceRoomId: `s${roomNo}`, status, todayRtp: rtp, listCapturedAt: listAt,
        unopenedSpins: unopened, prev1Spins: 300, prev2Spins: 500, todayBet: bet, thirtyDayRtp: rtp30, detailCapturedAt: fresh,
      },
    });
  await room('001', 'idle', 900, '50.00', '99.00', '9000.00');
  await room('002', 'busy', 1000, '40.00', '100.00', '10000.00');
  await room('003', 'idle', 500, '90.00', '97.00', '5000.00');
  await room('004', 'idle', 100, '200.00', '90.00', '100.00');
  await room('005', 'idle', 700, '70.00', '98.00', '7000.00');
  await room('006', 'idle', 5000, '1.00', '100.00', '99999.00', minutesAgo(120));
  return game;
}

async function post(body: unknown, headers: Record<string, string>) {
  const r = await app.request('/api/assistant/recommend', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

const nos = (body: { items: { room: { roomNo: string } }[] }) => body.items.map((i) => i.room.roomNo);

describe('member assistant recommend API', { timeout: 60_000 }, () => {
  const savedFlag = process.env.DATA_ASSISTANT_ENABLED;

  beforeEach(async () => {
    await resetDb();
    process.env.DATA_ASSISTANT_ENABLED = 'true';
  });

  afterEach(() => {
    if (savedFlag === undefined) delete process.env.DATA_ASSISTANT_ENABLED;
    else process.env.DATA_ASSISTANT_ENABLED = savedFlag;
  });

  it('requires login and the feature flag', async () => {
    const { headers } = await member();
    expect((await post({ principal: 1000, multiplier: 1 }, {})).status).toBe(401);
    process.env.DATA_ASSISTANT_ENABLED = 'false';
    expect((await post({ principal: 1000, multiplier: 1 }, headers)).status).toBe(404);
  });

  it('exposes the tier config for the input form', async () => {
    const { headers } = await member();
    const r = await app.request('/api/assistant/recommend/config', { headers });
    const body = await r.json();
    expect(body.tiers.map((t: { label: string; maxMultiplier: number }) => [t.label, t.maxMultiplier])).toEqual([
      ['5,000 以下', 2],
      ['5,000–9,999', 3],
      ['10,000 以上', 5],
    ]);
    expect(body).toMatchObject({ multiplierStepScore: 3, maxMultiplier: 5, minBetAdvice: '建議單注 10 元以上' });
  });

  it('rejects invalid input and multipliers above the tier maximum', async () => {
    await seedRooms();
    const { headers } = await member();
    expect((await post({ principal: 0, multiplier: 1 }, headers)).body.error.code).toBe('RECOMMEND_INPUT_INVALID');
    expect((await post({ principal: 1000, multiplier: 6 }, headers)).body.error.code).toBe('RECOMMEND_INPUT_INVALID');
    const r = await post({ principal: 4000, multiplier: 3 }, headers);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('MULTIPLIER_NOT_ALLOWED');
    expect(await prisma.recommendationLog.count()).toBe(0);
  });

  it('recommends only fresh idle rooms above the threshold, with reasons, and logs it', async () => {
    await seedRooms();
    const { user, headers } = await member();
    const { status, body } = await post({ principal: 8000, multiplier: 1 }, headers);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      input: { principal: 8000, multiplier: 1 },
      tier: { label: '5,000–9,999', minScore: 70 },
      threshold: 70,
      context: '本金 8,000、目標 1 倍，符合 5,000–9,999 級距門檻 70 分',
      minBetAdvice: '建議單注 10 元以上',
      disclaimer: '排序參考，不代表遊戲結果',
    });
    expect(nos(body)).toEqual(['001']);
    expect(body.items[0]).toMatchObject({ score: 75, premium: true });
    expect(body.items[0].reasons).toEqual([
      '未開 900 轉，多於同遊戲 60% 的機台',
      '今日 RTP 50%，低於同遊戲 60% 的機台',
      '已超過前兩次平均開出間隔（400 轉）',
    ]);

    const logs = await prisma.recommendationLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ userId: user.id, principal: 8000, multiplier: 1, threshold: 70, resultCount: 1 });
    expect((logs[0]!.results as { roomNo: string }[])[0]!.roomNo).toBe('001');
  });

  it('raises the threshold per extra multiplier and returns an empty list when nothing qualifies', async () => {
    await seedRooms();
    const { headers } = await member();
    const r = await post({ principal: 10000, multiplier: 5 }, headers);
    expect(r.status).toBe(200);
    expect(r.body.threshold).toBe(92);
    expect(r.body.items).toEqual([]);
  });

  it('follows the tier, count and weight settings in AppSetting', async () => {
    await seedRooms();
    const { headers } = await member();
    await prisma.appSetting.createMany({
      data: [
        { key: 'assistantRecommendTiers', value: JSON.stringify([{ minPrincipal: 0, minScore: 20, maxMultiplier: 5 }]) },
        { key: 'assistantRecommendCount', value: '2' },
      ],
    });
    expect(nos((await post({ principal: 100, multiplier: 1 }, headers)).body)).toEqual(['001', '005']);

    // 只看今日下注：004 下注最低 → 0 分；其他順序不變
    await prisma.appSetting.create({
      data: { key: 'assistantScoreWeights', value: JSON.stringify({ unopened: 0, todayRtp: 0, thirtyDayRtp: 0, todayBet: 1 }) },
    });
    const r = await post({ principal: 100, multiplier: 1 }, headers);
    expect(r.body.items.map((i: { score: number }) => i.score)).toEqual([75, 50]);

    // 設定值損壞時退回預設，不讓 API 失敗
    await prisma.appSetting.update({ where: { key: 'assistantRecommendTiers' }, data: { value: 'not json' } });
    expect((await post({ principal: 100, multiplier: 1 }, headers)).body.threshold).toBe(60);
  });
});
