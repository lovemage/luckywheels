export type Tier = 'single' | 'multi';
export const DEFAULT_TIERS: readonly Tier[] = ['single', 'multi'];

export interface Threshold { points: number; draws: number; }

export function parseTier(input: unknown): Tier {
  if (input === 'single' || input === 'multi') return input;
  throw new Error('TIER_INVALID');
}

export function resolveThreshold(tier: Tier, thresholds: Threshold[]): Threshold {
  if (thresholds.length === 0) throw new Error('POINT_THRESHOLDS_EMPTY');
  return tier === 'single'
    ? thresholds[0]!
    : thresholds[thresholds.length - 1]!;
}
