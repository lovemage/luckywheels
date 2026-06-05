import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser, createPrize } from '../../helpers/factories.js';

describe('PATCH /api/admin/users/:id/test-settings', () => {
  beforeEach(resetDb);

  it('updates testSkipCost + testForcePrizeId and logs both sides', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'test' });
    const prize = await createPrize();
    const r = await app.request(`/api/admin/users/${user.id}/test-settings`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ testSkipCost: true, testForcePrizeId: prize.id }),
    });
    expect(r.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u!.testSkipCost).toBe(true);
    expect(u!.testForcePrizeId).toBe(prize.id);
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'user.test_settings_change' } });
    expect(log.payloadBefore).toMatchObject({ testSkipCost: false, testForcePrizeId: null });
    expect(log.payloadAfter).toMatchObject({ testSkipCost: true, testForcePrizeId: prize.id });
  });

  it('clears testForcePrizeId when null', async () => {
    const admin = await createAdmin();
    const prize = await createPrize();
    const user = await createUser({ accountType: 'test', testForcePrizeId: prize.id });
    const r = await app.request(`/api/admin/users/${user.id}/test-settings`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ testForcePrizeId: null }),
    });
    expect(r.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.testForcePrizeId).toBeNull();
  });

  it('rejects when user is not test (TEST_SETTINGS_REQUIRES_TEST_ACCOUNT)', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'verified' });
    const r = await app.request(`/api/admin/users/${user.id}/test-settings`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ testSkipCost: true }),
    });
    expect(r.status).toBe(422);
    expect((await r.json()).error.code).toBe('TEST_SETTINGS_REQUIRES_TEST_ACCOUNT');
  });

  it('rejects unknown prize id (TEST_FORCE_PRIZE_NOT_FOUND 404)', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'test' });
    const r = await app.request(`/api/admin/users/${user.id}/test-settings`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ testForcePrizeId: 'does_not_exist' }),
    });
    expect(r.status).toBe(404);
    expect((await r.json()).error.code).toBe('TEST_FORCE_PRIZE_NOT_FOUND');
  });
});
