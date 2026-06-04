import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { prisma } from '../../src/db.js';
import { createUser, createPrize, seedDefaultSettings, SETTINGS_KEYS } from '../helpers/factories.js';
import { signSession } from '../../src/auth/jwt.js';
import { SESSION_COOKIE } from '../../src/auth/cookies.js';

async function authedHeaders(userId: string) {
  const t = await signSession({ userId });
  return { cookie: `${SESSION_COOKIE}=${t}`, 'content-type': 'application/json' };
}

describe('POST /api/draw — verified core', () => {
  beforeEach(async () => { await resetDb(); await seedDefaultSettings(); });

  it('blacklisted user → 403 + admin_action_logs row + no draw_log, no balance change', async () => {
    const u = await createUser({ accountType: 'blacklisted', points: 100 });
    const r = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id),
      body: JSON.stringify({ tier: 'single' }),
    });
    expect(r.status).toBe(403);
    const body = await r.json();
    expect(body.error.code).toBe('USER_BLACKLISTED');

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.points).toBe(100);
    expect(await prisma.drawLog.count()).toBe(0);
    expect(await prisma.redemption.count()).toBe(0);

    const audits = await prisma.adminActionLog.findMany();
    expect(audits).toHaveLength(1);
    expect(audits[0]?.event).toBe('draw_blocked_blacklist');
    expect(audits[0]?.targetId).toBe(u.id);
    expect(audits[0]?.adminUserId).toBeNull();
  });

  it('user with no entertainment code → 403 ONBOARDING_REQUIRED, no charge', async () => {
    const u = await createUser({ entertainmentMemberCode: null, points: 100 });
    const r = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id),
      body: JSON.stringify({ tier: 'single' }),
    });
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe('ONBOARDING_REQUIRED');

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.points).toBe(100);
    expect(await prisma.redemption.count()).toBe(0);
  });

  it('user with no nickname → 403 ONBOARDING_REQUIRED, no charge', async () => {
    const u = await createUser({ nickname: null, points: 100 });
    const r = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id),
      body: JSON.stringify({ tier: 'single' }),
    });
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe('ONBOARDING_REQUIRED');
  });

  it('400 TIER_INVALID on malformed body', async () => {
    const u = await createUser();
    const r = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id), body: JSON.stringify({ tier: 'huge' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('TIER_INVALID');
  });

  it('422 INSUFFICIENT_POINTS', async () => {
    const u = await createUser({ points: 5 });
    await createPrize();
    const r = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id), body: JSON.stringify({ tier: 'single' }),
    });
    expect(r.status).toBe(422);
    expect((await r.json()).error.code).toBe('INSUFFICIENT_POINTS');
  });

  it('single tier verified happy path: 1 sub-draw, Redemption with code', async () => {
    const u = await createUser({ points: 28 });
    const prize = await createPrize({ weight: 1, cashAmount: 200 });

    const r = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id), body: JSON.stringify({ tier: 'single' }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();

    expect(body.tier).toBe('single');
    expect(body.tierDraws).toBe(1);
    expect(body.points).toBe(22);
    expect(body.isTest).toBe(false);

    expect(body.redemption.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(body.redemption.status).toBe('pending');
    expect(body.redemption.totalWinAmount).toBe(200);

    expect(body.draws).toHaveLength(1);
    expect(body.draws[0].subIndex).toBe(0);
    expect(body.draws[0].prize.id).toBe(prize.id);
    expect(body.draws[0].winningCashAmount).toBe(200);
    expect(body.draws[0].gatedBy).toBeNull();

    expect(body).not.toHaveProperty('prize');
    expect(body).not.toHaveProperty('isJackpotHit');
    expect(body).not.toHaveProperty('jackpotCurrentAmount');

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.points).toBe(22);
    expect(after?.lifetimeDrawCount).toBe(1);
    expect(after?.totalBurnAmount).toBe(6);
    expect(after?.totalLuckAmount).toBe(200);
    expect(after?.lifetimePayoutAmount).toBe(200);
    expect(after?.lastWinDrawIndex).toBe(1);

    expect(await prisma.drawLog.count()).toBe(1);
    expect(await prisma.redemption.count()).toBe(1);
  });

  it('multi tier verified happy path: 10 sub-draws, one Redemption, totalWinAmount = sum', async () => {
    const u = await createUser({ points: 60 });
    const prize = await createPrize({ weight: 1, cashAmount: 100 });

    const r = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id), body: JSON.stringify({ tier: 'multi' }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();

    expect(body.tier).toBe('multi');
    expect(body.tierDraws).toBe(10);
    expect(body.points).toBe(12);

    expect(body.draws).toHaveLength(10);
    body.draws.forEach((d: { subIndex: number; prize: { id: string }; winningCashAmount: number }, i: number) => {
      expect(d.subIndex).toBe(i);
      expect(d.prize.id).toBe(prize.id);
      expect(d.winningCashAmount).toBe(100);
    });

    expect(body.redemption.totalWinAmount).toBe(1000);
    expect(body.redemption.status).toBe('pending');

    expect(await prisma.drawLog.count()).toBe(10);
    expect(await prisma.redemption.count()).toBe(1);

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.lifetimeDrawCount).toBe(10);
    expect(after?.totalBurnAmount).toBe(48);
    expect(after?.totalLuckAmount).toBe(1000);
  });

  it('401 without session', async () => {
    const r = await app.request('/api/draw', {
      method: 'POST', body: JSON.stringify({ tier: 'single' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(r.status).toBe(401);
  });
});
