import { Hono } from 'hono';
import { prisma } from '../db.js';
import { SETTINGS_KEYS, DEFAULT_SETTINGS } from '../../prisma/seed.js';

// Recent wins for the member-home ticker. Public (the ticker renders before any
// member action) but every identifier is masked, test accounts and cancelled
// redemptions are excluded, and results are cached briefly to keep DB/egress flat.
// Pre-launch sites can append an admin-managed demo list (winTickerDemo*) after the
// real wins; demo amounts always come from the live prize table.
export const winnersRoutes = new Hono();

const CACHE_MS = 30_000;
const TAKE = 20;

export interface RecentWinner {
  id: string;
  maskedId: string;
  rankLabel: string;
  amount: number;
}

export interface DemoEntry {
  memberId: string;
  rankLabel: string;
}

let cache: { at: number; items: RecentWinner[] } | null = null;

export function parseDemoEntries(raw: string | null | undefined): DemoEntry[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is DemoEntry =>
        typeof e?.memberId === 'string' && e.memberId.trim() !== '' && typeof e?.rankLabel === 'string',
    );
  } catch {
    return [];
  }
}

/** "ab12345" → "ab***45"; short values keep less. Counts code points so CJK nicknames mask cleanly. */
export function maskMemberId(raw: string | null | undefined): string {
  const chars = Array.from((raw ?? '').trim());
  if (chars.length === 0) return '***';
  if (chars.length <= 2) return `${chars[0]}***`;
  if (chars.length <= 4) return `${chars[0]}***${chars[chars.length - 1]}`;
  return `${chars.slice(0, 2).join('')}***${chars.slice(-2).join('')}`;
}

async function readTickerSettings() {
  const rows = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [SETTINGS_KEYS.winTickerEnabled, SETTINGS_KEYS.winTickerDemoEnabled, SETTINGS_KEYS.winTickerDemoEntries],
      },
    },
  });
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const read = (key: string) => m.get(key) ?? DEFAULT_SETTINGS[key];
  return {
    enabled: read(SETTINGS_KEYS.winTickerEnabled) === 'true',
    demoEnabled: read(SETTINGS_KEYS.winTickerDemoEnabled) === 'true',
    demoEntries: parseDemoEntries(read(SETTINGS_KEYS.winTickerDemoEntries)),
  };
}

async function demoWinners(entries: DemoEntry[]): Promise<RecentWinner[]> {
  if (entries.length === 0) return [];
  const prizes = await prisma.prize.findMany({
    where: { enabled: true, cashAmount: { gt: 0 } },
    select: { rankLabel: true, cashAmount: true },
  });
  const amountByLabel = new Map(prizes.map((p) => [p.rankLabel, p.cashAmount]));
  return entries.flatMap((entry, index) => {
    const amount = amountByLabel.get(entry.rankLabel);
    if (!amount) return [];
    return [{ id: `demo-${index}`, maskedId: maskMemberId(entry.memberId), rankLabel: entry.rankLabel, amount }];
  });
}

winnersRoutes.get('/api/winners/recent', async (c) => {
  const settings = await readTickerSettings();
  if (!settings.enabled) return c.json({ items: [] });
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

  const real: RecentWinner[] = rows.map((r) => ({
    id: r.id,
    maskedId: maskMemberId(r.user.entertainmentMemberCode ?? r.user.nickname),
    rankLabel: r.drawLogs[0]?.prize.rankLabel ?? '',
    amount: r.totalWinAmount,
  }));
  const items = settings.demoEnabled ? [...real, ...(await demoWinners(settings.demoEntries))] : real;
  cache = { at: Date.now(), items };
  return c.json({ items });
});
