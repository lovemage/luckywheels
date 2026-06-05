import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { prisma } from '../../../src/db.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { clearRateLimitBucket } from '../../../src/admin/auth/rate-limit.js';
import { ADMIN_SESSION_COOKIE } from '../../../src/admin/auth/cookies.js';

describe('admin auth flow', () => {
  beforeEach(async () => {
    await resetDb();
    clearRateLimitBucket();
  });

  it('POST /api/admin/auth/login → 200 + sets cookie + writes login_succeeded audit', async () => {
    await createAdmin({ email: 'ops@example.com', password: 'right-password-12' });
    const r = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ops@example.com', password: 'right-password-12' }),
    });
    expect(r.status).toBe(200);
    const setCookie = r.headers.getSetCookie().find((l) => l.startsWith(ADMIN_SESSION_COOKIE));
    expect(setCookie).toBeDefined();
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);

    const audits = await prisma.adminActionLog.findMany();
    expect(audits).toHaveLength(1);
    expect(audits[0]?.event).toBe('admin.login_succeeded');
  });

  it('updates lastLoginAt on success', async () => {
    await createAdmin({ email: 'ops@example.com', password: 'right-password-12' });
    await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ops@example.com', password: 'right-password-12' }),
    });
    const fresh = await prisma.adminUser.findUnique({ where: { email: 'ops@example.com' } });
    expect(fresh?.lastLoginAt).not.toBeNull();
  });

  it('wrong password → 401 BAD_CREDENTIALS + login_failed audit', async () => {
    await createAdmin({ email: 'ops@example.com', password: 'right-password-12' });
    const r = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ops@example.com', password: 'wrong' }),
    });
    expect(r.status).toBe(401);
    expect((await r.json()).error.code).toBe('BAD_CREDENTIALS');
    const audits = await prisma.adminActionLog.findMany();
    expect(audits).toHaveLength(1);
    expect(audits[0]?.event).toBe('admin.login_failed');
    expect(audits[0]?.payloadAfter).toMatchObject({ emailTried: 'ops@example.com' });
  });

  it('non-existent email → 401 BAD_CREDENTIALS (same as wrong password)', async () => {
    const r = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'whatever' }),
    });
    expect(r.status).toBe(401);
    expect((await r.json()).error.code).toBe('BAD_CREDENTIALS');
  });

  it('6th failure within window → 429 LOGIN_RATE_LIMITED', async () => {
    await createAdmin({ email: 'ops@example.com', password: 'right-password-12' });
    for (let i = 0; i < 5; i++) {
      await app.request('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'ops@example.com', password: 'wrong' }),
      });
    }
    const r = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ops@example.com', password: 'right-password-12' }),
    });
    expect(r.status).toBe(429);
    expect((await r.json()).error.code).toBe('LOGIN_RATE_LIMITED');
  });

  it('GET /api/admin/me → 401 without cookie', async () => {
    const r = await app.request('/api/admin/me');
    expect(r.status).toBe(401);
  });

  it('GET /api/admin/me with valid cookie → admin profile', async () => {
    const admin = await createAdmin({ email: 'ops@example.com' });
    const r = await app.request('/api/admin/me', { headers: await adminHeaders(admin.id, admin.email) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({ id: admin.id, email: 'ops@example.com', role: 'admin' });
  });

  it('POST /api/admin/auth/logout clears cookie', async () => {
    const r = await app.request('/api/admin/auth/logout', { method: 'POST' });
    expect(r.status).toBe(204);
    const setCookie = r.headers.getSetCookie().find((l) => l.startsWith(ADMIN_SESSION_COOKIE));
    expect(setCookie).toMatch(new RegExp(`${ADMIN_SESSION_COOKIE}=;`));
  });
});
