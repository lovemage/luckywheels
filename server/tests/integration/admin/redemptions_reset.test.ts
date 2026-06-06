import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { prisma } from '../../../src/db.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import {
  seedDefaultSettings,
  createUser,
  createPrize,
  createRedemption,
  createDrawLog,
  SETTINGS_KEYS,
} from '../../helpers/factories.js';

async function seedOneDrawnUser() {
  const user = await createUser({
    points: 100,
    lifetimeDrawCount: 5,
    totalBurnAmount: 30,
    totalLuckAmount: 200,
    lastWinDrawIndex: 3,
  });
  const prize = await createPrize();
  const redemption = await createRedemption({ userId: user.id, totalWinAmount: 100 });
  await createDrawLog({ userId: user.id, redemptionId: redemption.id, prizeId: prize.id, winningCashAmount: 100 });
  return user;
}

describe('admin redemptions reset-all', () => {
  beforeEach(async () => {
    await resetDb();
    await seedDefaultSettings({
      [SETTINGS_KEYS.totalDrawCount]: '12',
      [SETTINGS_KEYS.totalPayoutAmount]: '3400',
      [SETTINGS_KEYS.totalPointsBurned]: '72',
    });
  });

  it('without confirm → 400 REDEMPTION_RESET_CONFIRM_REQUIRED', async () => {
    const admin = await createAdmin();
    await seedOneDrawnUser();
    const r = await app.request('/api/admin/redemptions/reset', {
      method: 'POST',
      headers: { ...(await adminHeaders(admin.id, admin.email)), 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('REDEMPTION_RESET_CONFIRM_REQUIRED');
    // nothing deleted
    expect(await prisma.redemption.count()).toBe(1);
    expect(await prisma.drawLog.count()).toBe(1);
  });

  it('wrong confirm text → 400 (literal RESET enforced server-side)', async () => {
    const admin = await createAdmin();
    const r = await app.request('/api/admin/redemptions/reset', {
      method: 'POST',
      headers: { ...(await adminHeaders(admin.id, admin.email)), 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'reset' }),
    });
    expect(r.status).toBe(400);
  });

  it('requires admin auth → 401 without cookie', async () => {
    const r = await app.request('/api/admin/redemptions/reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'RESET' }),
    });
    expect(r.status).toBe(401);
  });

  it('confirm RESET → deletes all records, zeroes points/counters/totals, audits', async () => {
    const admin = await createAdmin();
    const user = await seedOneDrawnUser();

    const r = await app.request('/api/admin/redemptions/reset', {
      method: 'POST',
      headers: { ...(await adminHeaders(admin.id, admin.email)), 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'RESET' }),
    });
    expect(r.status).toBe(200);
    const json = (await r.json()) as {
      ok: true;
      deletedRedemptions: number;
      deletedDrawLogs: number;
      usersReset: number;
    };
    expect(json.ok).toBe(true);
    expect(json.deletedRedemptions).toBe(1);
    expect(json.deletedDrawLogs).toBe(1);
    expect(json.usersReset).toBe(1);

    // records gone
    expect(await prisma.redemption.count()).toBe(0);
    expect(await prisma.drawLog.count()).toBe(0);

    // user wiped (full clear including points)
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(fresh.points).toBe(0);
    expect(fresh.lifetimeDrawCount).toBe(0);
    expect(fresh.lifetimePayoutAmount).toBe(0);
    expect(fresh.totalBurnAmount).toBe(0);
    expect(fresh.totalLuckAmount).toBe(0);
    expect(fresh.lastWinDrawIndex).toBeNull();

    // global totals (also the cost-control counters) zeroed
    const totals = await prisma.appSetting.findMany({
      where: {
        key: {
          in: [SETTINGS_KEYS.totalDrawCount, SETTINGS_KEYS.totalPayoutAmount, SETTINGS_KEYS.totalPointsBurned],
        },
      },
    });
    for (const t of totals) expect(t.value).toBe('0');

    // audit row
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'redemption.reset_all' } });
    const after = log.payloadAfter as Record<string, unknown>;
    expect(after.deletedRedemptions).toBe(1);
    expect(after.clearedPoints).toBe(true);
  });
});
