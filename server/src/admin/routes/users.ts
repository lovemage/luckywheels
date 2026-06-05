import { Hono } from 'hono';
import { z } from 'zod';
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
