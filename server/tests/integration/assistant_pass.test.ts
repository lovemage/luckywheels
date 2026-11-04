import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../src/index.js';
import { prisma } from '../../src/db.js';
import { signSession } from '../../src/auth/jwt.js';
import { SESSION_COOKIE } from '../../src/auth/cookies.js';
import { resetDb } from '../helpers/db.js';
import { createUser } from '../helpers/factories.js';
import { adminHeaders, createAdmin } from '../helpers/admin.ts';

const HOUR = 3_600_000;

async function member(points = 10) {
  const user = await createUser({ points });
  return { user, headers: { cookie: `${SESSION_COOKIE}=${await signSession({ userId: user.id })}`, 'content-type': 'application/json' } };
}

async function req(path: string, headers: Record<string, string>, method = 'GET', body?: unknown) {
  const r = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}

const exchange = (h: Record<string, string>, key: string, body: unknown) =>
  req('/api/assistant/exchange', { ...h, 'idempotency-key': key }, 'POST', body);

const pointsOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).points;

describe('assistant pass and points exchange', { timeout: 120_000 }, () => {
  const savedFlag = process.env.DATA_ASSISTANT_ENABLED;

  beforeEach(async () => {
    await resetDb();
    process.env.DATA_ASSISTANT_ENABLED = 'true';
  });

  afterEach(() => {
    if (savedFlag === undefined) delete process.env.DATA_ASSISTANT_ENABLED;
    else process.env.DATA_ASSISTANT_ENABLED = savedFlag;
  });

  it('publishes the default plans with generated copy (no login)', async () => {
    const r = await req('/api/public/assistant/plans', {});
    expect(r.status).toBe(200);
    expect(r.body.plans).toEqual([
      { points: 1, hours: 3, label: '1 點積分兌換 3 小時' },
      { points: 2, hours: 8, label: '2 點積分兌換 8 小時' },
      { points: 3, hours: 24, label: '3 點積分兌換 24 小時（1 天）' },
    ]);
    process.env.DATA_ASSISTANT_ENABLED = 'false';
    expect((await req('/api/public/assistant/plans', {})).status).toBe(404);
  });

  it('exchanges points for time, extends an active pass and replays the same key', async () => {
    const { user, headers } = await member(5);
    const me0 = await req('/api/assistant/me', headers);
    expect(me0.body).toMatchObject({ points: 5, pass: { active: false, expiresAt: null } });

    const first = await exchange(headers, 'k1', { points: 2, expectedHours: 8 });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ replayed: false, points: 3, exchange: { pointsSpent: 2, pointsBefore: 5, pointsAfter: 3, hours: 8 } });
    const exp1 = new Date(first.body.pass.expiresAt).getTime();
    expect(Math.abs(exp1 - (Date.now() + 8 * HOUR))).toBeLessThan(60_000);

    // 續兌：從原到期時間往後加
    const second = await exchange(headers, 'k2', { points: 1 });
    expect(new Date(second.body.pass.expiresAt).getTime()).toBe(exp1 + 3 * HOUR);

    // 同一把 key 重送：不再扣點
    const replay = await exchange(headers, 'k1', { points: 2, expectedHours: 8 });
    expect(replay.body).toMatchObject({ replayed: true, points: 2 });
    expect(await pointsOf(user.id)).toBe(2);

    const list = await req('/api/assistant/exchanges', headers);
    expect(list.body.items.map((i: { hours: number }) => i.hours)).toEqual([3, 8]);
  });

  it('rejects insufficient points, unknown plans, stale plans and a missing key', async () => {
    const { user, headers } = await member(1);
    expect((await exchange(headers, 'a', { points: 3 })).body.error.code).toBe('INSUFFICIENT_POINTS');
    expect((await exchange(headers, 'b', { points: 4 })).body.error.code).toBe('EXCHANGE_PLAN_NOT_FOUND');
    expect((await exchange(headers, 'c', { points: 1, expectedHours: 5 })).status).toBe(409);
    expect((await req('/api/assistant/exchange', headers, 'POST', { points: 1 })).body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(await pointsOf(user.id)).toBe(1);
    expect(await prisma.assistantPass.count()).toBe(0);
  });

  it('never overspends under concurrent exchanges', async () => {
    const { user, headers } = await member(3);
    const results = await Promise.all(['x1', 'x2', 'x3'].map((k) => exchange(headers, k, { points: 2 })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.body.error?.code === 'INSUFFICIENT_POINTS')).toHaveLength(2);
    expect(await pointsOf(user.id)).toBe(1);
  });

  it('restarts the pass after it expired', async () => {
    const { user, headers } = await member(5);
    await prisma.assistantPass.create({ data: { userId: user.id, startsAt: new Date(Date.now() - 10 * HOUR), expiresAt: new Date(Date.now() - HOUR) } });
    const r = await exchange(headers, 'k', { points: 1 });
    expect(Math.abs(new Date(r.body.pass.expiresAt).getTime() - (Date.now() + 3 * HOUR))).toBeLessThan(60_000);
    expect(Math.abs(new Date(r.body.pass.startsAt).getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('lets admins edit plans (member copy follows) and adjust a member pass', async () => {
    const admin = await createAdmin();
    const ah = await adminHeaders(admin.id, admin.email);
    const { user, headers } = await member(5);

    const bad = await req('/api/admin/assistant/exchange/plans', ah, 'PUT', { plans: [{ points: 1, hours: 3 }, { points: 1, hours: 5 }] });
    expect(bad.body.error.code).toBe('ASSISTANT_SETTINGS_INVALID');
    const ok = await req('/api/admin/assistant/exchange/plans', ah, 'PUT', { plans: [{ points: 5, hours: 72 }, { points: 1, hours: 4 }] });
    expect(ok.body.plans.map((p: { label: string }) => p.label)).toEqual(['1 點積分兌換 4 小時', '5 點積分兌換 72 小時（3 天）']);
    expect((await req('/api/assistant/me', headers)).body.plans[0]).toMatchObject({ points: 1, hours: 4 });

    // 扣時：未開通時不可扣
    expect((await req(`/api/admin/assistant/members/${user.id}/pass-adjust`, ah, 'POST', { hours: -1 })).status).toBe(409);
    const add = await req(`/api/admin/assistant/members/${user.id}/pass-adjust`, ah, 'POST', { hours: 10, note: '補償' });
    expect(add.body.pass.active).toBe(true);
    const sub = await req(`/api/admin/assistant/members/${user.id}/pass-adjust`, ah, 'POST', { hours: -20 });
    // 扣超過剩餘時數 → 立即到期，不會變成負的
    expect(sub.body.pass).toMatchObject({ active: false, remainingSeconds: 0 });

    const records = await req(`/api/admin/assistant/exchange/records?userId=${user.id}`, ah);
    expect(records.body.items.map((i: { hours: number; adminAccount: string }) => [i.hours, i.adminAccount])).toEqual([
      [-20, admin.email],
      [10, admin.email],
    ]);
    expect(await prisma.adminActionLog.count({ where: { event: 'assistant.pass_adjusted' } })).toBe(2);
    expect(await prisma.adminActionLog.count({ where: { event: 'assistant.time_plans_updated' } })).toBe(1);
  });

  it('requires the exchange permission for sub-accounts', async () => {
    const sub = await prisma.adminUser.create({
      data: { email: 'sub@example.com', passwordHash: 'x', role: 'subadmin', isMain: false, allowedNavs: ['assistant'] },
    });
    const h = await adminHeaders(sub.id, sub.email);
    const { user } = await member();
    expect((await req('/api/admin/assistant/exchange/plans', h)).body.error.code).toBe('ADMIN_NAV_FORBIDDEN');
    const r = await req(`/api/admin/assistant/members/${user.id}/pass-adjust`, h, 'POST', { hours: 5 });
    expect(r.body.error.code).toBe('ADMIN_NAV_FORBIDDEN');
    expect(await prisma.assistantPass.count()).toBe(0);
    await prisma.adminUser.update({ where: { id: sub.id }, data: { allowedNavs: ['exchange'] } });
    expect((await req('/api/admin/assistant/exchange/plans', h)).status).toBe(200);
    // exchange 權限不含推薦設定
    expect((await req('/api/admin/assistant/settings', h)).body.error.code).toBe('ADMIN_NAV_FORBIDDEN');
  });
});
