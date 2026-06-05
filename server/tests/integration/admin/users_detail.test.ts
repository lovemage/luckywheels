import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser } from '../../helpers/factories.js';

describe('GET /api/admin/users/:id', () => {
  beforeEach(resetDb);

  it('returns the full user record', async () => {
    const admin = await createAdmin();
    const user = await createUser({ nickname: 'Test', points: 28, accountType: 'test', testSkipCost: true, testForcePrizeId: null });
    const r = await app.request(`/api/admin/users/${user.id}`, { headers: await adminHeaders(admin.id, admin.email) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({
      id: user.id, nickname: 'Test', accountType: 'test',
      testSkipCost: true, testForcePrizeId: null,
      points: 28,
    });
    expect(body.entertainmentMemberCode).not.toBeNull();
  });

  it('404 USER_NOT_FOUND when id missing', async () => {
    const admin = await createAdmin();
    const r = await app.request('/api/admin/users/does_not_exist', { headers: await adminHeaders(admin.id, admin.email) });
    expect(r.status).toBe(404);
    expect((await r.json()).error.code).toBe('USER_NOT_FOUND');
  });
});
