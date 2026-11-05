import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { requireAdminNav } from '../auth/middleware.js';
import { audit } from '../audit/helper.js';
import { dataAssistantEnabled } from '../../assistant/feature.js';
import {
  DisplaySettingsSchema,
  FreshnessSettingsSchema,
  readDisplaySettings,
  readFreshnessSettings,
  readRecommendSettings,
  readSignalSettings,
  readTimePlans,
  RecommendSettingsSchema,
  SignalSettingsSchema,
  TimePlansSchema,
  writeDisplaySettings,
  writeFreshnessSettings,
  writeRecommendSettings,
  writeSignalSettings,
  writeTimePlans,
} from '../../assistant/settings.js';
import { ADJUST_TX_OPTIONS, adminAdjustPass, getPass, presentExchange, presentPlans } from '../../assistant/pass.js';

// 數據助手後台：
// - 推薦與訊號設定（需 assistant 權限）：綜合分數權重、本金級距、每倍加分、推薦組數、建議單注、精品比例、
//   資料逾時門檻、訊號參數；近期訊號（含綁定房間，僅後台可見）
// - 兌換管理（需 exchange 權限）：積分 → 時長方案、兌換紀錄、會員使用期限與人工加時／扣時

export const adminAssistantSettingsRoutes = new Hono();

const requireFeature: MiddlewareHandler = async (_c, next) => {
  if (!dataAssistantEnabled()) throw new AppError('NOT_FOUND', 'not found', 404);
  await next();
};

const SETTINGS = '/api/admin/assistant/settings';
const SIGNALS = '/api/admin/assistant/signals';
const EXCHANGE = '/api/admin/assistant/exchange';
const MEMBERS = '/api/admin/assistant/members';

for (const path of [SETTINGS, SIGNALS]) adminAssistantSettingsRoutes.use(path, requireFeature, ...requireAdminNav('assistant'));
for (const path of [`${EXCHANGE}/*`, `${MEMBERS}/*`]) adminAssistantSettingsRoutes.use(path, requireFeature, ...requireAdminNav('exchange'));

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || '設定'}：${i.message}`).join('；');
    throw new AppError('ASSISTANT_SETTINGS_INVALID', msg, 400);
  }
  return r.data;
}

const AllSettings = z.object({
  recommend: RecommendSettingsSchema,
  freshness: FreshnessSettingsSchema,
  signal: SignalSettingsSchema,
  display: DisplaySettingsSchema,
});

async function readAll() {
  const [recommend, freshness, signal, display] = await Promise.all([
    readRecommendSettings(prisma),
    readFreshnessSettings(prisma),
    readSignalSettings(prisma),
    readDisplaySettings(prisma),
  ]);
  return { recommend, freshness, signal, display };
}

adminAssistantSettingsRoutes.get(SETTINGS, async (c) => c.json(await readAll()));

adminAssistantSettingsRoutes.put(SETTINGS, async (c) => {
  const body = parse(AllSettings, await c.req.json().catch(() => null));
  const before = await readAll();
  await prisma.$transaction(async (tx) => {
    await writeRecommendSettings(tx, body.recommend);
    await writeFreshnessSettings(tx, body.freshness);
    await writeSignalSettings(tx, body.signal);
    await writeDisplaySettings(tx, body.display);
    await audit(c, tx, {
      event: 'assistant.settings_updated',
      targetType: 'app_setting',
      targetId: 'assistant',
      payloadBefore: before,
      payloadAfter: body,
    });
  }, ADJUST_TX_OPTIONS);
  return c.json(await readAll());
});

const TakeQuery = z.coerce.number().int().min(1).max(200).default(50);

adminAssistantSettingsRoutes.get(SIGNALS, async (c) => {
  const take = TakeQuery.catch(50).parse(c.req.query('take'));
  const rows = await prisma.assistantSignal.findMany({
    orderBy: { issuedAt: 'desc' },
    take,
    include: { room: { select: { roomNo: true } } },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
    select: { id: true, nickname: true, displayName: true },
  });
  const nameOf = new Map(users.map((u) => [u.id, u.nickname ?? u.displayName]));
  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: nameOf.get(r.userId) ?? null,
      roomNo: r.room.roomNo,
      symbols: r.symbols,
      strength: r.strength,
      scoreAtIssue: r.scoreAtIssue,
      rtpAtIssue: r.rtpAtIssue.toFixed(2),
      issuedAt: r.issuedAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      endReason: r.endReason,
    })),
  });
});

// ── 兌換管理 ───────────────────────────────────────

adminAssistantSettingsRoutes.get(`${EXCHANGE}/plans`, async (c) => c.json({ plans: presentPlans(await readTimePlans(prisma)) }));

adminAssistantSettingsRoutes.put(`${EXCHANGE}/plans`, async (c) => {
  const body = parse(z.object({ plans: TimePlansSchema }), await c.req.json().catch(() => null));
  const before = await readTimePlans(prisma);
  await prisma.$transaction(async (tx) => {
    await writeTimePlans(tx, body.plans);
    await audit(c, tx, {
      event: 'assistant.time_plans_updated',
      targetType: 'app_setting',
      targetId: 'assistantTimePlans',
      payloadBefore: before,
      payloadAfter: body.plans,
    });
  }, ADJUST_TX_OPTIONS);
  return c.json({ plans: presentPlans(await readTimePlans(prisma)) });
});

adminAssistantSettingsRoutes.get(`${EXCHANGE}/records`, async (c) => {
  const take = TakeQuery.catch(50).parse(c.req.query('take'));
  const userId = c.req.query('userId') || undefined;
  const rows = await prisma.assistantExchange.findMany({
    where: userId ? { userId } : {},
    orderBy: { createdAt: 'desc' },
    take,
  });
  const ids = [...new Set(rows.map((r) => r.userId))];
  const adminIds = [...new Set(rows.map((r) => r.adminUserId).filter((x): x is string => !!x))];
  const [users, admins] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, nickname: true, displayName: true } }),
    prisma.adminUser.findMany({ where: { id: { in: adminIds } }, select: { id: true, email: true } }),
  ]);
  const nameOf = new Map(users.map((u) => [u.id, u.nickname ?? u.displayName]));
  const adminOf = new Map(admins.map((a) => [a.id, a.email]));
  return c.json({
    items: rows.map((r) => ({
      ...presentExchange(r),
      userId: r.userId,
      userName: nameOf.get(r.userId) ?? null,
      adminAccount: r.adminUserId ? adminOf.get(r.adminUserId) ?? null : null,
    })),
  });
});

adminAssistantSettingsRoutes.get(`${MEMBERS}/:id/pass`, async (c) => {
  const userId = c.req.param('id');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError('USER_NOT_FOUND', 'user not found', 404);
  return c.json({ pass: await getPass(prisma, userId, new Date()) });
});

const AdjustBody = z.object({
  hours: z.number().int().min(-8_760).max(8_760).refine((h) => h !== 0, '時數不可為 0'),
  note: z.string().trim().max(200).optional(),
});

adminAssistantSettingsRoutes.post(`${MEMBERS}/:id/pass-adjust`, async (c) => {
  const userId = c.req.param('id');
  const body = parse(AdjustBody, await c.req.json().catch(() => null));
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError('USER_NOT_FOUND', 'user not found', 404);
  const admin = c.get('admin') as { id: string };
  const exchange = await prisma.$transaction(async (tx) => {
    const row = await adminAdjustPass(tx, userId, body.hours, admin.id, body.note ?? null);
    await audit(c, tx, {
      event: 'assistant.pass_adjusted',
      targetType: 'user',
      targetId: userId,
      payloadBefore: { expiresAt: row.expiresBefore?.toISOString() ?? null },
      payloadAfter: { expiresAt: row.expiresAfter.toISOString(), hours: body.hours },
      note: body.note ?? null,
    });
    return row;
  }, ADJUST_TX_OPTIONS);
  return c.json({ exchange: presentExchange(exchange), pass: await getPass(prisma, userId, new Date()) });
});
