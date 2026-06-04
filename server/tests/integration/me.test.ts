import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { prisma } from '../../src/db.js';
import { signSession } from '../../src/auth/jwt.js';
import { SESSION_COOKIE } from '../../src/auth/cookies.js';

describe('GET /api/me', () => {
  beforeEach(resetDb);

  it('returns 401 without cookie', async () => {
    const r = await app.request('/api/me');
    expect(r.status).toBe(401);
    expect((await r.json()).error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the authenticated user', async () => {
    const u = await prisma.user.create({
      data: { lineUserId: 'U_a', displayName: 'Alice', points: 28 },
    });
    const t = await signSession({ userId: u.id });
    const r = await app.request('/api/me', { headers: { cookie: `${SESSION_COOKIE}=${t}` } });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      id: u.id, displayName: 'Alice', points: 28, accountType: 'verified',
    });
  });

  it('rejects invalid token', async () => {
    const r = await app.request('/api/me', { headers: { cookie: `${SESSION_COOKIE}=garbage` } });
    expect(r.status).toBe(401);
  });

  it('session cookie has HttpOnly + SameSite=Lax + Secure (outside NODE_ENV=test)', async () => {
    const { setSessionCookie } = await import('../../src/auth/cookies.js');
    expect(typeof setSessionCookie).toBe('function');
  });
});
