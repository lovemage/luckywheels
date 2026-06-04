import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { seedDefaultSettings, SETTINGS_KEYS } from '../helpers/factories.js';
import { prisma } from '../../src/db.js';

describe('public endpoints', () => {
  beforeEach(async () => { await resetDb(); await seedDefaultSettings(); });

  it('GET /api/health → ok', async () => {
    const r = await app.request('/api/health');
    expect(await r.json()).toEqual({ ok: true });
  });

  it('GET /api/jackpot/public is gone (404)', async () => {
    const r = await app.request('/api/jackpot/public');
    expect(r.status).toBe(404);
  });

  it('GET /api/settings/public returns spin params + thresholds; does not leak sensitive settings', async () => {
    await prisma.appSetting.update({
      where: { key: SETTINGS_KEYS.spinDurationMs }, data: { value: '5500' },
    });
    const r = await app.request('/api/settings/public');
    const body = await r.json();
    expect(body.spinDurationMs).toBe(5500);     // dynamic, not hardcoded
    expect(body.pointThresholds[0]).toEqual({ points: 6, draws: 1 });
    expect(body).not.toHaveProperty('payoutCapRatio');
    expect(body).not.toHaveProperty('minDrawsBeforeWin');
    expect(body).not.toHaveProperty('cooldownDrawsAfterWin');
    expect(body).not.toHaveProperty('jackpotCurrentAmount');
  });
});
