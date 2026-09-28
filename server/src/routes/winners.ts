import { Hono } from 'hono';
import { prisma } from '../db.js';
import { SETTINGS_KEYS, DEFAULT_SETTINGS } from '../../prisma/seed.js';

// Recent real wins for the member-home ticker. Public (the ticker renders before any
// member action) but every identifier is masked, test accounts and cancelled
// redemptions are excluded, and results are cached briefly to keep DB/egress flat.
export const winnersRoutes = new Hono();

const CACHE_MS = 30_000;
const TAKE = 20;

export interface RecentWinner {
  id: string;
  maskedId: string;
  rankLabel: string;
  amount: number;
}

let cache: { at: number; items: RecentWinner[] } | null = null;

/** "ab12345" → "ab***45"; short values keep less. Counts code points so CJK nicknames mask cleanly. */
export function maskMemberId(raw: string | null | undefined): string {
  const chars = Array.from((raw ?? '').trim());
  if (chars.length === 0) return '***';
  if (chars.length <= 2) return `${chars[0]}***`;
  if (chars.length <= 4) return `${chars[0]}***${chars[chars.length - 1]}`;
  return `${chars.slice(0, 2).join('')}***${chars.slice(-2).join('')}`;
}

async function tickerEnabled(): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEYS.winTickerEnabled } });
  return (row?.value ?? DEFAULT_SETTINGS[SETTINGS_KEYS.winTickerEnabled]) === 'true';
}

winnersRoutes.get('/api/winners/recent', async (c) => {
  if (!(await tickerEnabled())) return c.json({ items: [] });
  if (cache && Date.now() - cache.at < CACHE_MS) return c.json({ items: cache.items });

  const rows = await prisma.redemption.findMany({
    where: { isTest: false, totalWinAmount: { gt: 0 }, status: { not: 'cancelled' } },
    orderBy: { createdAt: 'desc' },
    take: TAKE,
    select: {
      id: true,
      totalWinAmount: true,
      user: { select: { entertainmentMemberCode: true, nickname: true } },
      drawLogs: {
        where: { winningCashAmount: { gt: 0 } },
        orderBy: { winningCashAmount: 'desc' },
        take: 1,
        select: { prize: { select: { rankLabel: true } } },
      },
    },
  });

  const items: RecentWinner[] = rows.map((r) => ({
    id: r.id,
    maskedId: maskMemberId(r.user.entertainmentMemberCode ?? r.user.nickname),
    rankLabel: r.drawLogs[0]?.prize.rankLabel ?? '',
    amount: r.totalWinAmount,
  }));
  cache = { at: Date.now(), items };
  return c.json({ items });
});
