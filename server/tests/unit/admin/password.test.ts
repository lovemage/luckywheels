import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../../src/admin/auth/password.js';

describe('password hashing', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toBe('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('right');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('rejects a malformed hash', async () => {
    expect(await verifyPassword('any', 'not-a-bcrypt-hash')).toBe(false);
  });
});
