import { describe, it, expect } from 'vitest';
import { parseTier, resolveThreshold, DEFAULT_TIERS } from '../../../src/draw/tier.js';

const thresholds = [
  { points: 6, draws: 1 },
  { points: 15, draws: 3 },
  { points: 25, draws: 5 },
];

describe('parseTier', () => {
  it('accepts "single"', () => expect(parseTier('single')).toBe('single'));
  it('accepts "multi"', () => expect(parseTier('multi')).toBe('multi'));
  it('throws on garbage', () => expect(() => parseTier('huge')).toThrow(/TIER_INVALID/));
});

describe('resolveThreshold', () => {
  it('single → first threshold', () => {
    expect(resolveThreshold('single', thresholds)).toEqual({ points: 6, draws: 1 });
  });
  it('multi → last threshold', () => {
    expect(resolveThreshold('multi', thresholds)).toEqual({ points: 25, draws: 5 });
  });
  it('throws on empty threshold list', () => {
    expect(() => resolveThreshold('single', [])).toThrow(/POINT_THRESHOLDS_EMPTY/);
  });
});

describe('DEFAULT_TIERS', () => {
  it('exports the union literal', () => {
    expect(DEFAULT_TIERS).toEqual(['single', 'multi']);
  });
});
