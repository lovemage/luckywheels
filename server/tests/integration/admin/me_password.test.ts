import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { createAdminWithPassword, adminHeaders } from '../../helpers/admin.ts';
import { verifyPassword } from '../../../src/admin/auth/password.js';

describe('PATCH /api/admin/me/password', () => {
  beforeEach(resetDb);

  it('rejects wrong current password → 401 CURRENT_PASSWORD_WRONG', async () => {
    const admin = await createAdminWithPassword('original-password-1');
    const r = await app.request('/api/admin/me/password', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'a-fresh-password-2' }),
    });
    expect(r.status).toBe(401);
    expect((await r.json()).error.code).toBe('CURRENT_PASSWORD_WRONG');
  });

  it('rejects new password < 12 chars', async () => {
    const admin = await createAdminWithPassword('original-password-1');
    const r = await app.request('/api/admin/me/password', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'original-password-1', newPassword: 'short' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('NEW_PASSWORD_TOO_SHORT');
  });

  it('rejects same-as-current', async () => {
    const admin = await createAdminWithPassword('original-password-1');
    const r = await app.request('/api/admin/me/password', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'original-password-1', newPassword: 'original-password-1' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('NEW_PASSWORD_SAME_AS_OLD');
  });

  it('changes password, persists new hash, writes audit log (no password in payload!)', async () => {
    const admin = await createAdminWithPassword('original-password-1');
    const r = await app.request('/api/admin/me/password', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'original-password-1', newPassword: 'brand-new-password-2' }),
    });
    expect(r.status).toBe(200);
    const refreshed = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(await verifyPassword('brand-new-password-2', refreshed.passwordHash)).toBe(true);
    expect(await verifyPassword('original-password-1', refreshed.passwordHash)).toBe(false);
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'admin.password_change' } });
    const payload = log.payloadAfter as Record<string, unknown> | null;
    expect(payload).not.toHaveProperty('currentPassword');
    expect(payload).not.toHaveProperty('newPassword');
    expect(payload).not.toHaveProperty('passwordHash');
  });
});

describe('PATCH /api/admin/me/account', () => {
  beforeEach(resetDb);

  it('rejects invalid account format', async () => {
    const admin = await createAdminWithPassword('original-password-1');
    const r = await app.request('/api/admin/me/account', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'original-password-1', account: 'bad@email' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('ADMIN_ACCOUNT_INVALID');
  });

  it('rejects wrong current password', async () => {
    const admin = await createAdminWithPassword('original-password-1');
    const r = await app.request('/api/admin/me/account', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'wrong', account: 'newadmin1' }),
    });
    expect(r.status).toBe(401);
    expect((await r.json()).error.code).toBe('CURRENT_PASSWORD_WRONG');
  });

  it('changes account and writes audit log', async () => {
    const admin = await createAdminWithPassword('original-password-1');
    const r = await app.request('/api/admin/me/account', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'original-password-1', account: 'newadmin1' }),
    });
    expect(r.status).toBe(200);
    const refreshed = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(refreshed.email).toBe('newadmin1');
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'admin.account_change' } });
    expect(log.payloadBefore).toMatchObject({ account: admin.email });
    expect(log.payloadAfter).toMatchObject({ account: 'newadmin1' });
  });
});
