import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser } from '../../helpers/factories.js';

describe('PATCH /api/admin/users/:id/entertainment-code', () => {
  beforeEach(resetDb);

  it('rebinds code and records before/after', async () => {
    const admin = await createAdmin();
    const user = await createUser({ entertainmentMemberCode: 'EM_OLD' });
    const r = await app.request(`/api/admin/users/${user.id}/entertainment-code`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'EM_NEW', reason: '客戶反映輸錯' }),
    });
    expect(r.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u!.entertainmentMemberCode).toBe('EM_NEW');
    expect(u!.entertainmentCodeBoundAt).toBeTruthy();
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'user.entertainment_code_change' } });
    expect(log.payloadBefore).toMatchObject({ code: 'EM_OLD' });
    expect(log.payloadAfter).toMatchObject({ code: 'EM_NEW', reason: '客戶反映輸錯' });
  });

  it('clears code when code=null', async () => {
    const admin = await createAdmin();
    const user = await createUser({ entertainmentMemberCode: 'EM_X' });
    const r = await app.request(`/api/admin/users/${user.id}/entertainment-code`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ code: null, reason: '退款後解除' }),
    });
    expect(r.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u!.entertainmentMemberCode).toBeNull();
    expect(u!.entertainmentCodeBoundAt).toBeNull();
  });

  it('rejects collision with another user → 409 ENTERTAINMENT_CODE_TAKEN', async () => {
    const admin = await createAdmin();
    await createUser({ entertainmentMemberCode: 'EM_SHARED' });
    const target = await createUser({ entertainmentMemberCode: 'EM_OTHER' });
    const r = await app.request(`/api/admin/users/${target.id}/entertainment-code`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'EM_SHARED', reason: 'merge typo' }),
    });
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe('ENTERTAINMENT_CODE_TAKEN');
  });

  it('reason missing → 400', async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const r = await app.request(`/api/admin/users/${user.id}/entertainment-code`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'EM_NEW' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('ENTERTAINMENT_CODE_REASON_REQUIRED');
  });
});
