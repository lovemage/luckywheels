import { describe, it, expect } from 'vitest';
import { deriveTier, resolveThreshold, DEFAULT_TIERS } from '../../../src/draw/tier.js';

// 抽獎 API 以 `draws`（必須等於某個 pointThreshold 的 draws）選擇方案；tier 由 draws 推導
const thresholds = [
  { points: 6, draws: 1 },
  { points: 15, draws: 3 },
  { points: 48, draws: 10 },
];

describe('resolveThreshold', () => {
  it('finds the threshold whose draws match', () => {
    expect(resolveThreshold(1, thresholds)).toEqual({ points: 6, draws: 1 });
    expect(resolveThreshold(10, thresholds)).toEqual({ points: 48, draws: 10 });
  });
  it('throws TIER_INVALID when no threshold matches', () => {
    expect(() => resolveThreshold(2, thresholds)).toThrow(/TIER_INVALID/);
  });
  it('throws on empty threshold list', () => {
    expect(() => resolveThreshold(1, [])).toThrow(/POINT_THRESHOLDS_EMPTY/);
  });
});

describe('deriveTier', () => {
  it('1 draw is single, anything else is multi', () => {
    expect(deriveTier({ points: 6, draws: 1 })).toBe('single');
    expect(deriveTier({ points: 15, draws: 3 })).toBe('multi');
    expect(deriveTier({ points: 48, draws: 10 })).toBe('multi');
  });
});

describe('DEFAULT_TIERS', () => {
  it('exports the union literal', () => {
    expect(DEFAULT_TIERS).toEqual(['single', 'multi']);
  });
});
