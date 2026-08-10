import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { requireAdminNav } from '../auth/middleware.js';
import { audit } from '../audit/helper.js';
import { SETTINGS_KEYS } from '../../../prisma/seed.js';

export const adminRedemptionsRoutes = new Hono();
const requireRedemptionsNav = requireAdminNav('redemptions');

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

function inferTierDraws(redemption: { tier: string; drawLogs: Array<{ tierDraws: number }> }): number {
  return redemption.drawLogs[0]?.tierDraws ?? (redemption.tier === 'single' ? 1 : redemption.drawLogs.length);
}

adminRedemptionsRoutes.get('/api/admin/redemptions', ...requireRedemptionsNav, async (c) => {
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
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      user: { select: { id: true, nickname: true, displayName: true, entertainmentMemberCode: true } },
      drawLogs: { orderBy: { subIndex: 'asc' }, take: 1, select: { tierDraws: true } },
    },
  });
  let nextCursor: string | null = null;
  if (items.length > q.take) {
    items.pop();
    nextCursor = items[items.length - 1]!.id;
  }
  return c.json({
    items: items.map((r) => ({
      id: r.id, code: r.code, tier: r.tier, tierDraws: inferTierDraws(r), status: r.status,
      createdAt: r.createdAt, statusChangedAt: r.statusChangedAt,
      isTest: r.isTest, totalWinAmount: r.totalWinAmount,
      user: r.user,
    })),
    nextCursor,
  });
});

// 危險操作：清空所有兌換紀錄與抽獎明細，並把所有會員積分/累計與全站累計歸零。
// 不可復原 — 必須帶 { confirm: "RESET" }（前台 DoubleConfirmModal 要求輸入 RESET）。
const ResetBody = z.object({ confirm: z.literal('RESET') });

adminRedemptionsRoutes.post('/api/admin/redemptions/reset', ...requireRedemptionsNav, async (c) => {
  try {
    ResetBody.parse(await c.req.json());
  } catch {
    throw new AppError('REDEMPTION_RESET_CONFIRM_REQUIRED', 'must POST { confirm: "RESET" }', 400);
  }

  const result = await prisma.$transaction(async (tx) => {
    const deletedDrawLogs = await tx.drawLog.deleteMany({});
    const deletedRedemptions = await tx.redemption.deleteMany({});
    const usersReset = await tx.user.updateMany({
      data: {
        points: 0,
        lifetimeDrawCount: 0,
        lifetimePayoutAmount: 0,
        totalBurnAmount: 0,
        totalLuckAmount: 0,
        lastWinDrawIndex: null,
      },
    });
    // Global totals double as the cost-control counters → zero them too.
    for (const key of [
      SETTINGS_KEYS.totalDrawCount,
      SETTINGS_KEYS.totalPayoutAmount,
      SETTINGS_KEYS.totalPointsBurned,
    ]) {
      await tx.appSetting.upsert({ where: { key }, create: { key, value: '0' }, update: { value: '0' } });
    }
    await audit(c, tx, {
      event: 'redemption.reset_all',
      targetType: 'redemption',
      payloadAfter: {
        deletedRedemptions: deletedRedemptions.count,
        deletedDrawLogs: deletedDrawLogs.count,
        usersReset: usersReset.count,
        clearedPoints: true,
      },
    });
    return {
      deletedRedemptions: deletedRedemptions.count,
      deletedDrawLogs: deletedDrawLogs.count,
      usersReset: usersReset.count,
    };
  });

  return c.json({ ok: true, ...result });
});

adminRedemptionsRoutes.get('/api/admin/redemptions/:id', ...requireRedemptionsNav, async (c) => {
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
    id: red.id, code: red.code, tier: red.tier, tierDraws: inferTierDraws(red), status: red.status,
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
      tierDraws: d.tierDraws,
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

adminRedemptionsRoutes.patch('/api/admin/redemptions/:id/status', ...requireRedemptionsNav, async (c) => {
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
