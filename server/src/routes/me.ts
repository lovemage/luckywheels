import { Hono } from 'hono';
import { requireUser } from '../auth/middleware.js';

export const meRoutes = new Hono();

meRoutes.get('/api/me', requireUser, (c) => {
  const u = c.get('user');
  return c.json({
    id: u.id,
    lineUserId: u.lineUserId,
    displayName: u.displayName,
    pictureUrl: u.pictureUrl,
    vipLevel: u.vipLevel,
    points: u.points,
    accountType: u.accountType,
  });
});
