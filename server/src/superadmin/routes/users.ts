import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import {
  actorFrom,
  type AuditActor,
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
} from '../../admin/users/ops.js';
import { requireSuperadmin } from '../auth/middleware.js';
import { clientFor } from '../clients.js';
import { superadminEnv, isSite, SITES, type Site } from '../env.js';

export const superadminUsersRoutes = new Hono();

function siteParam(c: Context): Site {
  const s = c.req.param('site');
  if (!isSite(s)) throw new AppError('SITE_INVALID', 'unknown site', 400);
  return s;
}

function superActor(c: Context): AuditActor {
  // The superadmin's AdminUser lives in the CONTROL db; when it mutates the
  // other site's db, that id won't resolve there, so we also stamp a note for
  // cross-site traceability (audit lookups on the non-control site show the
  // note instead of a resolvable admin).
  const sa = c.get('superadmin');
  return { ...actorFrom(c, sa.id), note: `superadmin:${sa.email}` };
}

// ---- list: merge both sites into one feed ---------------------------------
// Contract: each site is paginated INDEPENDENTLY by `take` (so the response can
// hold up to 2×take rows), then merged and sorted by createdAt desc purely for
// display. `cursors` are per-site — load-more advances each site on its own.
// We intentionally do NOT slice to a single global `take`, because that would
// silently hide one site's rows behind the other's.

const ListQuery = z.object({
  tab: z.enum(['verified', 'test', 'pending']).default('pending'),
  q: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).default(25),
  cursorA: z.string().optional(),
  cursorB: z.string().optional(),
});

superadminUsersRoutes.get('/api/superadmin/users', requireSuperadmin, async (c) => {
  let query: z.infer<typeof ListQuery>;
  try { query = ListQuery.parse(Object.fromEntries(new URL(c.req.url).searchParams)); }
  catch { throw new AppError('LIST_QUERY_INVALID', 'invalid query parameters', 400); }

  const cfg = superadminEnv();
  const cursors: Record<Site, string | undefined> = { A: query.cursorA, B: query.cursorB };

  const perSite = await Promise.all(
    SITES.map(async (site) => {
      const { items, nextCursor } = await listUsersOp(clientFor(site), {
        tab: query.tab, q: query.q, take: query.take, cursor: cursors[site],
      });
      return { site, nextCursor, items: items.map((u) => ({ ...u, site, siteLabel: cfg.labels[site] })) };
    }),
  );

  const items = perSite
    .flatMap((s) => s.items)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const nextCursors: Record<Site, string | null> = { A: null, B: null };
  for (const s of perSite) nextCursors[s.site] = s.nextCursor;

  return c.json({ items, cursors: nextCursors });
});

// ---- per-site single-user read --------------------------------------------

superadminUsersRoutes.get('/api/superadmin/users/:site/:id', requireSuperadmin, async (c) => {
  const site = siteParam(c);
  const user = await getUserOp(clientFor(site), c.req.param('id'));

  // Cross-site dedupe: same person (same LINE channel ⇒ same lineUserId) or the
  // same 娛樂城會員編號 registered on the OTHER site. Helps審核 catch dupes.
  const cfg = superadminEnv();
  const otherSite: Site = site === 'A' ? 'B' : 'A';
  const other = clientFor(otherSite);
  const [byLine, byCode] = await Promise.all([
    other.user.findUnique({
      where: { lineUserId: user.lineUserId },
      select: { id: true, nickname: true, displayName: true, accountType: true, entertainmentMemberCode: true, createdAt: true },
    }),
    user.entertainmentMemberCode
      ? other.user.findUnique({
          where: { entertainmentMemberCode: user.entertainmentMemberCode },
          select: { id: true, nickname: true, displayName: true, accountType: true, lineUserId: true, createdAt: true },
        })
      : Promise.resolve(null),
  ]);

  return c.json({
    user: { ...user, site, siteLabel: cfg.labels[site] },
    crossSite: {
      otherSite,
      otherSiteLabel: cfg.labels[otherSite],
      sameLineUser: byLine,
      sameEntertainmentCode: byCode,
    },
  });
});

superadminUsersRoutes.get('/api/superadmin/users/:site/:id/points-history', requireSuperadmin, async (c) => {
  const site = siteParam(c);
  return c.json({ items: await pointsHistoryOp(clientFor(site), c.req.param('id')) });
});

superadminUsersRoutes.get('/api/superadmin/users/:site/:id/draw-history', requireSuperadmin, async (c) => {
  const site = siteParam(c);
  const url = new URL(c.req.url);
  const take = Math.min(Number(url.searchParams.get('take') ?? 25), 50);
  const cursor = url.searchParams.get('cursor');
  return c.json(await drawHistoryOp(clientFor(site), c.req.param('id'), { take, cursor }));
});

// ---- per-site mutations (full member management) --------------------------

superadminUsersRoutes.delete('/api/superadmin/users/:site/:id', requireSuperadmin, async (c) => {
  const site = siteParam(c);
  await deleteUserOp(clientFor(site), c.req.param('id'), superActor(c));
  return c.json({ ok: true });
});

const PointsAdjustBody = z.object({
  delta: z.number().int(),
  reason: z.string().max(500).optional(),
});

superadminUsersRoutes.post('/api/superadmin/users/:site/:id/points', requireSuperadmin, async (c) => {
  const site = siteParam(c);
  let body: z.infer<typeof PointsAdjustBody>;
  try { body = PointsAdjustBody.parse(await c.req.json()); }
  catch { throw new AppError('POINTS_BODY_INVALID', 'invalid body', 400); }
  const points = await adjustPointsOp(clientFor(site), c.req.param('id'), body, superActor(c));
  return c.json({ points });
});

const AccountTypeBody = z.object({
  accountType: z.enum(['verified', 'test']),  // 'blacklisted' deliberately excluded
});

superadminUsersRoutes.patch('/api/superadmin/users/:site/:id/account-type', requireSuperadmin, async (c) => {
  const site = siteParam(c);
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
  await setAccountTypeOp(clientFor(site), c.req.param('id'), body.accountType, superActor(c));
  return c.json({ ok: true });
});

superadminUsersRoutes.patch('/api/superadmin/users/:site/:id/approve', requireSuperadmin, async (c) => {
  const site = siteParam(c);
  await approveUserOp(clientFor(site), c.req.param('id'), superActor(c));
  return c.json({ ok: true });
});

const TestSettingsBody = z.object({
  testSkipCost: z.boolean().optional(),
  testForcePrizeId: z.string().nullable().optional(),
});

superadminUsersRoutes.patch('/api/superadmin/users/:site/:id/test-settings', requireSuperadmin, async (c) => {
  const site = siteParam(c);
  let body: z.infer<typeof TestSettingsBody>;
  try { body = TestSettingsBody.parse(await c.req.json()); }
  catch { throw new AppError('TEST_SETTINGS_BODY_INVALID', 'invalid body', 400); }
  if (body.testSkipCost === undefined && body.testForcePrizeId === undefined) {
    throw new AppError('TEST_SETTINGS_NO_OP', 'no fields to update', 400);
  }
  await setTestSettingsOp(clientFor(site), c.req.param('id'), body, superActor(c));
  return c.json({ ok: true });
});

const BlacklistBody = z.object({
  blacklist: z.boolean(),
  reason: z.string().min(1).max(500).optional(),
  restoreTo: z.enum(['verified', 'test']).optional(),
});

superadminUsersRoutes.patch('/api/superadmin/users/:site/:id/blacklist', requireSuperadmin, async (c) => {
  const site = siteParam(c);
  let body: z.infer<typeof BlacklistBody>;
  try { body = BlacklistBody.parse(await c.req.json()); }
  catch { throw new AppError('BLACKLIST_BODY_INVALID', 'invalid body', 400); }
  if (body.blacklist && (!body.reason || body.reason.trim() === '')) {
    throw new AppError('BLACKLIST_REASON_REQUIRED', 'reason required when blacklisting', 400);
  }
  await blacklistOp(clientFor(site), c.req.param('id'), body, superActor(c));
  return c.json({ ok: true });
});

const EntertainmentCodeBody = z.object({
  code: z.string().min(1).max(64).nullable(),
  reason: z.string().min(1).max(500),
});

superadminUsersRoutes.patch('/api/superadmin/users/:site/:id/entertainment-code', requireSuperadmin, async (c) => {
  const site = siteParam(c);
  let body: z.infer<typeof EntertainmentCodeBody>;
  try {
    const raw = await c.req.json();
    if (!raw.reason) throw new AppError('ENTERTAINMENT_CODE_REASON_REQUIRED', 'reason is required', 400);
    body = EntertainmentCodeBody.parse(raw);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('ENTERTAINMENT_CODE_BODY_INVALID', 'invalid body', 400);
  }
  await setEntertainmentCodeOp(clientFor(site), c.req.param('id'), body, superActor(c));
  return c.json({ ok: true });
});
