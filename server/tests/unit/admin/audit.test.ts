import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { audit } from '../../../src/admin/audit/helper.js';

function fakeContext(opts: {
  admin: { id: string };
  ip?: string;
  userAgent?: string;
}) {
  return {
    get(key: string) {
      if (key === 'admin') return opts.admin;
      return undefined;
    },
    req: {
      header(name: string) {
        if (name === 'x-forwarded-for') return opts.ip;
        if (name === 'user-agent') return opts.userAgent;
        return undefined;
      },
    },
  } as unknown as import('hono').Context;
}

describe('audit(c, ...) helper', () => {
  beforeEach(resetDb);

  it('writes adminUserId / ip / userAgent / event / target / payloads', async () => {
    const ctx = fakeContext({ admin: { id: 'admin_42' }, ip: '127.0.0.1', userAgent: 'TestUA' });
    await audit(ctx, prisma, {
      event: 'user.points_topup',
      targetType: 'user',
      targetId: 'user_1',
      payloadBefore: { points: 10 },
      payloadAfter: { points: 60 },
      note: 'gift',
    });
    const rows = await prisma.adminActionLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      adminUserId: 'admin_42',
      event: 'user.points_topup',
      targetType: 'user',
      targetId: 'user_1',
      ip: '127.0.0.1',
      userAgent: 'TestUA',
      note: 'gift',
    });
    expect(rows[0]?.payloadBefore).toEqual({ points: 10 });
    expect(rows[0]?.payloadAfter).toEqual({ points: 60 });
  });

  it('still writes when admin is missing (system event); adminUserId becomes null', async () => {
    const ctx = fakeContext({ admin: undefined as unknown as { id: string }, ip: '127.0.0.1' });
    await audit(ctx, prisma, { event: 'draw_blocked_blacklist', targetType: 'user', targetId: 'user_x' });
    const row = await prisma.adminActionLog.findFirst();
    expect(row?.adminUserId).toBeNull();
    expect(row?.event).toBe('draw_blocked_blacklist');
  });

  it('accepts a transaction client and writes inside it', async () => {
    const ctx = fakeContext({ admin: { id: 'admin_tx' } });
    await prisma.$transaction(async (tx) => {
      await audit(ctx, tx, { event: 'admin.password_changed' });
    });
    expect(await prisma.adminActionLog.count()).toBe(1);
  });
});
