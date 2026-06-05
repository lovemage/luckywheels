import { Hono } from 'hono';
import { readDrawSettings } from '../draw/settings.js';
import { prisma } from '../db.js';
import { DEFAULT_SETTINGS, SETTINGS_KEYS } from '../../prisma/seed.js';

export const publicRoutes = new Hono();

publicRoutes.get('/api/settings/public', async (c) => {
  const s = await readDrawSettings();
  const rules = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEYS.rulesText } });
  return c.json({
    spinDurationMs: s.spinDurationMs,
    pointThresholds: s.pointThresholds,
    rulesText: rules?.value ?? DEFAULT_SETTINGS[SETTINGS_KEYS.rulesText],
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
