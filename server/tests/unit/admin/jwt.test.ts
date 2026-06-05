import { describe, it, expect } from 'vitest';
import { signAdminSession, verifyAdminSession } from '../../../src/admin/auth/jwt.js';

describe('admin session JWT', () => {
  it('round-trips adminUserId + email', async () => {
    const token = await signAdminSession({ adminUserId: 'admin_1', email: 'ops@example.com' });
    const payload = await verifyAdminSession(token);
    expect(payload.adminUserId).toBe('admin_1');
    expect(payload.email).toBe('ops@example.com');
  });

  it('rejects a tampered token', async () => {
    const token = await signAdminSession({ adminUserId: 'admin_1', email: 'ops@example.com' });
    await expect(verifyAdminSession(token.slice(0, -2) + 'aa')).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await signAdminSession(
      { adminUserId: 'admin_x', email: 'x@example.com' },
      { expiresInSeconds: -1 },
    );
    await expect(verifyAdminSession(token)).rejects.toThrow();
  });

  it('rejects a member-side token signed with JWT_SECRET (wrong secret)', async () => {
    const { signSession } = await import('../../../src/auth/jwt.js');
    const memberToken = await signSession({ userId: 'user_1' });
    await expect(verifyAdminSession(memberToken)).rejects.toThrow();
  });
});
