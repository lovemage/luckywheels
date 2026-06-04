import { Hono } from 'hono';
import { readDrawSettings } from '../draw/settings.js';

export const publicRoutes = new Hono();

publicRoutes.get('/api/settings/public', async (c) => {
  const s = await readDrawSettings();
  return c.json({
    spinDurationMs: s.spinDurationMs,
    pointThresholds: s.pointThresholds,
  });
});
