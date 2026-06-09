import { Hono } from 'hono';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '../../errors.js';
import { requireSuperadmin } from '../auth/middleware.js';
import { clientFor } from '../clients.js';
import { superadminEnv, SITES, type Site } from '../env.js';

export const superadminStatsRoutes = new Hono();

// Taiwan has no DST, so it is always UTC+8 — bucket boundaries can use a fixed
// offset instead of a timezone library.
const TAIPEI_OFFSET = 8 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

interface Bucket { startUtc: Date; endUtc: Date; key: string; label: string; }

function pad(n: number): string { return String(n).padStart(2, '0'); }

/**
 * The last `n` week/month buckets in Taipei local time, newest first. Each
 * bucket carries real UTC [start,end) bounds so the SQL can compare against
 * stored UTC timestamps directly (no date_trunc / timezone casting).
 */
function generateBuckets(period: 'week' | 'month', n: number, nowMs: number): Bucket[] {
  // Read Taipei wall-clock components by shifting then using getUTC*.
  const tp = new Date(nowMs + TAIPEI_OFFSET);
  const out: { startWall: number; endWall: number }[] = [];

  if (period === 'month') {
    const y = tp.getUTCFullYear();
    const m = tp.getUTCMonth();
    for (let i = 0; i < n; i++) {
      out.push({ startWall: Date.UTC(y, m - i, 1), endWall: Date.UTC(y, m - i + 1, 1) });
    }
  } else {
    const dow = (tp.getUTCDay() + 6) % 7; // Monday = 0
    const todayWall = Date.UTC(tp.getUTCFullYear(), tp.getUTCMonth(), tp.getUTCDate());
    const thisMon = todayWall - dow * DAY;
    for (let i = 0; i < n; i++) {
      const startWall = thisMon - i * 7 * DAY;
      out.push({ startWall, endWall: startWall + 7 * DAY });
    }
  }

  return out.map(({ startWall, endWall }) => {
    const s = new Date(startWall); // getUTC* reads Taipei wall date
    const e = new Date(endWall - DAY);
    const label = period === 'month'
      ? `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}`
      : `${pad(s.getUTCMonth() + 1)}/${pad(s.getUTCDate())}–${pad(e.getUTCMonth() + 1)}/${pad(e.getUTCDate())}`;
    return {
      startUtc: new Date(startWall - TAIPEI_OFFSET),
      endUtc: new Date(endWall - TAIPEI_OFFSET),
      key: new Date(startWall).toISOString(),
      label,
    };
  });
}

/**
 * One scan per (table, metric): conditional aggregation returns every bucket's
 * value in a single query. `agg` is a bare aggregate (COUNT(*) / SUM("col"));
 * `where` is extra predicate literals (no user input — safe to inline).
 */
async function bucketed(
  client: PrismaClient,
  table: 'DrawLog' | 'Redemption' | 'User',
  agg: string,
  where: string,
  buckets: Bucket[],
): Promise<number[]> {
  const params: unknown[] = [];
  const cols = buckets.map((b, i) => {
    const si = params.length + 1; params.push(b.startUtc);
    const ei = params.length + 1; params.push(b.endUtc);
    return `COALESCE(${agg} FILTER (WHERE "createdAt" >= $${si} AND "createdAt" < $${ei}), 0) AS b${i}`;
  });
  const earliest = buckets.reduce((min, b) => (b.startUtc < min ? b.startUtc : min), buckets[0]!.startUtc);
  const ei = params.length + 1; params.push(earliest);
  const whereClause = where ? `${where} AND ` : '';
  const sql = `SELECT ${cols.join(', ')} FROM "${table}" WHERE ${whereClause}"createdAt" >= $${ei}`;
  const rows = await client.$queryRawUnsafe<Record<string, bigint | number | null>[]>(sql, ...params);
  const row = rows[0] ?? {};
  return buckets.map((_, i) => Number(row[`b${i}`] ?? 0));
}

const Query = z.object({
  period: z.enum(['week', 'month']).default('week'),
  n: z.coerce.number().int().min(1).max(26).default(12),
});

interface Metric { A: number; B: number; total: number; }
function metric(a: number, b: number): Metric { return { A: a, B: b, total: a + b }; }

superadminStatsRoutes.get('/api/superadmin/stats', requireSuperadmin, async (c) => {
  let q: z.infer<typeof Query>;
  try { q = Query.parse(Object.fromEntries(new URL(c.req.url).searchParams)); }
  catch { throw new AppError('STATS_QUERY_INVALID', 'invalid query parameters', 400); }

  const buckets = generateBuckets(q.period, q.n, Date.now());

  // Per site: draws (DrawLog rows ⇒ 10連抽 counts as 10), delivered payout
  // (Redemption.totalWinAmount where status=delivered), new members.
  const perSite = await Promise.all(
    SITES.map(async (site) => {
      const client = clientFor(site);
      const [draws, delivered, newMembers, totalMembers] = await Promise.all([
        bucketed(client, 'DrawLog', 'COUNT(*)', '"isTest" = false', buckets),
        bucketed(client, 'Redemption', 'SUM("totalWinAmount")', `"status"::text = 'delivered' AND "isTest" = false`, buckets),
        bucketed(client, 'User', 'COUNT(*)', '', buckets),
        client.user.count(),
      ]);
      return { site, draws, delivered, newMembers, totalMembers };
    }),
  );

  const bySite = (s: Site) => perSite.find((p) => p.site === s)!;
  const A = bySite('A');
  const B = bySite('B');
  const cfg = superadminEnv();

  return c.json({
    period: q.period,
    sites: SITES.map((s) => ({ site: s, label: cfg.labels[s] })),
    totals: { members: metric(A.totalMembers, B.totalMembers) },
    buckets: buckets.map((b, i) => ({
      key: b.key,
      label: b.label,
      draws: metric(A.draws[i]!, B.draws[i]!),
      delivered: metric(A.delivered[i]!, B.delivered[i]!),
      newMembers: metric(A.newMembers[i]!, B.newMembers[i]!),
    })),
  });
});
