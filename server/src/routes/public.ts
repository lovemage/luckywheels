import { Hono } from 'hono';
import { readDrawSettings } from '../draw/settings.js';
import { prisma } from '../db.js';
import { DEFAULT_SETTINGS, SETTINGS_KEYS } from '../../prisma/seed.js';

export const publicRoutes = new Hono();

publicRoutes.get('/api/settings/public', async (c) => {
  const s = await readDrawSettings();
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [SETTINGS_KEYS.rulesText, SETTINGS_KEYS.homeLogoUrl, SETTINGS_KEYS.homeBackgroundUrl] } },
  });
  const m = new Map(rows.map((r) => [r.key, r.value]));
  return c.json({
    spinDurationMs: s.spinDurationMs,
    pointThresholds: s.pointThresholds,
    rulesText: m.get(SETTINGS_KEYS.rulesText) ?? DEFAULT_SETTINGS[SETTINGS_KEYS.rulesText],
    homeLogoUrl: m.get(SETTINGS_KEYS.homeLogoUrl) ?? '',
    homeBackgroundUrl: m.get(SETTINGS_KEYS.homeBackgroundUrl) ?? '',
  });
});

publicRoutes.get('/api/prizes/public', async (c) => {
  const prizes = await prisma.prize.findMany({
    where: { enabled: true },
    orderBy: { wheelPosition: 'asc' },
    select: {
      id: true,
      rankLabel: true,
      name: true,
      description: true,
      imageUrl: true,
      wheelPosition: true,
      segmentColor: true,
      textColor: true,
      cashAmount: true,
      isConsolation: true,
    },
  });
  return c.json({ items: prizes });
});
