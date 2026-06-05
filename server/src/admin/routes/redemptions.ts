import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { requireAdmin } from '../auth/middleware.js';
import { audit } from '../audit/helper.js';

export const adminRedemptionsRoutes = new Hono();

const ListQuery = z.object({
  status: z.enum(['pending', 'delivered', 'cancelled', 'all']).default('all'),
  tier: z.enum(['single', 'multi', 'all']).default('all'),
  code: z.string().optional(),
  userId: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().optional(),
});

function normalizeCode(input: string): string {
  return input.startsWith('LW-') ? input.slice(3) : input;
}

adminRedemptionsRoutes.get('/api/admin/redemptions', requireAdmin, async (c) => {
  let q: z.infer<typeof ListQuery>;
  try { q = ListQuery.parse(Object.fromEntries(new URL(c.req.url).searchParams)); }
  catch { throw new AppError('LIST_QUERY_INVALID', 'invalid query', 400); }

  const where: Record<string, unknown> = {};
  if (q.status !== 'all') where.status = q.status;
  if (q.tier !== 'all') where.tier = q.tier;
  if (q.userId) where.userId = q.userId;
  if (q.code) where.code = normalizeCode(q.code);

  const items = await prisma.redemption.findMany({
    where,
    take: q.take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { id: true, nickname: true, displayName: true } } },
  });
  let nextCursor: string | null = null;
  if (items.length > q.take) nextCursor = items.pop()!.id;
  return c.json({
    items: items.map((r) => ({
      id: r.id, code: r.code, tier: r.tier, status: r.status,
      createdAt: r.createdAt, statusChangedAt: r.statusChangedAt,
      isTest: r.isTest, totalWinAmount: r.totalWinAmount,
      user: r.user,
    })),
    nextCursor,
  });
});

adminRedemptionsRoutes.get('/api/admin/redemptions/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const red = await prisma.redemption.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, nickname: true, displayName: true, lineUserId: true, entertainmentMemberCode: true } },
      drawLogs: { orderBy: { subIndex: 'asc' }, include: { prize: { select: { id: true, name: true } } } },
    },
  });
  if (!red) throw new AppError('REDEMPTION_NOT_FOUND', 'no such redemption', 404);

  let statusChangedByAdminUser: { id: string; email: string } | null = null;
  if (red.statusChangedByAdminUserId) {
    const a = await prisma.adminUser.findUnique({ where: { id: red.statusChangedByAdminUserId }, select: { id: true, email: true } });
    statusChangedByAdminUser = a;
  }

  return c.json({
    id: red.id, code: red.code, tier: red.tier, status: red.status,
    createdAt: red.createdAt,
    statusChangedAt: red.statusChangedAt,
    statusChangedByAdminUser,
    cancelReason: red.cancelReason,
    totalWinAmount: red.totalWinAmount,
    isTest: red.isTest,
    user: red.user,
    draws: red.drawLogs.map((d) => ({
      id: d.id,
      subIndex: d.subIndex,
      prize: d.prize,
      tierCost: d.tierCost,
      winningCashAmount: d.winningCashAmount,
      createdAt: d.createdAt,
      isTest: d.isTest,
      gatedBy: d.gatedBy,
    })),
  });
});

const StatusActionBody = z.object({
  action: z.enum(['claim', 'void', 'unclaim']),
  reason: z.string().min(1).max(500).optional(),
});

adminRedemptionsRoutes.patch('/api/admin/redemptions/:id/status', requireAdmin, async (c) => {
  const id = c.req.param('id');
  let body: z.infer<typeof StatusActionBody>;
  try { body = StatusActionBody.parse(await c.req.json()); }
  catch { throw new AppError('REDEMPTION_STATUS_BODY_INVALID', 'invalid body', 400); }

  if (body.action === 'void' && !body.reason) {
    throw new AppError('REDEMPTION_VOID_REASON_REQUIRED', 'reason required to void', 400);
  }

  const adminUser = c.get('admin');
  const adminId = adminUser.id;

  await prisma.$transaction(async (tx) => {
    const red = await tx.redemption.findUnique({ where: { id } });
    if (!red) throw new AppError('REDEMPTION_NOT_FOUND', 'no such redemption', 404);

    if (body.action === 'claim') {
      if (red.status !== 'pending') throw new AppError('REDEMPTION_TRANSITION_INVALID', `cannot claim from ${red.status}`, 422);
      await tx.redemption.update({
        where: { id },
        data: { status: 'delivered', statusChangedAt: new Date(), statusChangedByAdminUserId: adminId },
      });
      await audit(c, tx, {
        event: 'redemption.claim', targetType: 'redemption', targetId: id,
        payloadAfter: { code: red.code, tier: red.tier },
      });
    } else if (body.action === 'void') {
      if (red.status !== 'pending') {
        throw new AppError('REDEMPTION_TRANSITION_INVALID', `cannot void from ${red.status}`, 422);
      }
      await tx.redemption.update({
        where: { id },
        data: {
          status: 'cancelled',
          statusChangedAt: new Date(),
          statusChangedByAdminUserId: adminId,
          cancelReason: body.reason,
        },
      });
      await audit(c, tx, {
        event: 'redemption.void', targetType: 'redemption', targetId: id,
        payloadBefore: { status: red.status },
        payloadAfter: { status: 'cancelled', reason: body.reason },
      });
    } else if (body.action === 'unclaim') {
      if (red.status !== 'delivered') throw new AppError('REDEMPTION_TRANSITION_INVALID', `cannot unclaim from ${red.status}`, 422);
      await tx.redemption.update({
        where: { id },
        data: { status: 'pending', statusChangedAt: null, statusChangedByAdminUserId: null },
      });
      await audit(c, tx, {
        event: 'redemption.unclaim', targetType: 'redemption', targetId: id,
        payloadBefore: { status: red.status, statusChangedAt: red.statusChangedAt?.toISOString() ?? null, statusChangedByAdminUserId: red.statusChangedByAdminUserId },
        payloadAfter: { status: 'pending', reason: body.reason },
      });
    }
  });
  return c.json({ ok: true });
});
