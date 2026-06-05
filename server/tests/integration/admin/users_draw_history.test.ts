import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser, createPrize } from '../../helpers/factories.js';

describe('GET /api/admin/users/:id/draw-history', () => {
  beforeEach(resetDb);

  it('returns redemptions with sub-draws ordered by createdAt desc', async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const prize = await createPrize();
    const single = await prisma.redemption.create({
      data: { userId: user.id, code: 'CODE-AAAA-BBBB', tier: 'single', status: 'pending' },
    });
    await prisma.drawLog.create({
      data: {
        userId: user.id,
        redemptionId: single.id,
        prizeId: prize.id,
        subIndex: 0,
        tier: 'single',
        tierCost: 6,
        tierDraws: 1,
        pointsBefore: 10,
        pointsAfter: 4,
        randomSeed: 'seed1',
        winningCashAmount: 100,
      },
    });
    const multi = await prisma.redemption.create({
      data: { userId: user.id, code: 'CODE-CCCC-DDDD', tier: 'multi', status: 'pending' },
    });
    for (let i = 0; i < 2; i++) {
      await prisma.drawLog.create({
        data: {
          userId: user.id,
          redemptionId: multi.id,
          prizeId: prize.id,
          subIndex: i,
          tier: 'multi',
          tierCost: 48,
          tierDraws: 10,
          pointsBefore: 50,
          pointsAfter: 2,
          randomSeed: 'seed',
          winningCashAmount: 100,
        },
      });
    }

    const r = await app.request(`/api/admin/users/${user.id}/draw-history`, {
      headers: await adminHeaders(admin.id, admin.email),
    });
    const body = await r.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].redemption.tier).toBe('multi');
    expect(body.items[0].draws).toHaveLength(2);
    expect(body.items[1].redemption.tier).toBe('single');
    expect(body.items[1].draws).toHaveLength(1);
  });

  it('empty list returns []', async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const r = await app.request(`/api/admin/users/${user.id}/draw-history`, {
      headers: await adminHeaders(admin.id, admin.email),
    });
    expect((await r.json()).items).toEqual([]);
  });
});
