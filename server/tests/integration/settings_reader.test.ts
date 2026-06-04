import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from '../helpers/db.js';
import { seedDefaultSettings, SETTINGS_KEYS } from '../helpers/factories.js';
import {
  readDrawSettings,
  readSystemTotalsForUpdate,
  incrementSystemTotals,
} from '../../src/draw/settings.js';
import { prisma } from '../../src/db.js';

describe('settings reader', () => {
  beforeEach(async () => { await resetDb(); await seedDefaultSettings(); });

  it('parses defaults', async () => {
    const s = await readDrawSettings();
    expect(s.pointThresholds[0]).toEqual({ points: 6, draws: 1 });
    expect(s.pointThresholds.at(-1)).toEqual({ points: 48, draws: 10 });
    expect(s.spinDurationMs).toBe(4300);
    expect(s.payoutCapEnabled).toBe(false);
  });

  it('readSystemTotalsForUpdate + incrementSystemTotals round-trip atomically', async () => {
    await prisma.$transaction(async (tx) => {
      const t0 = await readSystemTotalsForUpdate(tx);
      expect(t0).toEqual({ totalDrawCount: 0, totalPayoutAmount: 0, totalPointsBurned: 0 });
      await incrementSystemTotals(tx, { drawCount: 1, payoutAmount: 500, pointsBurned: 6 });
    });
    const t1 = await prisma.$transaction(async (tx) => readSystemTotalsForUpdate(tx));
    expect(t1).toEqual({ totalDrawCount: 1, totalPayoutAmount: 500, totalPointsBurned: 6 });
  });
});
