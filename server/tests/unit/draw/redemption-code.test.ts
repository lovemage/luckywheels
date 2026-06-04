import { describe, it, expect } from 'vitest';
import { generateRedemptionCode, isValidRedemptionCode } from '../../../src/draw/redemption-code.js';

describe('generateRedemptionCode', () => {
  it('returns 14 chars: 12 base32 + 2 dashes', () => {
    const c = generateRedemptionCode();
    expect(c).toHaveLength(14);
    expect(c[4]).toBe('-');
    expect(c[9]).toBe('-');
  });

  it('uses Crockford alphabet (no I/L/O/U)', () => {
    for (let i = 0; i < 200; i++) {
      const c = generateRedemptionCode().replace(/-/g, '');
      expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    }
  });

  it('is reasonably unique over 10k calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(generateRedemptionCode());
    expect(seen.size).toBe(10_000);
  });

  it('isValidRedemptionCode round-trips', () => {
    const c = generateRedemptionCode();
    expect(isValidRedemptionCode(c)).toBe(true);
    expect(isValidRedemptionCode('XXXX-XXXX')).toBe(false);
    expect(isValidRedemptionCode('K3F7PRA2NX9V')).toBe(false);    // missing dashes
    expect(isValidRedemptionCode('K3F7-PRA2-NXOV')).toBe(false);  // contains O
  });
});
