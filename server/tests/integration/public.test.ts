import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { seedDefaultSettings, SETTINGS_KEYS } from '../helpers/factories.js';
import { prisma } from '../../src/db.js';

async function seedPrizes() {
  const data = [
    { rankLabel: '頭獎', name: '最高彩金', cashAmount: 10000, weight: 2, segmentColor: '#d92b3a', wheelPosition: 0 },
    { rankLabel: '二獎', name: '彩金',     cashAmount: 5000,  weight: 6, segmentColor: '#ec8a26', wheelPosition: 1 },
    { rankLabel: '三獎', name: '彩金',     cashAmount: 1000,  weight: 14, segmentColor: '#c98612', wheelPosition: 2 },
    { rankLabel: '四獎', name: '彩金',     cashAmount: 500,   weight: 22, segmentColor: '#38a86e', wheelPosition: 3 },
    { rankLabel: '五獎', name: '彩金',     cashAmount: 100,   weight: 26, segmentColor: '#2e7cd9', wheelPosition: 4 },
    { rankLabel: '六獎', name: '謝謝參加', cashAmount: 0,     weight: 30, isConsolation: true, segmentColor: '#9b3eb8', wheelPosition: 5 },
  ];
  for (const p of data) await prisma.prize.create({ data: { ...p, stock: 9999 } });
}

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

  it('GET /api/prizes/public returns enabled prizes ordered by wheelPosition with only visual fields', async () => {
    await seedPrizes();
    const r = await app.request('/api/prizes/public');
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.items).toHaveLength(6);
    expect(body.items[0].wheelPosition).toBe(0);
    expect(body.items[5].wheelPosition).toBe(5);
    expect(body.items[0]).toMatchObject({ rankLabel: '頭獎', name: '最高彩金', cashAmount: 10000, isConsolation: false });
    expect(body.items[5]).toMatchObject({ rankLabel: '六獎', name: '謝謝參加', cashAmount: 0, isConsolation: true });
    expect(body.items[0]).not.toHaveProperty('weight');
    expect(body.items[0]).not.toHaveProperty('stock');
    expect(body.items[0]).not.toHaveProperty('enabled');
  });

  it('GET /api/prizes/public excludes disabled prizes', async () => {
    await seedPrizes();
    const all = await prisma.prize.findMany();
    await prisma.prize.update({ where: { id: all[0]!.id }, data: { enabled: false } });
    const r = await app.request('/api/prizes/public');
    const body = await r.json();
    expect(body.items).toHaveLength(5);
  });
});
