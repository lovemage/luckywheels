import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from '../../../src/auth/jwt.js';

describe('session JWT', () => {
  it('round-trips userId', async () => {
    const t = await signSession({ userId: 'u_1' });
    expect((await verifySession(t)).userId).toBe('u_1');
  });
  it('rejects tampered tokens', async () => {
    const t = await signSession({ userId: 'u_1' });
    await expect(verifySession(t.slice(0, -2) + 'aa')).rejects.toThrow();
  });
  it('rejects expired tokens', async () => {
    const t = await signSession({ userId: 'u_x' }, { expiresInSeconds: -1 });
    await expect(verifySession(t)).rejects.toThrow();
  });
});
