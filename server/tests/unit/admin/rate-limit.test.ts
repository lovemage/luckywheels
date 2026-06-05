import { describe, it, expect, beforeEach } from 'vitest';
import { recordLoginFailure, isLoginLocked, clearRateLimitBucket } from '../../../src/admin/auth/rate-limit.js';

describe('login rate limit', () => {
  beforeEach(clearRateLimitBucket);

  it('allows the first 5 failures', () => {
    for (let i = 0; i < 5; i++) {
      expect(isLoginLocked('1.2.3.4')).toBe(false);
      recordLoginFailure('1.2.3.4');
    }
  });

  it('locks after 5 failures within the window', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure('1.2.3.4');
    expect(isLoginLocked('1.2.3.4')).toBe(true);
  });

  it('different IPs are tracked independently', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure('1.2.3.4');
    expect(isLoginLocked('1.2.3.4')).toBe(true);
    expect(isLoginLocked('5.6.7.8')).toBe(false);
  });

  it('clears expired entries after the window', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure('1.2.3.4', Date.now() - 61_000);
    expect(isLoginLocked('1.2.3.4')).toBe(false);
  });
});
