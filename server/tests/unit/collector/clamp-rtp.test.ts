import { describe, expect, it } from 'vitest';
import { clampRtp } from '../../../src/collector/atg/store.js';

describe('clampRtp', () => {
  it('範圍內的值原樣保留', () => {
    expect(clampRtp('114.44')).toBe('114.44');
    expect(clampRtp('99999.99')).toBe('99999.99');
    expect(clampRtp('0')).toBe('0');
  });
  it('超過 Decimal(7,2) 上限夾到 ±99999.99', () => {
    expect(clampRtp('123456.78')).toBe('99999.99');
    expect(clampRtp('-100000')).toBe('-99999.99');
  });
  it('null 維持 null', () => {
    expect(clampRtp(null)).toBeNull();
  });
});
