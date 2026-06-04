import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db.js';
import { SETTINGS_KEYS } from '../../prisma/seed.js';
import type { Threshold } from './tier.js';

type Tx = PrismaClient | Prisma.TransactionClient;

export interface DrawSettings {
  pointThresholds: Threshold[];
  spinDurationMs: number;
  minDrawsBeforeWin: number;
  cooldownDrawsAfterWin: number;
  payoutCapEnabled: boolean;
  payoutCapRatio: number;
  consolationPrizeId: string;
}

export async function readDrawSettings(): Promise<DrawSettings> {
  const rows = await prisma.appSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const n = (k: string) => Number(map.get(k) ?? '0');
  const s = (k: string) => map.get(k) ?? '';
  let thresholds: Threshold[] = [];
  try { thresholds = JSON.parse(s(SETTINGS_KEYS.pointThresholds)); } catch { /* fall through */ }
  return {
    pointThresholds: thresholds,
    spinDurationMs: n(SETTINGS_KEYS.spinDurationMs),
    minDrawsBeforeWin: n(SETTINGS_KEYS.minDrawsBeforeWin),
    cooldownDrawsAfterWin: n(SETTINGS_KEYS.cooldownDrawsAfterWin),
    payoutCapEnabled: s(SETTINGS_KEYS.payoutCapEnabled) === 'true',
    payoutCapRatio: Number(s(SETTINGS_KEYS.payoutCapRatio) || '0'),
    consolationPrizeId: s(SETTINGS_KEYS.consolationPrizeId),
  };
}

/**
 * Read system totals under FOR UPDATE row locks. This must happen INSIDE the
 * draw transaction so concurrent draws serialize on these rows, preventing the
 * payout-cap race where two parallel wins both pass a stale cap check
 * (addresses Codex finding B1/D1).
 */
export async function readSystemTotalsForUpdate(tx: Tx): Promise<{
  totalDrawCount: number;
  totalPayoutAmount: number;
  totalPointsBurned: number;
}> {
  const rows = await tx.$queryRawUnsafe<{ key: string; value: string }[]>(
    `SELECT key, value FROM "AppSetting"
     WHERE key IN ($1, $2, $3)
     ORDER BY key
     FOR UPDATE`,
    SETTINGS_KEYS.totalDrawCount,
    SETTINGS_KEYS.totalPayoutAmount,
    SETTINGS_KEYS.totalPointsBurned,
  );
  const map = new Map(rows.map((r) => [r.key, Number(r.value)]));
  return {
    totalDrawCount: map.get(SETTINGS_KEYS.totalDrawCount) ?? 0,
    totalPayoutAmount: map.get(SETTINGS_KEYS.totalPayoutAmount) ?? 0,
    totalPointsBurned: map.get(SETTINGS_KEYS.totalPointsBurned) ?? 0,
  };
}

/** Write deltas back to the locked system totals. Must run in the same tx as the lock. */
export async function incrementSystemTotals(
  tx: Tx,
  deltas: { drawCount?: number; payoutAmount?: number; pointsBurned?: number },
): Promise<void> {
  const updates: Array<{ key: string; delta: number }> = [];
  if (deltas.drawCount)    updates.push({ key: SETTINGS_KEYS.totalDrawCount,    delta: deltas.drawCount });
  if (deltas.payoutAmount) updates.push({ key: SETTINGS_KEYS.totalPayoutAmount, delta: deltas.payoutAmount });
  if (deltas.pointsBurned) updates.push({ key: SETTINGS_KEYS.totalPointsBurned, delta: deltas.pointsBurned });
  for (const u of updates) {
    await tx.$executeRawUnsafe(
      `UPDATE "AppSetting" SET value = (CAST(value AS INTEGER) + $1)::text WHERE key = $2`,
      u.delta, u.key,
    );
  }
}
