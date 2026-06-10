import type { Context } from 'hono';
import { Prisma, type PrismaClient } from '@prisma/client';
import { AppError } from '../../errors.js';
import { writeAdminActionLog } from '../../audit/log.js';

/**
 * Client-injectable member-management operations. These hold the transaction
 * bodies that used to live inline in admin/routes/users.ts; both the normal
 * admin routes (global `prisma`) and the superadmin routes (per-site
 * `clientFor(site)`) call them so the logic can't drift between the two.
 *
 * The HTTP layer (zod parsing, error codes, response shapes) stays in the
 * route files — these ops only do DB work + audit, and throw AppError for
 * domain errors exactly as the routes did before.
 */

export interface AuditActor {
  adminUserId: string | null;
  ip: string | null;
  userAgent: string | null;
  /** Optional free-text note stored on the audit row (e.g. cross-site superadmin action). */
  note?: string | null;
}

type TestPrizeSettingsUser = {
  testForcePrizeIds: string[];
  testForcePrizeMode: string;
};

/** Build the audit actor from a request context + the acting admin's id. */
export function actorFrom(c: Context, adminUserId: string | null): AuditActor {
  return {
    adminUserId,
    ip: c.req.header('x-forwarded-for') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
  };
}

export interface ListUsersQuery {
  tab: 'verified' | 'test' | 'pending';
  q?: string;
  take: number;
  cursor?: string;
}

const USER_LIST_SELECT = {
  id: true, nickname: true, displayName: true, pictureUrl: true,
  lineUserId: true, entertainmentMemberCode: true, accountType: true,
  points: true, lifetimeDrawCount: true, blacklistedAt: true, createdAt: true,
} satisfies Prisma.UserSelect;

export type UserListRow = Prisma.UserGetPayload<{ select: typeof USER_LIST_SELECT }>;

export async function listUsersOp(
  client: PrismaClient,
  query: ListUsersQuery,
): Promise<{ items: UserListRow[]; nextCursor: string | null }> {
  const tabFilter =
    query.tab === 'test'
      ? { accountType: 'test' as const }
      : query.tab === 'pending'
        ? { accountType: 'pending' as const }
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

  const items = await client.user.findMany({
    where,
    take: query.take + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    select: USER_LIST_SELECT,
  });

  let nextCursor: string | null = null;
  if (items.length > query.take) {
    items.pop();                              // drop the lookahead row...
    nextCursor = items[items.length - 1]!.id; // ...cursor is the last RETURNED row (skip:1 then resumes after it)
  }
  return { items, nextCursor };
}

export async function getUserOp(client: PrismaClient, id: string) {
  const user = await client.user.findUnique({ where: { id } });
  if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);
  return user;
}

export async function deleteUserOp(client: PrismaClient, userId: string, actor: AuditActor): Promise<void> {
  await client.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);

    const snapshot = {
      id: user.id,
      lineUserId: user.lineUserId,
      displayName: user.displayName,
      nickname: user.nickname,
      entertainmentMemberCode: user.entertainmentMemberCode,
      accountType: user.accountType,
      points: user.points,
    };

    await tx.drawLog.deleteMany({ where: { userId } });
    await tx.redemption.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
    await writeAdminActionLog(tx, {
      ...actor,
      event: 'user.deleted',
      targetType: 'user',
      targetId: userId,
      payloadBefore: snapshot,
    });
  });
}

export async function adjustPointsOp(
  client: PrismaClient,
  userId: string,
  body: { delta: number; reason?: string },
  actor: AuditActor,
): Promise<number> {
  if (body.delta === 0) throw new AppError('POINTS_DELTA_ZERO', 'delta must be non-zero', 400);
  const updated = await client.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);
    const before = user.points;
    const after = before + body.delta;
    if (after < 0) throw new AppError('POINTS_WOULD_GO_NEGATIVE', 'resulting balance would be negative', 422);
    const u = await tx.user.update({ where: { id: userId }, data: { points: after } });
    await writeAdminActionLog(tx, {
      ...actor,
      event: 'user.points_adjust',
      targetType: 'user',
      targetId: userId,
      payloadAfter: { delta: body.delta, before, after, reason: body.reason ?? null },
    });
    return u;
  });
  return updated.points;
}

export async function pointsHistoryOp(client: PrismaClient, userId: string) {
  const rows = await client.adminActionLog.findMany({
    where: { event: 'user.points_adjust', targetType: 'user', targetId: userId },
    take: 20,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const adminIds = Array.from(new Set(rows.map((r) => r.adminUserId).filter((id): id is string => Boolean(id))));
  const admins = adminIds.length
    ? await client.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, email: true } })
    : [];
  const adminById = new Map(admins.map((a) => [a.id, a]));

  return rows.map((row) => {
    const after = row.payloadAfter && typeof row.payloadAfter === 'object' && !Array.isArray(row.payloadAfter)
      ? row.payloadAfter as Record<string, unknown>
      : {};
    return {
      id: row.id,
      delta: typeof after.delta === 'number' ? after.delta : 0,
      before: typeof after.before === 'number' ? after.before : null,
      after: typeof after.after === 'number' ? after.after : null,
      reason: typeof after.reason === 'string' ? after.reason : null,
      adminUser: row.adminUserId ? adminById.get(row.adminUserId) ?? null : null,
      createdAt: row.createdAt,
    };
  });
}

export async function setAccountTypeOp(
  client: PrismaClient,
  userId: string,
  accountType: 'verified' | 'test',
  actor: AuditActor,
): Promise<void> {
  await client.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);
    if (user.accountType === 'blacklisted') {
      throw new AppError('ACCOUNT_TYPE_BLACKLIST_DISALLOWED', 'unblacklist via the blacklist endpoint', 400);
    }
    if (user.accountType === accountType) return;             // no-op
    await tx.user.update({
      where: { id: userId },
      data: {
        accountType,
        // demoting to a non-test type clears test settings
        ...(accountType !== 'test' ? {
          testSkipCost: false,
          testForcePrizeId: null,
          testForcePrizeIds: [],
          testForcePrizeMode: 'random',
        } : {}),
      },
    });
    await writeAdminActionLog(tx, {
      ...actor,
      event: 'user.account_type_change',
      targetType: 'user',
      targetId: userId,
      payloadBefore: { accountType: user.accountType },
      payloadAfter: { accountType },
    });
  });
}

export async function approveUserOp(client: PrismaClient, userId: string, actor: AuditActor): Promise<void> {
  await client.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);
    if (user.accountType !== 'pending') return;
    await tx.user.update({
      where: { id: userId },
      data: { accountType: 'verified', verifiedAt: new Date() },
    });
    await writeAdminActionLog(tx, {
      ...actor,
      event: 'user.approved',
      targetType: 'user',
      targetId: userId,
      payloadBefore: { accountType: user.accountType },
      payloadAfter: { accountType: 'verified' },
    });
  });
}

export async function setTestSettingsOp(
  client: PrismaClient,
  userId: string,
  body: {
    testSkipCost?: boolean;
    testForcePrizeId?: string | null;
    testForcePrizeIds?: string[];
    testForcePrizeMode?: 'random' | 'cycle';
  },
  actor: AuditActor,
): Promise<void> {
  await client.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);
    if (user.accountType !== 'test') {
      throw new AppError('TEST_SETTINGS_REQUIRES_TEST_ACCOUNT', 'user is not a test account', 422);
    }
    const testUser = user as typeof user & TestPrizeSettingsUser;
    const idsToValidate = [
      ...(body.testForcePrizeId ? [body.testForcePrizeId] : []),
      ...(body.testForcePrizeIds ?? []),
    ];
    if (idsToValidate.length > 0) {
      const uniqueIds = Array.from(new Set(idsToValidate));
      const prizes = await tx.prize.findMany({
        where: { id: { in: uniqueIds }, enabled: true },
        select: { id: true },
      });
      if (prizes.length !== uniqueIds.length) {
        throw new AppError('TEST_FORCE_PRIZE_NOT_FOUND', 'prize not found or disabled', 404);
      }
    }
    const before = {
      testSkipCost: user.testSkipCost,
      testForcePrizeId: user.testForcePrizeId,
      testForcePrizeIds: testUser.testForcePrizeIds ?? [],
      testForcePrizeMode: testUser.testForcePrizeMode ?? 'random',
    };
    const nextForcePrizeIds = body.testForcePrizeIds === undefined
      ? body.testForcePrizeId === undefined
        ? testUser.testForcePrizeIds ?? []
        : body.testForcePrizeId
          ? [body.testForcePrizeId]
          : []
      : Array.from(new Set(body.testForcePrizeIds));
    const after = {
      testSkipCost: body.testSkipCost ?? user.testSkipCost,
      testForcePrizeId:
        body.testForcePrizeId !== undefined
          ? body.testForcePrizeId
          : body.testForcePrizeIds !== undefined
            ? null
            : user.testForcePrizeId,
      testForcePrizeIds: nextForcePrizeIds,
      testForcePrizeMode: body.testForcePrizeMode ?? testUser.testForcePrizeMode ?? 'random',
    };
    await tx.user.update({ where: { id: userId }, data: after });
    await writeAdminActionLog(tx, {
      ...actor,
      event: 'user.test_settings_change',
      targetType: 'user',
      targetId: userId,
      payloadBefore: before,
      payloadAfter: after,
    });
  });
}

export async function blacklistOp(
  client: PrismaClient,
  userId: string,
  body: { blacklist: boolean; reason?: string; restoreTo?: 'verified' | 'test' },
  actor: AuditActor,
): Promise<void> {
  await client.$transaction(async (tx) => {
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
          blacklistedByAdminUserId: actor.adminUserId,
          blacklistReason: body.reason,
        },
      });
      await writeAdminActionLog(tx, {
        ...actor,
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
      await writeAdminActionLog(tx, {
        ...actor,
        event: 'user.blacklist_clear',
        targetType: 'user',
        targetId: userId,
        payloadAfter: { restoreTo },
      });
    }
  });
}

export async function setEntertainmentCodeOp(
  client: PrismaClient,
  userId: string,
  body: { code: string | null; reason: string },
  actor: AuditActor,
): Promise<void> {
  try {
    await client.$transaction(async (tx) => {
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
      await writeAdminActionLog(tx, {
        ...actor,
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
}

export async function drawHistoryOp(
  client: PrismaClient,
  userId: string,
  opts: { take: number; cursor?: string | null },
) {
  const user = await client.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);

  const redemptions = await client.redemption.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: opts.take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: {
      drawLogs: {
        orderBy: { subIndex: 'asc' },
        include: { prize: { select: { id: true, name: true } } },
      },
    },
  });
  let nextCursor: string | null = null;
  if (redemptions.length > opts.take) {
    redemptions.pop();                                    // drop the lookahead row...
    nextCursor = redemptions[redemptions.length - 1]!.id; // ...cursor is the last RETURNED row
  }
  return {
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
  };
}
