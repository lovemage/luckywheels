import { Hono } from 'hono';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { requireAdminNav } from '../auth/middleware.js';
import { audit } from '../audit/helper.js';
import { SETTINGS_KEYS, DEFAULT_SETTINGS } from '../../../prisma/seed.js';

export const adminSettingsRoutes = new Hono();
const requireSystemNav = requireAdminNav('system');

const Threshold = z.object({
  points: z.number().int().min(1),
  draws: z.number().int().min(1),
});

const Body = z.object({
  pointThresholds: z.array(Threshold).min(1).max(10).optional(),
  spinDurationMs: z.number().int().min(500).max(20000).optional(),
  minDrawsBeforeWin: z.number().int().min(0).max(100).optional(),
  cooldownDrawsAfterWin: z.number().int().min(0).max(100).optional(),
  payoutCapEnabled: z.boolean().optional(),
  payoutCapRatio: z.number().min(0).max(1).optional(),
  costControlEnabled: z.boolean().optional(),
  costControlInterval: z
    .union([z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)])
    .optional(),
  rulesText: z.string().min(1).max(2000).optional(),
  // 首頁外觀：上傳後得到的圖片 URL；空字串＝清除、回退前端內建預設圖。
  homeLogoUrl: z.string().max(2000).optional(),
  homeBackgroundUrl: z.string().max(2000).optional(),
});
type BodyT = z.infer<typeof Body>;

// Map setting key → string serializer (so AppSetting.value stays a string column).
type SerializableValue = string | number | boolean | object;
function serialize(value: SerializableValue): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return JSON.stringify(value);
}

function validatePointThresholds(arr: z.infer<typeof Threshold>[]): void {
  if (arr.length === 0) {
    throw new AppError('POINT_THRESHOLDS_INVALID', 'must have at least 1 threshold', 400);
  }
  // strictly ascending points
  for (let i = 1; i < arr.length; i++) {
    if (arr[i]!.points <= arr[i - 1]!.points) {
      throw new AppError('POINT_THRESHOLDS_INVALID', 'points must be strictly ascending', 400);
    }
    if (arr[i]!.draws <= arr[i - 1]!.draws) {
      throw new AppError('POINT_THRESHOLDS_INVALID', 'draws must be strictly ascending', 400);
    }
  }
  if (arr[0]!.draws < 1) {
    throw new AppError('POINT_THRESHOLDS_INVALID', 'first.draws must be >= 1', 400);
  }
  if (arr[arr.length - 1]!.draws > 10) {
    throw new AppError('POINT_THRESHOLDS_INVALID', 'last.draws must be <= 10', 400);
  }
}

async function readAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  // Backfill with seed defaults so GET works even on a fresh DB.
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (map[k] === undefined) map[k] = v;
  }
  return map;
}

adminSettingsRoutes.get('/api/admin/settings', ...requireSystemNav, async (c) => {
  const m = await readAllSettings();
  let pointThresholds: { points: number; draws: number }[] = [];
  try { pointThresholds = JSON.parse(m[SETTINGS_KEYS.pointThresholds] ?? '[]'); } catch { /* ignore */ }
  const lowestCostPrize = await prisma.prize.findFirst({
    where: { enabled: true, cashAmount: { gt: 0 } },
    orderBy: [{ cashAmount: 'asc' }, { wheelPosition: 'asc' }],
    select: { id: true, rankLabel: true, name: true, cashAmount: true },
  });
  return c.json({
    pointThresholds,
    spinDurationMs: Number(m[SETTINGS_KEYS.spinDurationMs] ?? '0'),
    minDrawsBeforeWin: Number(m[SETTINGS_KEYS.minDrawsBeforeWin] ?? '0'),
    cooldownDrawsAfterWin: Number(m[SETTINGS_KEYS.cooldownDrawsAfterWin] ?? '0'),
    payoutCapEnabled: (m[SETTINGS_KEYS.payoutCapEnabled] ?? 'false') === 'true',
    payoutCapRatio: Number(m[SETTINGS_KEYS.payoutCapRatio] ?? '0'),
    costControlEnabled: (m[SETTINGS_KEYS.costControlEnabled] ?? 'false') === 'true',
    costControlInterval: Number(m[SETTINGS_KEYS.costControlInterval] ?? '3'),
    rulesText: m[SETTINGS_KEYS.rulesText] ?? DEFAULT_SETTINGS[SETTINGS_KEYS.rulesText],
    homeLogoUrl: m[SETTINGS_KEYS.homeLogoUrl] ?? '',
    homeBackgroundUrl: m[SETTINGS_KEYS.homeBackgroundUrl] ?? '',
    totals: {
      drawCount: Number(m[SETTINGS_KEYS.totalDrawCount] ?? '0'),
      payoutAmount: Number(m[SETTINGS_KEYS.totalPayoutAmount] ?? '0'),
      pointsBurned: Number(m[SETTINGS_KEYS.totalPointsBurned] ?? '0'),
    },
    lowestCostPrize,
    consolationPrizeId: m[SETTINGS_KEYS.consolationPrizeId] ?? '',
  });
});

adminSettingsRoutes.patch('/api/admin/settings', ...requireSystemNav, async (c) => {
  let body: BodyT;
  try {
    body = Body.parse(await c.req.json());
  } catch {
    throw new AppError('SETTINGS_BODY_INVALID', 'invalid body', 400);
  }

  if (body.pointThresholds) {
    validatePointThresholds(body.pointThresholds);
  }

  // Build (key → serialized value) for every field actually supplied.
  const updates: Array<{ key: string; value: string }> = [];
  if (body.pointThresholds !== undefined)
    updates.push({ key: SETTINGS_KEYS.pointThresholds, value: serialize(body.pointThresholds) });
  if (body.spinDurationMs !== undefined)
    updates.push({ key: SETTINGS_KEYS.spinDurationMs, value: serialize(body.spinDurationMs) });
  if (body.minDrawsBeforeWin !== undefined)
    updates.push({ key: SETTINGS_KEYS.minDrawsBeforeWin, value: serialize(body.minDrawsBeforeWin) });
  if (body.cooldownDrawsAfterWin !== undefined)
    updates.push({ key: SETTINGS_KEYS.cooldownDrawsAfterWin, value: serialize(body.cooldownDrawsAfterWin) });
  if (body.payoutCapEnabled !== undefined)
    updates.push({ key: SETTINGS_KEYS.payoutCapEnabled, value: serialize(body.payoutCapEnabled) });
  if (body.payoutCapRatio !== undefined)
    updates.push({ key: SETTINGS_KEYS.payoutCapRatio, value: serialize(body.payoutCapRatio) });
  if (body.costControlEnabled !== undefined)
    updates.push({ key: SETTINGS_KEYS.costControlEnabled, value: serialize(body.costControlEnabled) });
  if (body.costControlInterval !== undefined)
    updates.push({ key: SETTINGS_KEYS.costControlInterval, value: serialize(body.costControlInterval) });
  if (body.rulesText !== undefined)
    updates.push({ key: SETTINGS_KEYS.rulesText, value: serialize(body.rulesText) });
  if (body.homeLogoUrl !== undefined)
    updates.push({ key: SETTINGS_KEYS.homeLogoUrl, value: serialize(body.homeLogoUrl) });
  if (body.homeBackgroundUrl !== undefined)
    updates.push({ key: SETTINGS_KEYS.homeBackgroundUrl, value: serialize(body.homeBackgroundUrl) });

  if (updates.length === 0) {
    return c.json({ ok: true });
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.appSetting.findMany({
      where: { key: { in: updates.map((u) => u.key) } },
    });
    const beforeMap = new Map(existing.map((r) => [r.key, r.value]));
    const payloadBefore: Record<string, string | null> = {};
    const payloadAfter: Record<string, string> = {};
    for (const u of updates) {
      payloadBefore[u.key] = beforeMap.get(u.key) ?? null;
      payloadAfter[u.key] = u.value;
      await tx.appSetting.upsert({
        where: { key: u.key },
        create: { key: u.key, value: u.value },
        update: { value: u.value },
      });
    }
    await audit(c, tx, {
      event: 'app_settings.update',
      targetType: 'app_settings',
      payloadBefore: payloadBefore as Prisma.JsonValue,
      payloadAfter: payloadAfter as Prisma.JsonValue,
    });
  });

  return c.json({ ok: true });
});
