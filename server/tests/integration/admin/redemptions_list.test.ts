import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser, createPrize, createRedemption, createDrawLog } from '../../helpers/factories.js';

describe('GET /api/admin/redemptions', () => {
  beforeEach(resetDb);

  it('filters by status=pending', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    await createRedemption({ userId: u.id, status: 'pending', code: 'AAAA1111-1111-1111' });
    await createRedemption({ userId: u.id, status: 'delivered', code: 'BBBB2222-2222-2222' });
    const r = await app.request('/api/admin/redemptions?status=pending', { headers: await adminHeaders(admin.id, admin.email) });
    const body = await r.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].code).toBe('AAAA1111-1111-1111');
  });

  it('exact code match accepts LW- prefix and bare code', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    await createRedemption({ userId: u.id, code: 'XYZA9999-1111-1111' });
    const headers = await adminHeaders(admin.id, admin.email);
    expect((await (await app.request('/api/admin/redemptions?code=XYZA9999-1111-1111', { headers })).json()).items).toHaveLength(1);
    expect((await (await app.request('/api/admin/redemptions?code=LW-XYZA9999-1111-1111', { headers })).json()).items).toHaveLength(1);
    expect((await (await app.request('/api/admin/redemptions?code=NOPE', { headers })).json()).items).toHaveLength(0);
  });

  it('filters by userId', async () => {
    const admin = await createAdmin();
    const u1 = await createUser();
    const u2 = await createUser();
    await createRedemption({ userId: u1.id });
    await createRedemption({ userId: u2.id });
    const r = await app.request(`/api/admin/redemptions?userId=${u1.id}`, { headers: await adminHeaders(admin.id, admin.email) });
    expect((await r.json()).items).toHaveLength(1);
  });

  it('returns actual tierDraws for non-10 multi redemptions', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const p = await createPrize();
    const red = await createRedemption({ userId: u.id, tier: 'multi', status: 'pending', code: 'THRE3333-3333-3333' });
    for (let i = 0; i < 3; i++) {
      await createDrawLog({ userId: u.id, redemptionId: red.id, prizeId: p.id, subIndex: i, tier: 'multi', tierCost: 15, tierDraws: 3 });
    }
    const r = await app.request('/api/admin/redemptions?code=THRE3333-3333-3333', { headers: await adminHeaders(admin.id, admin.email) });
    const body = await r.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].tier).toBe('multi');
    expect(body.items[0].tierDraws).toBe(3);
  });

  it('cursor pagination', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    for (let i = 0; i < 5; i++) await createRedemption({ userId: u.id });
    const r = await app.request('/api/admin/redemptions?take=2', { headers: await adminHeaders(admin.id, admin.email) });
    const body = await r.json();
    expect(body.items).toHaveLength(2);
    expect(body.nextCursor).toBeTruthy();
  });
});
