import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { prisma } from '../../src/db.js';
import { createUser } from '../helpers/factories.js';
import { signSession } from '../../src/auth/jwt.js';
import { SESSION_COOKIE } from '../../src/auth/cookies.js';

async function H(id: string) {
  const t = await signSession({ userId: id });
  return { cookie: `${SESSION_COOKIE}=${t}`, 'content-type': 'application/json' };
}

describe('POST /api/onboarding/profile', () => {
  beforeEach(resetDb);

  it('401 without session', async () => {
    const r = await app.request('/api/onboarding/profile', {
      method: 'POST', body: JSON.stringify({ nickname: '小明', code: 'EM_12345' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(r.status).toBe(401);
  });

  it('first onboard: writes both fields and surfaces them via /api/me', async () => {
    const u = await createUser({ nickname: null, entertainmentMemberCode: null });
    const r = await app.request('/api/onboarding/profile', {
      method: 'POST', headers: await H(u.id),
      body: JSON.stringify({ nickname: '小明', code: 'EM_654321' }),
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      nickname: '小明',
      entertainmentMemberCode: 'EM_654321',
      accountType: 'pending',
    });

    const me = await app.request('/api/me', { headers: await H(u.id) });
    const body = await me.json();
    expect(body.nickname).toBe('小明');
    expect(body.entertainmentMemberCode).toBe('EM_654321');
    expect(body.accountType).toBe('pending');

    const fresh = await prisma.user.findUnique({ where: { id: u.id } });
    expect(fresh?.nickname).toBe('小明');
    expect(fresh?.entertainmentMemberCode).toBe('EM_654321');
    expect(fresh?.entertainmentCodeBoundAt).not.toBeNull();
    expect(fresh?.accountType).toBe('pending');
  });

  it('400 NICKNAME_INVALID on bad nickname', async () => {
    const u = await createUser({ nickname: null, entertainmentMemberCode: null });
    const bad = ['', ' ', '\t', 'a', 'a'.repeat(13), '     '];
    for (const nickname of bad) {
      const r = await app.request('/api/onboarding/profile', {
        method: 'POST', headers: await H(u.id),
        body: JSON.stringify({ nickname, code: 'EM_VALID01' }),
      });
      expect(r.status).toBe(400);
      expect((await r.json()).error.code).toBe('NICKNAME_INVALID');
    }
  });

  it('400 ENTERTAINMENT_CODE_INVALID on bad code', async () => {
    const u = await createUser({ nickname: null, entertainmentMemberCode: null });
    const bad = ['', 'ab', 'has space', '!!!', 'a'.repeat(50)];
    for (const code of bad) {
      const r = await app.request('/api/onboarding/profile', {
        method: 'POST', headers: await H(u.id),
        body: JSON.stringify({ nickname: '阿明', code }),
      });
      expect(r.status).toBe(400);
      expect((await r.json()).error.code).toBe('ENTERTAINMENT_CODE_INVALID');
    }
  });

  it('409 ENTERTAINMENT_CODE_TAKEN when another user already bound this code', async () => {
    await createUser({ nickname: '其他', entertainmentMemberCode: 'EM_SHARED' });
    const u2 = await createUser({ nickname: null, entertainmentMemberCode: null });
    const r = await app.request('/api/onboarding/profile', {
      method: 'POST', headers: await H(u2.id),
      body: JSON.stringify({ nickname: '我們', code: 'EM_SHARED' }),
    });
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe('ENTERTAINMENT_CODE_TAKEN');
  });

  it('409 ENTERTAINMENT_CODE_ALREADY_BOUND when this user tries to change code', async () => {
    const u = await createUser({ nickname: '小明', entertainmentMemberCode: 'EM_OLD' });
    const r = await app.request('/api/onboarding/profile', {
      method: 'POST', headers: await H(u.id),
      body: JSON.stringify({ nickname: '小明', code: 'EM_NEW' }),
    });
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe('ENTERTAINMENT_CODE_ALREADY_BOUND');
  });

  it('same code + different nickname → 200, nickname updated, code unchanged', async () => {
    const u = await createUser({ nickname: '舊名', entertainmentMemberCode: 'EM_SAME' });
    const r = await app.request('/api/onboarding/profile', {
      method: 'POST', headers: await H(u.id),
      body: JSON.stringify({ nickname: '新名', code: 'EM_SAME' }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.nickname).toBe('新名');
    expect(body.entertainmentMemberCode).toBe('EM_SAME');

    const fresh = await prisma.user.findUnique({ where: { id: u.id } });
    expect(fresh?.nickname).toBe('新名');
    expect(fresh?.accountType).toBe('verified');
  });
});
