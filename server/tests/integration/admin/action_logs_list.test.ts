import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser } from '../../helpers/factories.js';
import { prisma } from '../../../src/db.js';

async function seedLog(adminId: string, event: string, targetId: string, payloadAfter: Record<string, unknown> = {}, createdAt?: Date) {
  await prisma.adminActionLog.create({
    data: { adminUserId: adminId, event, targetType: 'user', targetId, payloadAfter, ip: '127.0.0.1', userAgent: 'test', ...(createdAt ? { createdAt } : {}) },
  });
}

describe('GET /api/admin/action-logs', () => {
  beforeEach(resetDb);

  it('returns logs in createdAt desc with adminUser email joined', async () => {
    const admin = await createAdmin({ email: 'op@x.com' });
    const u = await createUser();
    await seedLog(admin.id, 'user.points_adjust', u.id, { delta: 1 });
    const r = await app.request('/api/admin/action-logs', { headers: await adminHeaders(admin.id, admin.email) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.items[0].action).toBe('user.points_adjust');
    expect(body.items[0].adminUser.email).toBe('op@x.com');
  });

  it('filters by action exact match', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    await seedLog(admin.id, 'user.points_adjust', u.id);
    await seedLog(admin.id, 'redemption.claim', u.id);
    const r = await app.request('/api/admin/action-logs?action=redemption.claim', { headers: await adminHeaders(admin.id, admin.email) });
    expect((await r.json()).items).toHaveLength(1);
  });

  it('filters by from/to timestamps', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    await seedLog(admin.id, 'a', u.id, {}, new Date('2026-05-01'));
    await seedLog(admin.id, 'b', u.id, {}, new Date('2026-06-01'));
    const r = await app.request('/api/admin/action-logs?from=2026-05-15&to=2026-06-30', { headers: await adminHeaders(admin.id, admin.email) });
    expect((await r.json()).items).toHaveLength(1);
  });

  it('cursor pagination preserves order', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    for (let i = 0; i < 5; i++) await seedLog(admin.id, `action.${i}`, u.id);
    const r1 = await app.request('/api/admin/action-logs?take=2', { headers: await adminHeaders(admin.id, admin.email) });
    const body1 = await r1.json();
    expect(body1.items).toHaveLength(2);
    expect(body1.nextCursor).toBeTruthy();
    const r2 = await app.request(`/api/admin/action-logs?take=2&cursor=${body1.nextCursor}`, { headers: await adminHeaders(admin.id, admin.email) });
    const body2 = await r2.json();
    expect(body2.items).toHaveLength(2);
    expect(body2.items[0].id).not.toBe(body1.items[1].id);
  });
});
