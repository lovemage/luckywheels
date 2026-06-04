import { describe, it, expect } from 'vitest';
import { signState, verifyState } from '../../../src/auth/line.js';

describe('signed state', () => {
  it('round-trips a state value', async () => {
    const token = await signState('abc-123');
    expect(await verifyState(token)).toBe('abc-123');
  });
  it('rejects tampered values', async () => {
    const token = await signState('abc-123');
    await expect(verifyState(token.slice(0, -2) + 'zz')).rejects.toThrow();
  });
  it('rejects expired values', async () => {
    const token = await signState('abc-123', { ttlSeconds: -1 });
    await expect(verifyState(token)).rejects.toThrow();
  });
});
