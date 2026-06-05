import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser, createPrize, createRedemption, createDrawLog } from '../../helpers/factories.js';

describe('GET /api/admin/redemptions/:id', () => {
  beforeEach(resetDb);

  it('returns the full record + draws + user', async () => {
    const admin = await createAdmin();
    const u = await createUser({ nickname: 'Alice' });
    const p = await createPrize();
    const red = await createRedemption({ userId: u.id, tier: 'multi', status: 'pending' });
    await createDrawLog({ userId: u.id, redemptionId: red.id, prizeId: p.id, subIndex: 0 });
    await createDrawLog({ userId: u.id, redemptionId: red.id, prizeId: p.id, subIndex: 1 });
    const r = await app.request(`/api/admin/redemptions/${red.id}`, { headers: await adminHeaders(admin.id, admin.email) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.id).toBe(red.id);
    expect(body.draws).toHaveLength(2);
    expect(body.user.nickname).toBe('Alice');
  });

  it('404 when missing', async () => {
    const admin = await createAdmin();
    const r = await app.request('/api/admin/redemptions/nope', { headers: await adminHeaders(admin.id, admin.email) });
    expect(r.status).toBe(404);
    expect((await r.json()).error.code).toBe('REDEMPTION_NOT_FOUND');
  });
});
