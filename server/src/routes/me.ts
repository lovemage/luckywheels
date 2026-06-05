import { Hono } from 'hono';
import { requireUser } from '../auth/middleware.js';
import { prisma } from '../db.js';

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
    nickname: u.nickname,
    entertainmentMemberCode: u.entertainmentMemberCode,
    lifetimeDrawCount: u.lifetimeDrawCount,
  });
});

meRoutes.get('/api/me/redemptions', requireUser, async (c) => {
  const u = c.get('user');
  const redemptions = await prisma.redemption.findMany({
    where: { userId: u.id, totalWinAmount: { gt: 0 } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      drawLogs: {
        where: { winningCashAmount: { gt: 0 } },
        orderBy: { subIndex: 'asc' },
        include: {
          prize: {
            select: {
              rankLabel: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return c.json({
    items: redemptions.map((r) => ({
      id: r.id,
      code: r.code,
      totalWinAmount: r.totalWinAmount,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      draws: r.drawLogs.map((d) => ({
        subIndex: d.subIndex,
        rankLabel: d.prize.rankLabel,
        prizeName: d.prize.name,
        winningCashAmount: d.winningCashAmount,
      })),
    })),
  });
});
