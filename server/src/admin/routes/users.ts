import { Hono } from 'hono';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { requireAdmin } from '../auth/middleware.js';
import { audit } from '../audit/helper.js';

export const adminUsersRoutes = new Hono();

const ListQuery = z.object({
  tab: z.enum(['verified', 'test']).default('verified'),
  q: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().optional(),
});

adminUsersRoutes.get('/api/admin/users', requireAdmin, async (c) => {
  let query: z.infer<typeof ListQuery>;
  try { query = ListQuery.parse(Object.fromEntries(new URL(c.req.url).searchParams)); }
  catch { throw new AppError('LIST_QUERY_INVALID', 'invalid query parameters', 400); }

  const tabFilter = query.tab === 'test'
    ? { accountType: 'test' as const }
    : { accountType: { in: ['verified' as const, 'blacklisted' as const] } };

  const where = {
    ...tabFilter,
    ...(query.q ? {
      OR: [
        { nickname: { contains: query.q, mode: 'insensitive' as const } },
        { displayName: { contains: query.q, mode: 'insensitive' as const } },
        { lineUserId: { contains: query.q, mode: 'insensitive' as const } },
        { entertainmentMemberCode: { startsWith: query.q, mode: 'insensitive' as const } },
      ],
    } : {}),
  };

  const items = await prisma.user.findMany({
    where,
    take: query.take + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, nickname: true, displayName: true, pictureUrl: true,
      lineUserId: true, entertainmentMemberCode: true, accountType: true,
      points: true, lifetimeDrawCount: true, blacklistedAt: true, createdAt: true,
    },
  });

  let nextCursor: string | null = null;
  if (items.length > query.take) {
    const next = items.pop()!;
    nextCursor = next.id;
  }
  return c.json({ items, nextCursor });
});

adminUsersRoutes.get('/api/admin/users/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);
  return c.json(user);
});

const PointsAdjustBody = z.object({
  delta: z.number().int(),
  reason: z.string().min(1).max(500),
});

adminUsersRoutes.post('/api/admin/users/:id/points', requireAdmin, async (c) => {
  const userId = c.req.param('id');
  let body: z.infer<typeof PointsAdjustBody>;
  try {
    const raw = await c.req.json();
    if (raw.reason === undefined || raw.reason === null || raw.reason === '') {
      throw new AppError('POINTS_REASON_REQUIRED', 'reason is required', 400);
    }
    body = PointsAdjustBody.parse(raw);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('POINTS_BODY_INVALID', 'invalid body', 400);
  }
  if (body.delta === 0) throw new AppError('POINTS_DELTA_ZERO', 'delta must be non-zero', 400);

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);
    const before = user.points;
    const after = before + body.delta;
    if (after < 0) throw new AppError('POINTS_WOULD_GO_NEGATIVE', 'resulting balance would be negative', 422);
    const u = await tx.user.update({ where: { id: userId }, data: { points: after } });
    await audit(c, tx, {
      event: 'user.points_adjust',
      targetType: 'user',
      targetId: userId,
      payloadAfter: { delta: body.delta, before, after, reason: body.reason },
    });
    return u;
  });
  return c.json({ points: updated.points });
});

const AccountTypeBody = z.object({
  accountType: z.enum(['verified', 'test']),  // 'blacklisted' deliberately excluded
});

adminUsersRoutes.patch('/api/admin/users/:id/account-type', requireAdmin, async (c) => {
  const userId = c.req.param('id');
  let body: z.infer<typeof AccountTypeBody>;
  try {
    const raw = await c.req.json();
    if (raw.accountType === 'blacklisted') {
      throw new AppError('ACCOUNT_TYPE_BLACKLIST_DISALLOWED', 'use the blacklist endpoint', 400);
    }
    body = AccountTypeBody.parse(raw);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('ACCOUNT_TYPE_BODY_INVALID', 'invalid body', 400);
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);
    if (user.accountType === 'blacklisted') {
      throw new AppError('ACCOUNT_TYPE_BLACKLIST_DISALLOWED', 'unblacklist via the blacklist endpoint', 400);
    }
    if (user.accountType === body.accountType) return;             // no-op
    await tx.user.update({
      where: { id: userId },
      data: {
        accountType: body.accountType,
        // demoting to a non-test type clears test settings
        ...(body.accountType !== 'test' ? { testSkipCost: false, testForcePrizeId: null } : {}),
      },
    });
    await audit(c, tx, {
      event: 'user.account_type_change',
      targetType: 'user',
      targetId: userId,
      payloadBefore: { accountType: user.accountType },
      payloadAfter: { accountType: body.accountType },
    });
  });
  return c.json({ ok: true });
});

const TestSettingsBody = z.object({
  testSkipCost: z.boolean().optional(),
  testForcePrizeId: z.string().nullable().optional(),
});

adminUsersRoutes.patch('/api/admin/users/:id/test-settings', requireAdmin, async (c) => {
  const userId = c.req.param('id');
  let body: z.infer<typeof TestSettingsBody>;
  try { body = TestSettingsBody.parse(await c.req.json()); }
  catch { throw new AppError('TEST_SETTINGS_BODY_INVALID', 'invalid body', 400); }

  if (body.testSkipCost === undefined && body.testForcePrizeId === undefined) {
    throw new AppError('TEST_SETTINGS_NO_OP', 'no fields to update', 400);
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);
    if (user.accountType !== 'test') {
      throw new AppError('TEST_SETTINGS_REQUIRES_TEST_ACCOUNT', 'user is not a test account', 422);
    }
    if (body.testForcePrizeId) {
      const prize = await tx.prize.findUnique({ where: { id: body.testForcePrizeId } });
      if (!prize) throw new AppError('TEST_FORCE_PRIZE_NOT_FOUND', 'prize not found', 404);
    }
    const before = { testSkipCost: user.testSkipCost, testForcePrizeId: user.testForcePrizeId };
    const after = {
      testSkipCost: body.testSkipCost ?? user.testSkipCost,
      testForcePrizeId: body.testForcePrizeId === undefined ? user.testForcePrizeId : body.testForcePrizeId,
    };
    await tx.user.update({ where: { id: userId }, data: after });
    await audit(c, tx, {
      event: 'user.test_settings_change',
      targetType: 'user',
      targetId: userId,
      payloadBefore: before,
      payloadAfter: after,
    });
  });
  return c.json({ ok: true });
});

const BlacklistBody = z.object({
  blacklist: z.boolean(),
  reason: z.string().min(1).max(500).optional(),
  restoreTo: z.enum(['verified', 'test']).optional(),
});

adminUsersRoutes.patch('/api/admin/users/:id/blacklist', requireAdmin, async (c) => {
  const userId = c.req.param('id');
  let body: z.infer<typeof BlacklistBody>;
  try { body = BlacklistBody.parse(await c.req.json()); }
  catch { throw new AppError('BLACKLIST_BODY_INVALID', 'invalid body', 400); }
  if (body.blacklist && (!body.reason || body.reason.trim() === '')) {
    throw new AppError('BLACKLIST_REASON_REQUIRED', 'reason required when blacklisting', 400);
  }

  const adminCtx = c.get('admin') as { id: string };
  const adminId = adminCtx.id;

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);
    const alreadyBlocked = user.accountType === 'blacklisted';
    if (body.blacklist && alreadyBlocked) return;
    if (!body.blacklist && !alreadyBlocked) return;

    if (body.blacklist) {
      await tx.user.update({
        where: { id: userId },
        data: {
          accountType: 'blacklisted',
          blacklistedAt: new Date(),
          blacklistedByAdminUserId: adminId,
          blacklistReason: body.reason,
        },
      });
      await audit(c, tx, {
        event: 'user.blacklist_set',
        targetType: 'user',
        targetId: userId,
        payloadBefore: { accountType: user.accountType },
        payloadAfter: { accountType: 'blacklisted', reason: body.reason },
      });
    } else {
      const restoreTo = body.restoreTo ?? 'verified';
      await tx.user.update({
        where: { id: userId },
        data: {
          accountType: restoreTo,
          blacklistedAt: null,
          blacklistedByAdminUserId: null,
          blacklistReason: null,
        },
      });
      await audit(c, tx, {
        event: 'user.blacklist_clear',
        targetType: 'user',
        targetId: userId,
        payloadAfter: { restoreTo },
      });
    }
  });
  return c.json({ ok: true });
});

const EntertainmentCodeBody = z.object({
  code: z.string().min(1).max(64).nullable(),
  reason: z.string().min(1).max(500),
});

adminUsersRoutes.patch('/api/admin/users/:id/entertainment-code', requireAdmin, async (c) => {
  const userId = c.req.param('id');
  let body: z.infer<typeof EntertainmentCodeBody>;
  try {
    const raw = await c.req.json();
    if (!raw.reason) throw new AppError('ENTERTAINMENT_CODE_REASON_REQUIRED', 'reason is required', 400);
    body = EntertainmentCodeBody.parse(raw);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('ENTERTAINMENT_CODE_BODY_INVALID', 'invalid body', 400);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);
      const before = user.entertainmentMemberCode;
      const after = body.code;
      if (before === after) return;
      await tx.user.update({
        where: { id: userId },
        data: {
          entertainmentMemberCode: after,
          entertainmentCodeBoundAt: after === null ? null : new Date(),
        },
      });
      await audit(c, tx, {
        event: 'user.entertainment_code_change',
        targetType: 'user',
        targetId: userId,
        payloadBefore: { code: before },
        payloadAfter: { code: after, reason: body.reason },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError('ENTERTAINMENT_CODE_TAKEN', 'code already bound to another user', 409);
    }
    throw e;
  }
  return c.json({ ok: true });
});

adminUsersRoutes.get('/api/admin/users/:id/draw-history', requireAdmin, async (c) => {
  const userId = c.req.param('id');
  const url = new URL(c.req.url);
  const take = Math.min(Number(url.searchParams.get('take') ?? 25), 50);
  const cursor = url.searchParams.get('cursor');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);

  const redemptions = await prisma.redemption.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      drawLogs: {
        orderBy: { subIndex: 'asc' },
        include: { prize: { select: { id: true, name: true } } },
      },
    },
  });
  let nextCursor: string | null = null;
  if (redemptions.length > take) {
    nextCursor = redemptions.pop()!.id;
  }
  return c.json({
    items: redemptions.map((r) => ({
      redemption: {
        id: r.id,
        code: r.code,
        tier: r.tier,
        status: r.status,
        createdAt: r.createdAt,
        statusChangedAt: r.statusChangedAt,
      },
      draws: r.drawLogs.map((d) => ({
        id: d.id,
        subIndex: d.subIndex,
        prize: d.prize,
        pointsBefore: d.pointsBefore,
        pointsAfter: d.pointsAfter,
        winningCashAmount: d.winningCashAmount,
        createdAt: d.createdAt,
        isTest: d.isTest,
        gatedBy: d.gatedBy,
      })),
    })),
    nextCursor,
  });
});
