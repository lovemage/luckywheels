import { describe, it, expect } from 'vitest';
import { evaluateGates } from '../../../src/draw/gates.js';

const baseUser = { lifetimeDrawCount: 0, lastWinDrawIndex: null as number | null };
const baseTotals = { totalPayoutAmount: 0, totalPointsBurned: 0 };
const baseSettings = {
  minDrawsBeforeWin: 0,
  cooldownDrawsAfterWin: 0,
  payoutCapEnabled: false,
  payoutCapRatio: 0.45,
};

describe('evaluateGates (post-deduct semantics)', () => {
  it('null when no gate triggers', () => {
    expect(evaluateGates(baseUser, baseTotals, baseSettings)).toBeNull();
  });
  it('min_draws: blocks while POST-deduct draw count below threshold', () => {
    // user just did their 5th draw; threshold is 5; per spec the 5th draw
    // should be the FIRST eligible draw → gate must NOT trigger
    expect(evaluateGates(
      { ...baseUser, lifetimeDrawCount: 5 }, baseTotals, { ...baseSettings, minDrawsBeforeWin: 5 },
    )).toBeNull();
    // user just did their 4th draw — still below threshold
    expect(evaluateGates(
      { ...baseUser, lifetimeDrawCount: 4 }, baseTotals, { ...baseSettings, minDrawsBeforeWin: 5 },
    )).toBe('min_draws');
  });
  it('cooldown: blocks if current draw is within cooldown window after last win', () => {
    // lastWinDrawIndex=2, cooldown=5 → draws 3,4,5,6 blocked; draw 7 ok
    expect(evaluateGates({ lifetimeDrawCount: 6, lastWinDrawIndex: 2 }, baseTotals,
      { ...baseSettings, cooldownDrawsAfterWin: 5 })).toBe('cooldown');
    expect(evaluateGates({ lifetimeDrawCount: 7, lastWinDrawIndex: 2 }, baseTotals,
      { ...baseSettings, cooldownDrawsAfterWin: 5 })).toBeNull();
  });
  it('payout_cap: blocks above ratio, ignores when disabled', () => {
    expect(evaluateGates(baseUser, { totalPayoutAmount: 600, totalPointsBurned: 1000 },
      { ...baseSettings, payoutCapEnabled: true, payoutCapRatio: 0.45 })).toBe('payout_cap');
    expect(evaluateGates(baseUser, { totalPayoutAmount: 1_000_000, totalPointsBurned: 1 },
      { ...baseSettings, payoutCapEnabled: false })).toBeNull();
  });
  it('order: min_draws beats cooldown beats payout_cap', () => {
    expect(evaluateGates(
      { lifetimeDrawCount: 1, lastWinDrawIndex: 0 },
      { totalPayoutAmount: 10_000, totalPointsBurned: 1 },
      { minDrawsBeforeWin: 5, cooldownDrawsAfterWin: 5, payoutCapEnabled: true, payoutCapRatio: 0.45 },
    )).toBe('min_draws');
  });
});
