import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createDrawLog, createPrize, createRedemption, createUser } from '../../helpers/factories.js';

describe('GET /api/admin/users/:id', () => {
  beforeEach(resetDb);

  it('returns the full user record', async () => {
    const admin = await createAdmin();
    const user = await createUser({ nickname: 'Test', points: 28, accountType: 'test', testSkipCost: true, testForcePrizeId: null });
    const r = await app.request(`/api/admin/users/${user.id}`, { headers: await adminHeaders(admin.id, admin.email) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({
      id: user.id, nickname: 'Test', accountType: 'test',
      testSkipCost: true, testForcePrizeId: null,
      testForcePrizeIds: [], testForcePrizeMode: 'random',
      points: 28,
    });
    expect(body.entertainmentMemberCode).not.toBeNull();
  });

  it('404 USER_NOT_FOUND when id missing', async () => {
    const admin = await createAdmin();
    const r = await app.request('/api/admin/users/does_not_exist', { headers: await adminHeaders(admin.id, admin.email) });
    expect(r.status).toBe(404);
    expect((await r.json()).error.code).toBe('USER_NOT_FOUND');
  });
});

describe('DELETE /api/admin/users/:id', () => {
  beforeEach(resetDb);

  it('deletes the user and owned draw/redemption records, then writes audit log', async () => {
    const admin = await createAdmin();
    const user = await createUser({ nickname: 'DeleteMe' });
    const prize = await createPrize();
    const redemption = await createRedemption({ userId: user.id });
    await createDrawLog({ userId: user.id, redemptionId: redemption.id, prizeId: prize.id });

    const r = await app.request(`/api/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: await adminHeaders(admin.id, admin.email),
    });

    expect(r.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.redemption.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.drawLog.count({ where: { userId: user.id } })).toBe(0);
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'user.deleted' } });
    expect(log.targetId).toBe(user.id);
    expect(log.payloadBefore).toMatchObject({ nickname: 'DeleteMe' });
  });
});
