import type { CandidatePrize } from './types.js';

export function pickPrize<T extends CandidatePrize>(
  prizes: T[],
  rng: () => number = Math.random,
): T {
  const active = prizes.filter((p) => p.enabled && p.stock > 0);
  if (active.length === 0) throw new Error('NO_ACTIVE_PRIZE');
  const total = active.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) throw new Error('ZERO_WEIGHT');
  let roll = rng() * total;
  for (const p of active) {
    roll -= p.weight;
    if (roll < 0) return p;
  }
  return active[active.length - 1]!;
}
