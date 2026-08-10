import { Hono } from 'hono';
import { requireUser } from '../auth/middleware.js';
import { prisma } from '../db.js';
import { z } from 'zod';

export const meRoutes = new Hono();

const RedemptionsQuery = z.object({
  take: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

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
  const query = RedemptionsQuery.parse(Object.fromEntries(new URL(c.req.url).searchParams));
  const redemptions = await prisma.redemption.findMany({
    where: { userId: u.id, totalWinAmount: { gt: 0 } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.take + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
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

  let nextCursor: string | null = null;
  if (redemptions.length > query.take) {
    redemptions.pop();
    nextCursor = redemptions[redemptions.length - 1]!.id;
  }

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
    nextCursor,
  });
});
