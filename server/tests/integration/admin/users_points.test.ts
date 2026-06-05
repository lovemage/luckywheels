import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser } from '../../helpers/factories.js';

describe('POST /api/admin/users/:id/points', () => {
  beforeEach(resetDb);

  it('adds points, writes audit log, returns new balance', async () => {
    const admin = await createAdmin();
    const user = await createUser({ points: 5 });
    const r = await app.request(`/api/admin/users/${user.id}/points`, {
      method: 'POST',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ delta: 6, reason: '客服補償' }),
    });
    expect(r.status).toBe(200);
    expect((await r.json()).points).toBe(11);
    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(11);
    const log = await prisma.adminActionLog.findFirst({ where: { event: 'user.points_adjust', targetId: user.id } });
    expect(log).toBeTruthy();
    expect(log!.payloadAfter).toMatchObject({ delta: 6, before: 5, after: 11, reason: '客服補償' });
    expect(log!.adminUserId).toBe(admin.id);
  });

  it('subtracts points and refuses to go negative (POINTS_WOULD_GO_NEGATIVE 422)', async () => {
    const admin = await createAdmin();
    const user = await createUser({ points: 3 });
    const r = await app.request(`/api/admin/users/${user.id}/points`, {
      method: 'POST',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ delta: -10, reason: '修正錯誤' }),
    });
    expect(r.status).toBe(422);
    expect((await r.json()).error.code).toBe('POINTS_WOULD_GO_NEGATIVE');
    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(3);
  });

  it('delta=0 rejected as 400 POINTS_DELTA_ZERO', async () => {
    const admin = await createAdmin();
    const user = await createUser({ points: 1 });
    const r = await app.request(`/api/admin/users/${user.id}/points`, {
      method: 'POST',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ delta: 0, reason: 'noop' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('POINTS_DELTA_ZERO');
  });

  it('reason is optional — adjust without reason succeeds and audit records reason=null', async () => {
    const admin = await createAdmin();
    const user = await createUser({ points: 5 });
    const r = await app.request(`/api/admin/users/${user.id}/points`, {
      method: 'POST',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ delta: 3 }),
    });
    expect(r.status).toBe(200);
    expect((await r.json()).points).toBe(8);
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'user.points_adjust' } });
    expect(log.payloadAfter).toMatchObject({ delta: 3, before: 5, after: 8, reason: null });
  });
});
