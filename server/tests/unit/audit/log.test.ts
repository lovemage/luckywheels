import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../../src/db.js';
import { resetDb } from '../../helpers/db.js';
import { writeAdminActionLog } from '../../../src/audit/log.js';

describe('writeAdminActionLog', () => {
  beforeEach(resetDb);

  it('writes a system event with null adminUserId', async () => {
    await writeAdminActionLog(prisma, {
      event: 'draw_blocked_blacklist',
      targetType: 'user',
      targetId: 'user_x',
      ip: '127.0.0.1',
    });
    const rows = await prisma.adminActionLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.event).toBe('draw_blocked_blacklist');
    expect(rows[0]?.adminUserId).toBeNull();
    expect(rows[0]?.targetId).toBe('user_x');
  });

  it('persists payload diff', async () => {
    await writeAdminActionLog(prisma, {
      adminUserId: 'admin_1',
      event: 'user.blacklist_set',
      targetType: 'user',
      targetId: 'user_x',
      payloadBefore: { accountType: 'verified' },
      payloadAfter: { accountType: 'blacklisted', reason: 'fraud' },
    });
    const row = await prisma.adminActionLog.findFirst();
    expect(row?.payloadBefore).toEqual({ accountType: 'verified' });
    expect(row?.payloadAfter).toEqual({ accountType: 'blacklisted', reason: 'fraud' });
  });

  it('accepts a transaction client (atomicity contract)', async () => {
    await prisma.$transaction(async (tx) => {
      await writeAdminActionLog(tx, { event: 'test.in_tx' });
    });
    expect(await prisma.adminActionLog.count()).toBe(1);
  });
});
