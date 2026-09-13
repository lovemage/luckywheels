import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createRedemption, createUser } from '../../helpers/factories.js';

describe('GET /api/admin/users', () => {
  beforeEach(resetDb);

  it('401 without session', async () => {
    const r = await app.request('/api/admin/users');
    expect(r.status).toBe(401);
  });

  it('returns verified users on tab=verified (default)', async () => {
    const admin = await createAdmin();
    await createUser({ nickname: 'A', accountType: 'verified' });
    await createUser({ nickname: 'B', accountType: 'test' });
    await createUser({ nickname: 'C', accountType: 'blacklisted' });
    await createUser({ nickname: 'D', accountType: 'pending' });
    const r = await app.request('/api/admin/users', { headers: await adminHeaders(admin.id, admin.email) });
    const body = await r.json();
    const nicks = body.items.map((u: { nickname: string }) => u.nickname).sort();
    expect(nicks).toEqual(['A', 'C']);
  });

  it('returns only test users on tab=test', async () => {
    const admin = await createAdmin();
    await createUser({ nickname: 'A', accountType: 'verified' });
    await createUser({ nickname: 'B', accountType: 'test' });
    const r = await app.request('/api/admin/users?tab=test', { headers: await adminHeaders(admin.id, admin.email) });
    const body = await r.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].nickname).toBe('B');
  });

  it('returns only pending users on tab=pending', async () => {
    const admin = await createAdmin();
    await createUser({ nickname: 'A', accountType: 'verified' });
    await createUser({ nickname: 'B', accountType: 'pending' });
    const r = await app.request('/api/admin/users?tab=pending', { headers: await adminHeaders(admin.id, admin.email) });
    const body = await r.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].nickname).toBe('B');
  });

  it('search q matches across nickname / displayName / lineUserId / code', async () => {
    const admin = await createAdmin();
    await createUser({ nickname: 'alice', displayName: 'ALICE-LINE', lineUserId: 'U_alice', entertainmentMemberCode: 'EM_AA01' });
    await createUser({ nickname: 'bob', displayName: 'BOB-LINE', lineUserId: 'U_bob', entertainmentMemberCode: 'EM_BB02' });
    const headers = await adminHeaders(admin.id, admin.email);
    expect((await (await app.request('/api/admin/users?q=alice', { headers })).json()).items).toHaveLength(1);
    expect((await (await app.request('/api/admin/users?q=BOB-LINE', { headers })).json()).items).toHaveLength(1);
    expect((await (await app.request('/api/admin/users?q=EM_AA', { headers })).json()).items).toHaveLength(1);
    expect((await (await app.request('/api/admin/users?q=zzz', { headers })).json()).items).toHaveLength(0);
  });

  it('cursor pagination: take=2 + nextCursor', async () => {
    const admin = await createAdmin();
    for (let i = 0; i < 5; i++) await createUser({ nickname: `n${i}` });
    const r = await app.request('/api/admin/users?take=2', { headers: await adminHeaders(admin.id, admin.email) });
    const body = await r.json();
    expect(body.items).toHaveLength(2);
    expect(body.nextCursor).toBeTruthy();
  });

  it('returns attention counts and each member pending winning redemption count', async () => {
    const admin = await createAdmin();
    const member = await createUser({ nickname: '待領獎會員', accountType: 'verified' });
    await createUser({ nickname: '待審核會員', accountType: 'pending' });
    await createRedemption({ userId: member.id, totalWinAmount: 500, status: 'pending' });
    await createRedemption({ userId: member.id, totalWinAmount: 0, status: 'pending' });
    await createRedemption({ userId: member.id, totalWinAmount: 100, status: 'delivered' });
    await createRedemption({ userId: member.id, totalWinAmount: 100, status: 'pending', isTest: true });

    const r = await app.request('/api/admin/users', {
      headers: await adminHeaders(admin.id, admin.email),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.alerts).toEqual({ pendingApprovalCount: 1, pendingRedemptionCount: 1 });
    expect(body.items.find((u: { id: string }) => u.id === member.id)?.pendingRedemptionCount).toBe(1);
  });
});
