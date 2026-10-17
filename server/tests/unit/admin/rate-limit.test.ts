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

  it('keeps a sliding window after many concurrent failures', () => {
    for (let i = 0; i < 100; i++) recordLoginFailure('1.2.3.4', 1_000 + i * 100);
    expect(isLoginLocked('1.2.3.4', 70_000)).toBe(true);
    expect(isLoginLocked('1.2.3.4', 70_500)).toBe(false);
  });

  it('bounds unique IPs without evicting locks and reclaims IPs that never return', () => {
    for (let i = 0; i < 10_000; i++) recordLoginFailure(`ip-${i}`, 1_000);
    for (let i = 0; i < 5; i++) recordLoginFailure('ip-0', 2_000);
    expect(isLoginLocked('new-ip', 2_000)).toBe(true);
    recordLoginFailure('overflow-ip', 2_000);
    expect(isLoginLocked('ip-0', 2_000)).toBe(true);

    // No original IP has to return for its expired bucket to be removed.
    expect(isLoginLocked('new-ip', 61_000)).toBe(false);
    expect(isLoginLocked('ip-0', 61_000)).toBe(true);
    expect(isLoginLocked('overflow-ip', 61_000)).toBe(false);
    recordLoginFailure('new-ip', 61_000);
    expect(isLoginLocked('new-ip', 61_000)).toBe(false);
  });
});
