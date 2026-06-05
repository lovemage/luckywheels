import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../../src/db.js';
import { resetDb } from '../../helpers/db.js';
import { createAdminAccount } from '../../../scripts/create-admin.js';
import { verifyPassword } from '../../../src/admin/auth/password.js';

describe('createAdminAccount', () => {
  beforeEach(resetDb);

  it('creates an admin row with hashed password', async () => {
    await createAdminAccount({ email: 'first@example.com', password: 'pw-1234567890' });
    const row = await prisma.adminUser.findUnique({ where: { email: 'first@example.com' } });
    expect(row).not.toBeNull();
    expect(row?.passwordHash).not.toBe('pw-1234567890');
    expect(await verifyPassword('pw-1234567890', row!.passwordHash)).toBe(true);
  });

  it('rejects passwords shorter than 8 chars', async () => {
    await expect(createAdminAccount({ email: 'short@example.com', password: 'abc' }))
      .rejects.toThrow(/at least 8/);
  });

  it('throws if email already exists', async () => {
    await createAdminAccount({ email: 'dup@example.com', password: 'pw-1234567890' });
    await expect(createAdminAccount({ email: 'dup@example.com', password: 'pw-1234567890' }))
      .rejects.toThrow(/already exists/);
  });
});
