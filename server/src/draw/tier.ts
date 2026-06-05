export type Tier = 'single' | 'multi';
export const DEFAULT_TIERS: readonly Tier[] = ['single', 'multi'];

export interface Threshold { points: number; draws: number; }

export function deriveTier(threshold: Threshold): Tier {
  return threshold.draws === 1 ? 'single' : 'multi';
}

export function resolveThreshold(draws: number, thresholds: Threshold[]): Threshold {
  if (thresholds.length === 0) throw new Error('POINT_THRESHOLDS_EMPTY');
  const threshold = thresholds.find((item) => item.draws === draws);
  if (!threshold) throw new Error('TIER_INVALID');
  return threshold;
}
