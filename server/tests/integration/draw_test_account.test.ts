import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { prisma } from '../../src/db.js';
import { createUser, createPrize, seedDefaultSettings } from '../helpers/factories.js';
import { signSession } from '../../src/auth/jwt.js';
import { SESSION_COOKIE } from '../../src/auth/cookies.js';

async function H(id: string) {
  const t = await signSession({ userId: id });
  return { cookie: `${SESSION_COOKIE}=${t}`, 'content-type': 'application/json' };
}

describe('POST /api/draw — test account', () => {
  beforeEach(async () => { await resetDb(); await seedDefaultSettings(); });

  it('charges tier cost when testSkipCost = false', async () => {
    const u = await createUser({ accountType: 'test', testSkipCost: false, points: 50 });
    await createPrize({ weight: 1, cashAmount: 100 });
    const r = await app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'single' }) });
    expect(r.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.points).toBe(44);
  });

  it('skips cost when testSkipCost = true', async () => {
    const u = await createUser({ accountType: 'test', testSkipCost: true, points: 50 });
    await createPrize({ weight: 1, cashAmount: 100 });
    const r = await app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'single' }) });
    expect(r.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.points).toBe(50);
  });

  it('forces prize via testForcePrizeId — even for multi, every sub-draw is the forced prize', async () => {
    const forced = await createPrize({ weight: 1, cashAmount: 999 });
    await createPrize({ weight: 99, cashAmount: 100 });
    const u = await createUser({ accountType: 'test', testForcePrizeId: forced.id, points: 100 });
    const r = await app.request('/api/draw', {
      method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'multi' }),
    });
    const body = await r.json();
    expect(body.isTest).toBe(true);
    expect(body.draws).toHaveLength(10);
    for (const d of body.draws) {
      expect(d.prize.id).toBe(forced.id);
      expect(d.winningCashAmount).toBe(999);
    }
    expect(body.redemption.totalWinAmount).toBe(9990);
    expect(body.redemption.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);

    const logs = await prisma.drawLog.findMany();
    expect(logs).toHaveLength(10);
    for (const log of logs) {
      expect(log.isTest).toBe(true);
      expect(log.forcedByAdmin).toBe(true);
    }
  });

  it('test draws DO NOT decrement stock (documented decision)', async () => {
    const forced = await createPrize({ weight: 1, cashAmount: 999, stock: 1 });
    const u = await createUser({ accountType: 'test', testForcePrizeId: forced.id, points: 100 });
    await app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'multi' }) });
    const prize = await prisma.prize.findUnique({ where: { id: forced.id } });
    expect(prize?.stock).toBe(1);  // not decremented despite 10 "wins"
  });

  it('lifetime + ranking + system totals all frozen for test draws', async () => {
    const u = await createUser({ accountType: 'test', points: 100 });
    await createPrize({ weight: 1, cashAmount: 500 });
    await app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'multi' }) });

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.lifetimeDrawCount).toBe(0);
    expect(after?.lifetimePayoutAmount).toBe(0);
    expect(after?.totalBurnAmount).toBe(0);
    expect(after?.totalLuckAmount).toBe(0);
    expect(after?.lastWinDrawIndex).toBeNull();

    // System totals also untouched
    const totalsDraw = await prisma.appSetting.findUnique({ where: { key: 'totalDrawCount' } });
    expect(Number(totalsDraw?.value)).toBe(0);
  });

  it('redemption.isTest = true so admin can filter test batches out of dashboards', async () => {
    const u = await createUser({ accountType: 'test', points: 50 });
    await createPrize({ weight: 1, cashAmount: 100 });
    await app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'single' }) });
    const redemption = await prisma.redemption.findFirst();
    expect(redemption?.isTest).toBe(true);
  });

  it('FORCE_PRIZE_NOT_FOUND when testForcePrizeId points at a disabled / nonexistent prize', async () => {
    const u = await createUser({ accountType: 'test', testForcePrizeId: 'does_not_exist', points: 100 });
    await createPrize({ weight: 1 });
    const r = await app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'single' }) });
    expect(r.status).toBe(422);
    expect((await r.json()).error.code).toBe('FORCE_PRIZE_NOT_FOUND');
  });
});
