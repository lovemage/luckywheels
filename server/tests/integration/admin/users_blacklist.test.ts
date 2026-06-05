import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser } from '../../helpers/factories.js';

describe('PATCH /api/admin/users/:id/blacklist', () => {
  beforeEach(resetDb);

  it('blacklist=true sets type+timestamp+reason, logs previous type', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'verified' });
    const r = await app.request(`/api/admin/users/${user.id}/blacklist`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ blacklist: true, reason: '套利行為' }),
    });
    expect(r.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u!.accountType).toBe('blacklisted');
    expect(u!.blacklistReason).toBe('套利行為');
    expect(u!.blacklistedByAdminUserId).toBe(admin.id);
    expect(u!.blacklistedAt).toBeTruthy();
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'user.blacklist_set' } });
    expect(log.payloadBefore).toMatchObject({ accountType: 'verified' });
    expect(log.payloadAfter).toMatchObject({ reason: '套利行為' });
  });

  it('blacklist=true rejected without reason', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'verified' });
    const r = await app.request(`/api/admin/users/${user.id}/blacklist`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ blacklist: true }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('BLACKLIST_REASON_REQUIRED');
  });

  it('blacklist=false restores type to verified by default + clears reason', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'blacklisted' });
    await prisma.user.update({
      where: { id: user.id },
      data: {
        blacklistedAt: new Date(),
        blacklistReason: 'old',
        blacklistedByAdminUserId: admin.id,
      },
    });
    const r = await app.request(`/api/admin/users/${user.id}/blacklist`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ blacklist: false }),
    });
    expect(r.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u!.accountType).toBe('verified');
    expect(u!.blacklistedAt).toBeNull();
    expect(u!.blacklistReason).toBeNull();
    expect(u!.blacklistedByAdminUserId).toBeNull();
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'user.blacklist_clear' } });
    expect(log.payloadAfter).toMatchObject({ restoreTo: 'verified' });
  });

  it('no-op when already in desired state → 200 ok no audit row', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'verified' });
    const r = await app.request(`/api/admin/users/${user.id}/blacklist`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ blacklist: false }),
    });
    expect(r.status).toBe(200);
    const logs = await prisma.adminActionLog.findMany({ where: { targetId: user.id } });
    expect(logs.length).toBe(0);
  });
});
