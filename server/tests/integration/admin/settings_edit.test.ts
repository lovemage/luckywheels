import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { prisma } from '../../../src/db.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { seedDefaultSettings } from '../../helpers/factories.js';
import { SETTINGS_KEYS, DEFAULT_SETTINGS, DEFAULT_THRESHOLDS } from '../../../prisma/seed.js';

describe('admin AppSetting edit', () => {
  beforeEach(async () => {
    await resetDb();
    await seedDefaultSettings();
  });

  it('GET returns defaults after seed', async () => {
    const admin = await createAdmin();
    const r = await app.request('/api/admin/settings', {
      headers: await adminHeaders(admin.id, admin.email),
    });
    expect(r.status).toBe(200);
    const json = await r.json() as {
      pointThresholds: { points: number; draws: number }[];
      spinDurationMs: number;
      minDrawsBeforeWin: number;
      cooldownDrawsAfterWin: number;
      payoutCapEnabled: boolean;
      payoutCapRatio: number;
      rulesText: string;
      totals: { drawCount: number; payoutAmount: number; pointsBurned: number };
      consolationPrizeId: string;
    };
    expect(json.pointThresholds).toEqual(DEFAULT_THRESHOLDS);
    expect(json.spinDurationMs).toBe(4300);
    expect(json.minDrawsBeforeWin).toBe(0);
    expect(json.cooldownDrawsAfterWin).toBe(0);
    expect(json.payoutCapEnabled).toBe(false);
    expect(json.payoutCapRatio).toBe(0.45);
    expect(json.rulesText).toBe(DEFAULT_SETTINGS[SETTINGS_KEYS.rulesText]);
    expect(json.totals).toEqual({ drawCount: 0, payoutAmount: 0, pointsBurned: 0 });
  });

  it('PATCH rulesText persists + /api/settings/public reflects it', async () => {
    const admin = await createAdmin();
    const rulesText = '第一條規則\n第二條規則';
    const r = await app.request('/api/admin/settings', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ rulesText }),
    });
    expect(r.status).toBe(200);
    const pub = await app.request('/api/settings/public');
    const pubJson = await pub.json() as { rulesText: string };
    expect(pubJson.rulesText).toBe(rulesText);
  });

  it('PATCH spinDurationMs persists + leaves pointThresholds unchanged; /api/settings/public reflects it', async () => {
    const admin = await createAdmin();
    const r = await app.request('/api/admin/settings', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ spinDurationMs: 5000 }),
    });
    expect(r.status).toBe(200);
    const pub = await app.request('/api/settings/public');
    const pubJson = await pub.json() as { spinDurationMs: number; pointThresholds: unknown[] };
    expect(pubJson.spinDurationMs).toBe(5000);
    expect(pubJson.pointThresholds).toEqual(DEFAULT_THRESHOLDS);
  });

  it('PATCH pointThresholds: persisted + readable via /api/settings/public', async () => {
    const admin = await createAdmin();
    const next = [
      { points: 10, draws: 1 },
      { points: 30, draws: 5 },
      { points: 50, draws: 10 },
    ];
    const r = await app.request('/api/admin/settings', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ pointThresholds: next }),
    });
    expect(r.status).toBe(200);
    const pub = await app.request('/api/settings/public');
    const pubJson = await pub.json() as { pointThresholds: { points: number; draws: number }[] };
    expect(pubJson.pointThresholds).toEqual(next);
  });

  it('PATCH pointThresholds non-ascending points → 400 POINT_THRESHOLDS_INVALID', async () => {
    const admin = await createAdmin();
    const r = await app.request('/api/admin/settings', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({
        pointThresholds: [
          { points: 10, draws: 1 },
          { points: 5, draws: 2 },
        ],
      }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('POINT_THRESHOLDS_INVALID');
  });

  it('PATCH payoutCapRatio = 1.5 → 400 SETTINGS_BODY_INVALID (zod range fails)', async () => {
    const admin = await createAdmin();
    const r = await app.request('/api/admin/settings', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ payoutCapRatio: 1.5 }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('SETTINGS_BODY_INVALID');
  });

  it('audit row written with right keys (payloadBefore + payloadAfter)', async () => {
    const admin = await createAdmin();
    const r = await app.request('/api/admin/settings', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ spinDurationMs: 6000, payoutCapEnabled: true }),
    });
    expect(r.status).toBe(200);
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'app_settings.update' } });
    const before = log.payloadBefore as Record<string, string | null>;
    const after = log.payloadAfter as Record<string, string>;
    expect(before).toHaveProperty(SETTINGS_KEYS.spinDurationMs);
    expect(before).toHaveProperty(SETTINGS_KEYS.payoutCapEnabled);
    expect(before[SETTINGS_KEYS.spinDurationMs]).toBe('4300');
    expect(before[SETTINGS_KEYS.payoutCapEnabled]).toBe('false');
    expect(after[SETTINGS_KEYS.spinDurationMs]).toBe('6000');
    expect(after[SETTINGS_KEYS.payoutCapEnabled]).toBe('true');
  });
});
