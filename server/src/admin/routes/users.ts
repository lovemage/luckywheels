import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { requireAdmin } from '../auth/middleware.js';

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
