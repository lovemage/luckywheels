import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { requireAdminNav } from '../auth/middleware.js';

export const adminActionLogsRoutes = new Hono();
const requireSystemNav = requireAdminNav('system');

const Query = z.object({
  adminUserId: z.string().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

adminActionLogsRoutes.get('/api/admin/action-logs', ...requireSystemNav, async (c) => {
  let q: z.infer<typeof Query>;
  try { q = Query.parse(Object.fromEntries(new URL(c.req.url).searchParams)); }
  catch { throw new AppError('LIST_QUERY_INVALID', 'invalid query', 400); }

  const where: Record<string, unknown> = {};
  if (q.adminUserId) where.adminUserId = q.adminUserId;
  if (q.action) where.event = q.action;            // API exposes 'action' but schema column is 'event'
  if (q.targetType) where.targetType = q.targetType;
  if (q.targetId) where.targetId = q.targetId;
  if (q.from || q.to) {
    const range: { gte?: Date; lte?: Date } = {};
    if (q.from) {
      const d = new Date(q.from);
      if (Number.isNaN(d.getTime())) throw new AppError('LIST_QUERY_INVALID', 'invalid from', 400);
      range.gte = d;
    }
    if (q.to) {
      const d = new Date(q.to);
      if (Number.isNaN(d.getTime())) throw new AppError('LIST_QUERY_INVALID', 'invalid to', 400);
      range.lte = d;
    }
    where.createdAt = range;
  }

  const rows = await prisma.adminActionLog.findMany({
    where,
    take: q.take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  let nextCursor: string | null = null;
  if (rows.length > q.take) nextCursor = rows.pop()!.id;

  // AdminActionLog has no Prisma relation to AdminUser; batch-load admin emails for the page
  const adminIds = Array.from(new Set(rows.map((r) => r.adminUserId).filter((id): id is string => !!id)));
  const admins = adminIds.length
    ? await prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, email: true } })
    : [];
  const adminById = new Map(admins.map((a) => [a.id, a]));

  // Map schema 'event' -> API 'action', combine before/after -> 'payload' for UI simplicity
  const items = rows.map((r) => ({
    id: r.id,
    adminUserId: r.adminUserId,
    adminUser: r.adminUserId ? adminById.get(r.adminUserId) ?? null : null,
    action: r.event,
    targetType: r.targetType,
    targetId: r.targetId,
    payload: { before: r.payloadBefore, after: r.payloadAfter },
    ip: r.ip,
    userAgent: r.userAgent,
    createdAt: r.createdAt,
  }));
  return c.json({ items, nextCursor });
});
