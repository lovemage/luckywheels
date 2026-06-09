import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { requireAdmin } from '../auth/middleware.js';
import {
  actorFrom,
  listUsersOp,
  getUserOp,
  deleteUserOp,
  adjustPointsOp,
  pointsHistoryOp,
  setAccountTypeOp,
  approveUserOp,
  setTestSettingsOp,
  blacklistOp,
  setEntertainmentCodeOp,
  drawHistoryOp,
} from '../users/ops.js';

export const adminUsersRoutes = new Hono();

// All member-management logic lives in admin/users/ops.ts so the normal admin
// console and the cross-site superadmin console share one implementation. These
// routes own only the HTTP surface: parsing, error codes, response shapes.

const ListQuery = z.object({
  tab: z.enum(['verified', 'test', 'pending']).default('verified'),
  q: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().optional(),
});

adminUsersRoutes.get('/api/admin/users', requireAdmin, async (c) => {
  let query: z.infer<typeof ListQuery>;
  try { query = ListQuery.parse(Object.fromEntries(new URL(c.req.url).searchParams)); }
  catch { throw new AppError('LIST_QUERY_INVALID', 'invalid query parameters', 400); }
  return c.json(await listUsersOp(prisma, query));
});

adminUsersRoutes.get('/api/admin/users/:id', requireAdmin, async (c) => {
  return c.json(await getUserOp(prisma, c.req.param('id')));
});

adminUsersRoutes.delete('/api/admin/users/:id', requireAdmin, async (c) => {
  await deleteUserOp(prisma, c.req.param('id'), actorFrom(c, c.get('admin').id));
  return c.json({ ok: true });
});

const PointsAdjustBody = z.object({
  delta: z.number().int(),
  reason: z.string().max(500).optional(),
});

adminUsersRoutes.post('/api/admin/users/:id/points', requireAdmin, async (c) => {
  let body: z.infer<typeof PointsAdjustBody>;
  try { body = PointsAdjustBody.parse(await c.req.json()); }
  catch { throw new AppError('POINTS_BODY_INVALID', 'invalid body', 400); }
  const points = await adjustPointsOp(prisma, c.req.param('id'), body, actorFrom(c, c.get('admin').id));
  return c.json({ points });
});

adminUsersRoutes.get('/api/admin/users/:id/points-history', requireAdmin, async (c) => {
  return c.json({ items: await pointsHistoryOp(prisma, c.req.param('id')) });
});

const AccountTypeBody = z.object({
  accountType: z.enum(['verified', 'test']),  // 'blacklisted' deliberately excluded
});

adminUsersRoutes.patch('/api/admin/users/:id/account-type', requireAdmin, async (c) => {
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
  await setAccountTypeOp(prisma, c.req.param('id'), body.accountType, actorFrom(c, c.get('admin').id));
  return c.json({ ok: true });
});

adminUsersRoutes.patch('/api/admin/users/:id/approve', requireAdmin, async (c) => {
  await approveUserOp(prisma, c.req.param('id'), actorFrom(c, c.get('admin').id));
  return c.json({ ok: true });
});

const TestSettingsBody = z.object({
  testSkipCost: z.boolean().optional(),
  testForcePrizeId: z.string().nullable().optional(),
});

adminUsersRoutes.patch('/api/admin/users/:id/test-settings', requireAdmin, async (c) => {
  let body: z.infer<typeof TestSettingsBody>;
  try { body = TestSettingsBody.parse(await c.req.json()); }
  catch { throw new AppError('TEST_SETTINGS_BODY_INVALID', 'invalid body', 400); }
  if (body.testSkipCost === undefined && body.testForcePrizeId === undefined) {
    throw new AppError('TEST_SETTINGS_NO_OP', 'no fields to update', 400);
  }
  await setTestSettingsOp(prisma, c.req.param('id'), body, actorFrom(c, c.get('admin').id));
  return c.json({ ok: true });
});

const BlacklistBody = z.object({
  blacklist: z.boolean(),
  reason: z.string().min(1).max(500).optional(),
  restoreTo: z.enum(['verified', 'test']).optional(),
});

adminUsersRoutes.patch('/api/admin/users/:id/blacklist', requireAdmin, async (c) => {
  let body: z.infer<typeof BlacklistBody>;
  try { body = BlacklistBody.parse(await c.req.json()); }
  catch { throw new AppError('BLACKLIST_BODY_INVALID', 'invalid body', 400); }
  if (body.blacklist && (!body.reason || body.reason.trim() === '')) {
    throw new AppError('BLACKLIST_REASON_REQUIRED', 'reason required when blacklisting', 400);
  }
  await blacklistOp(prisma, c.req.param('id'), body, actorFrom(c, c.get('admin').id));
  return c.json({ ok: true });
});

const EntertainmentCodeBody = z.object({
  code: z.string().min(1).max(64).nullable(),
  reason: z.string().min(1).max(500),
});

adminUsersRoutes.patch('/api/admin/users/:id/entertainment-code', requireAdmin, async (c) => {
  let body: z.infer<typeof EntertainmentCodeBody>;
  try {
    const raw = await c.req.json();
    if (!raw.reason) throw new AppError('ENTERTAINMENT_CODE_REASON_REQUIRED', 'reason is required', 400);
    body = EntertainmentCodeBody.parse(raw);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('ENTERTAINMENT_CODE_BODY_INVALID', 'invalid body', 400);
  }
  await setEntertainmentCodeOp(prisma, c.req.param('id'), body, actorFrom(c, c.get('admin').id));
  return c.json({ ok: true });
});

adminUsersRoutes.get('/api/admin/users/:id/draw-history', requireAdmin, async (c) => {
  const url = new URL(c.req.url);
  const take = Math.min(Number(url.searchParams.get('take') ?? 25), 50);
  const cursor = url.searchParams.get('cursor');
  return c.json(await drawHistoryOp(prisma, c.req.param('id'), { take, cursor }));
});
