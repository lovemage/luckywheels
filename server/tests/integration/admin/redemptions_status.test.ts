import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser, createRedemption } from '../../helpers/factories.js';

describe('PATCH /api/admin/redemptions/:id/status', () => {
  beforeEach(resetDb);

  it('claim: pending → delivered, sets statusChangedByAdminUserId, audit log', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const red = await createRedemption({ userId: u.id, status: 'pending' });
    const r = await app.request(`/api/admin/redemptions/${red.id}/status`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'claim' }),
    });
    expect(r.status).toBe(200);
    const refreshed = await prisma.redemption.findUnique({ where: { id: red.id } });
    expect(refreshed!.status).toBe('delivered');
    expect(refreshed!.statusChangedByAdminUserId).toBe(admin.id);
    expect(refreshed!.statusChangedAt).toBeTruthy();
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'redemption.claim' } });
    expect(log.targetId).toBe(red.id);
  });

  it('claim rejected when status != pending → 422 REDEMPTION_TRANSITION_INVALID', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const red = await createRedemption({ userId: u.id, status: 'delivered' });
    const r = await app.request(`/api/admin/redemptions/${red.id}/status`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'claim' }),
    });
    expect(r.status).toBe(422);
    expect((await r.json()).error.code).toBe('REDEMPTION_TRANSITION_INVALID');
  });

  it('void requires reason', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const red = await createRedemption({ userId: u.id, status: 'pending' });
    const r = await app.request(`/api/admin/redemptions/${red.id}/status`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'void' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('REDEMPTION_VOID_REASON_REQUIRED');
  });

  it('void marks the redemption + reason, refuses when already delivered', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const pending = await createRedemption({ userId: u.id, status: 'pending' });
    const delivered = await createRedemption({ userId: u.id, status: 'delivered' });
    const headers = { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' };
    const ok = await app.request(`/api/admin/redemptions/${pending.id}/status`, {
      method: 'PATCH', headers, body: JSON.stringify({ action: 'void', reason: 'duplicate' }),
    });
    expect(ok.status).toBe(200);
    const after = await prisma.redemption.findUnique({ where: { id: pending.id } });
    expect(after!.status).toBe('cancelled');
    expect(after!.cancelReason).toBe('duplicate');
    expect(after!.statusChangedByAdminUserId).toBe(admin.id);
    const bad = await app.request(`/api/admin/redemptions/${delivered.id}/status`, {
      method: 'PATCH', headers, body: JSON.stringify({ action: 'void', reason: 'try' }),
    });
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.code).toBe('REDEMPTION_TRANSITION_INVALID');
  });

  it('unclaim: delivered → pending, requires reason, clears statusChangedAt + statusChangedByAdminUserId', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const red = await createRedemption({ userId: u.id, status: 'delivered' });
    // simulate previous delivery state
    await prisma.redemption.update({ where: { id: red.id }, data: { statusChangedAt: new Date(), statusChangedByAdminUserId: admin.id } });
    const headers = { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' };
    const bad = await app.request(`/api/admin/redemptions/${red.id}/status`, { method: 'PATCH', headers, body: JSON.stringify({ action: 'unclaim' }) });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe('REDEMPTION_UNCLAIM_REASON_REQUIRED');

    const ok = await app.request(`/api/admin/redemptions/${red.id}/status`, {
      method: 'PATCH', headers, body: JSON.stringify({ action: 'unclaim', reason: 'misclick' }),
    });
    expect(ok.status).toBe(200);
    const refreshed = await prisma.redemption.findUnique({ where: { id: red.id } });
    expect(refreshed!.status).toBe('pending');
    expect(refreshed!.statusChangedAt).toBeNull();
    expect(refreshed!.statusChangedByAdminUserId).toBeNull();
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'redemption.unclaim' } });
    expect(log.payloadAfter).toMatchObject({ reason: 'misclick' });
  });
});
