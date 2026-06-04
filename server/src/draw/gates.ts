export type GateReason = 'min_draws' | 'cooldown' | 'payout_cap';

export interface GateUserState {
  /** POST-deduct lifetime draw count (already incremented by tierDraws). */
  lifetimeDrawCount: number;
  lastWinDrawIndex: number | null;
}
export interface GateTotals { totalPayoutAmount: number; totalPointsBurned: number; }
export interface GateSettings {
  minDrawsBeforeWin: number;
  cooldownDrawsAfterWin: number;
  payoutCapEnabled: boolean;
  payoutCapRatio: number;
}

/** Caller must pass post-deduct counters. min_draws unblocks at the Nth draw, not the (N+1)th. */
export function evaluateGates(
  user: GateUserState, totals: GateTotals, s: GateSettings,
): GateReason | null {
  if (s.minDrawsBeforeWin > 0 && user.lifetimeDrawCount < s.minDrawsBeforeWin) return 'min_draws';
  if (
    s.cooldownDrawsAfterWin > 0 &&
    user.lastWinDrawIndex !== null &&
    user.lifetimeDrawCount - user.lastWinDrawIndex < s.cooldownDrawsAfterWin
  ) return 'cooldown';  // spec uses `<`, not `<=`: a diff == cooldown means the cooldown window just closed
  if (s.payoutCapEnabled) {
    const denom = Math.max(totals.totalPointsBurned, 1);
    if (totals.totalPayoutAmount / denom > s.payoutCapRatio) return 'payout_cap';
  }
  return null;
}
