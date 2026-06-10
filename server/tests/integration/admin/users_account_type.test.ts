import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser } from '../../helpers/factories.js';

describe('PATCH /api/admin/users/:id/account-type', () => {
  beforeEach(resetDb);

  it('promotes a test user to verified and audit-logs before/after', async () => {
    const admin = await createAdmin();
    const user = await createUser({
      accountType: 'test',
      testSkipCost: true,
      testForcePrizeId: 'legacy-prize-id',
      testForcePrizeIds: ['new-prize-id'],
      testForcePrizeMode: 'cycle',
    });
    const r = await app.request(`/api/admin/users/${user.id}/account-type`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ accountType: 'verified' }),
    });
    expect(r.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u!.accountType).toBe('verified');
    expect(u!.testSkipCost).toBe(false);
    expect(u!.testForcePrizeId).toBeNull();
    expect(u!.testForcePrizeIds).toEqual([]);
    expect(u!.testForcePrizeMode).toBe('random');
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'user.account_type_change' } });
    expect(log.payloadBefore).toMatchObject({ accountType: 'test' });
    expect(log.payloadAfter).toMatchObject({ accountType: 'verified' });
  });

  it('demotes verified → test', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'verified' });
    const r = await app.request(`/api/admin/users/${user.id}/account-type`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ accountType: 'test' }),
    });
    expect(r.status).toBe(200);
  });

  it('refuses blacklisted (use dedicated endpoint) → 400 ACCOUNT_TYPE_BLACKLIST_DISALLOWED', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'verified' });
    const r = await app.request(`/api/admin/users/${user.id}/account-type`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ accountType: 'blacklisted' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('ACCOUNT_TYPE_BLACKLIST_DISALLOWED');
  });

  it('refuses change away from blacklisted via this endpoint', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'blacklisted', blacklistedAt: new Date(), blacklistReason: 'fraud' });
    const r = await app.request(`/api/admin/users/${user.id}/account-type`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ accountType: 'verified' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('ACCOUNT_TYPE_BLACKLIST_DISALLOWED');
  });
});

describe('PATCH /api/admin/users/:id/approve', () => {
  beforeEach(resetDb);

  it('approves a pending user into verified and writes audit log', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'pending' });
    const r = await app.request(`/api/admin/users/${user.id}/approve`, {
      method: 'PATCH',
      headers: await adminHeaders(admin.id, admin.email),
    });
    expect(r.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u!.accountType).toBe('verified');
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'user.approved' } });
    expect(log.payloadBefore).toMatchObject({ accountType: 'pending' });
    expect(log.payloadAfter).toMatchObject({ accountType: 'verified' });
  });
});
