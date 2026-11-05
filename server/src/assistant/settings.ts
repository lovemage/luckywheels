import { z } from 'zod';
import { Prisma, type PrismaClient } from '@prisma/client';
import { DEFAULT_SETTINGS, SETTINGS_KEYS } from '../../prisma/seed.js';
import { SCORE_METRICS, type ScoreMetric } from './scoring.js';

// 數據助手的 AppSetting 參數：讀取（設定值損壞時退回預設，不讓 API 失敗）與後台寫入共用同一份驗證規則。

type Client = PrismaClient | Prisma.TransactionClient;
const K = SETTINGS_KEYS;

/** 目前開放的最高目標倍數（業主：先做 5 倍，10 倍暫不開放） */
export const MAX_TARGET_MULTIPLIER = 5;

// ── 綜合分數與本金推薦 ──────────────────────────────

export const TierSchema = z.object({
  minPrincipal: z.number().int().min(0).max(100_000_000),
  minScore: z.number().int().min(0).max(100),
  maxMultiplier: z.number().int().min(1).max(MAX_TARGET_MULTIPLIER),
});
export type RecommendTier = z.infer<typeof TierSchema>;

export const TiersSchema = z
  .array(TierSchema)
  .min(1)
  .max(10)
  .refine((t) => t[0]!.minPrincipal === 0, '第一個級距必須從 0 開始')
  .refine((t) => t.every((x, i) => i === 0 || x.minPrincipal > t[i - 1]!.minPrincipal), '級距金額必須遞增');

export const WeightsSchema = z
  .object(Object.fromEntries(SCORE_METRICS.map((m) => [m, z.number().min(0).max(100)])) as Record<ScoreMetric, z.ZodNumber>)
  .refine((w) => SCORE_METRICS.some((m) => w[m] > 0), '至少一個權重要大於 0');

export const RecommendSettingsSchema = z.object({
  weights: WeightsSchema,
  tiers: TiersSchema,
  multiplierStepScore: z.number().int().min(0).max(20),
  count: z.number().int().min(1).max(20),
  minBetAdvice: z.number().int().min(1).max(100_000),
  premiumPercent: z.number().int().min(0).max(100),
  /** 從符合門檻的前幾間空台中挑選（小於 count 時以 count 計） */
  poolSize: z.number().int().min(1).max(500),
  /** 近幾分鐘內已推薦過的房間優先避開；0＝不避開 */
  avoidMinutes: z.number().int().min(0).max(240),
});
export type RecommendSettings = z.infer<typeof RecommendSettingsSchema>;

// ── 資料逾時（計劃 1.5）────────────────────────────

export const FreshnessSettingsSchema = z.object({
  listMaxAgeSeconds: z.number().int().min(60).max(86_400),
  detailMaxAgeSeconds: z.number().int().min(60).max(259_200),
});
export type FreshnessSettings = z.infer<typeof FreshnessSettingsSchema>;

// ── 訊號 ───────────────────────────────────────────

export const SignalSettingsSchema = z
  .object({
    /** 綁定房間的最低綜合分數 */
    minScore: z.number().int().min(0).max(100),
    /** 綁定房間今日 RTP 與發出時相差達此百分點即換組 */
    rtpChangePoints: z.number().min(0.5).max(100),
    /** 同一間房同時最多綁幾則有效訊號（避免太多會員擠同一台） */
    maxPerRoom: z.number().int().min(1).max(50),
    /** 會員手動「換一組」的冷卻秒數 */
    refreshCooldownSeconds: z.number().int().min(0).max(3600),
    /** 訊號強度 %：分數 0 → strengthMin、分數 100 → strengthMax */
    strengthMin: z.number().int().min(1).max(99),
    strengthMax: z.number().int().min(1).max(99),
  })
  .refine((s) => s.strengthMin <= s.strengthMax, '強度下限不可大於上限');
export type SignalSettings = z.infer<typeof SignalSettingsSchema>;

// ── 會員端顯示文字（後台可改）─────────────────────

export const DisplaySettingsSchema = z.object({
  /** 頂列 Logo 名稱 */
  brandName: z.string().trim().min(1).max(20),
  /** 首頁精選空台區塊標題 */
  topTitle: z.string().trim().min(1).max(30),
});
export type DisplaySettings = z.infer<typeof DisplaySettingsSchema>;

// ── 使用期限兌換方案（積分 → 時長）──────────────────

export const TimePlanSchema = z.object({
  points: z.number().int().min(1).max(10_000),
  hours: z.number().int().min(1).max(8_760),
});
export type TimePlan = z.infer<typeof TimePlanSchema>;

export const TimePlansSchema = z
  .array(TimePlanSchema)
  .min(1)
  .max(10)
  .refine((p) => new Set(p.map((x) => x.points)).size === p.length, '每個方案的積分數不可重複');

// ── 讀取 ───────────────────────────────────────────

const ALL_KEYS = [
  K.assistantScoreWeights,
  K.assistantRecommendTiers,
  K.assistantMultiplierStepScore,
  K.assistantRecommendCount,
  K.assistantMinBetAdvice,
  K.assistantPremiumPercent,
  K.assistantRecommendPoolSize,
  K.assistantRecommendAvoidMinutes,
  K.assistantDataMaxAgeSeconds,
  K.assistantDetailMaxAgeSeconds,
  K.assistantSignalMinScore,
  K.assistantSignalRtpChangePoints,
  K.assistantSignalMaxPerRoom,
  K.assistantSignalRefreshCooldownSeconds,
  K.assistantSignalStrengthMin,
  K.assistantSignalStrengthMax,
  K.assistantTimePlans,
  K.assistantBrandName,
  K.assistantTopTitle,
];

async function readRaw(prisma: Client, keys: string[]): Promise<(key: string) => string> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
  return (key) => rows.find((r) => r.key === key)?.value ?? DEFAULT_SETTINGS[key]!;
}

const json = (raw: string): unknown => {
  try { return JSON.parse(raw); } catch { return undefined; }
};
const num = (raw: string): number => Number(raw);

const buildRecommend = (get: (k: string) => string) => ({
  weights: json(get(K.assistantScoreWeights)),
  tiers: json(get(K.assistantRecommendTiers)),
  multiplierStepScore: num(get(K.assistantMultiplierStepScore)),
  count: num(get(K.assistantRecommendCount)),
  minBetAdvice: num(get(K.assistantMinBetAdvice)),
  premiumPercent: num(get(K.assistantPremiumPercent)),
  poolSize: num(get(K.assistantRecommendPoolSize)),
  avoidMinutes: num(get(K.assistantRecommendAvoidMinutes)),
});
const buildFreshness = (get: (k: string) => string) => ({
  listMaxAgeSeconds: num(get(K.assistantDataMaxAgeSeconds)),
  detailMaxAgeSeconds: num(get(K.assistantDetailMaxAgeSeconds)),
});
const buildSignal = (get: (k: string) => string) => ({
  minScore: num(get(K.assistantSignalMinScore)),
  rtpChangePoints: num(get(K.assistantSignalRtpChangePoints)),
  maxPerRoom: num(get(K.assistantSignalMaxPerRoom)),
  refreshCooldownSeconds: num(get(K.assistantSignalRefreshCooldownSeconds)),
  strengthMin: num(get(K.assistantSignalStrengthMin)),
  strengthMax: num(get(K.assistantSignalStrengthMax)),
});

const buildDisplay = (get: (k: string) => string) => ({
  brandName: get(K.assistantBrandName),
  topTitle: get(K.assistantTopTitle),
});

/** 個別欄位驗證：設定值損壞只影響該欄（其餘欄位保留後台設定） */
function perField<T extends Record<string, unknown>>(schema: z.ZodType<T>, build: (get: (k: string) => string) => unknown, get: (k: string) => string): T {
  const candidate = build(get) as Record<string, unknown>;
  const fallback = build((key) => DEFAULT_SETTINGS[key]!) as Record<string, unknown>;
  const whole = schema.safeParse(candidate);
  if (whole.success) return whole.data;
  const merged: Record<string, unknown> = { ...candidate };
  for (const issue of whole.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string') merged[field] = fallback[field];
  }
  const second = schema.safeParse(merged);
  // 欄位之間互相牽制（例：強度上下限）時，整組退回預設
  return second.success ? second.data : schema.parse(fallback);
}

export async function readRecommendSettings(prisma: Client): Promise<RecommendSettings> {
  return perField(RecommendSettingsSchema, buildRecommend, await readRaw(prisma, ALL_KEYS));
}

export async function readFreshnessSettings(prisma: Client): Promise<FreshnessSettings> {
  return perField(FreshnessSettingsSchema, buildFreshness, await readRaw(prisma, ALL_KEYS));
}

export async function readSignalSettings(prisma: Client): Promise<SignalSettings> {
  return perField(SignalSettingsSchema, buildSignal, await readRaw(prisma, ALL_KEYS));
}

export async function readDisplaySettings(prisma: Client): Promise<DisplaySettings> {
  return perField(DisplaySettingsSchema, buildDisplay, await readRaw(prisma, ALL_KEYS));
}

export async function readTimePlans(prisma: Client): Promise<TimePlan[]> {
  const get = await readRaw(prisma, [K.assistantTimePlans]);
  const parsed = TimePlansSchema.safeParse(json(get(K.assistantTimePlans)));
  const plans = parsed.success ? parsed.data : TimePlansSchema.parse(json(DEFAULT_SETTINGS[K.assistantTimePlans]!));
  return [...plans].sort((a, b) => a.points - b.points);
}

// ── 寫入（後台）────────────────────────────────────

/** 一句 SQL 批次 upsert（逐筆 upsert 在遠端 DB 上會拖過 transaction 時限） */
async function writeAll(prisma: Client, entries: [string, string][]): Promise<void> {
  if (entries.length === 0) return;
  const values = Prisma.join(entries.map(([key, value]) => Prisma.sql`(${key}, ${value}, now())`));
  await prisma.$executeRaw`
    INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES ${values}
    ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = EXCLUDED."updatedAt"`;
}

export async function writeRecommendSettings(prisma: Client, s: RecommendSettings): Promise<void> {
  await writeAll(prisma, [
    [K.assistantScoreWeights, JSON.stringify(s.weights)],
    [K.assistantRecommendTiers, JSON.stringify(s.tiers)],
    [K.assistantMultiplierStepScore, String(s.multiplierStepScore)],
    [K.assistantRecommendCount, String(s.count)],
    [K.assistantMinBetAdvice, String(s.minBetAdvice)],
    [K.assistantPremiumPercent, String(s.premiumPercent)],
    [K.assistantRecommendPoolSize, String(s.poolSize)],
    [K.assistantRecommendAvoidMinutes, String(s.avoidMinutes)],
  ]);
}

export async function writeFreshnessSettings(prisma: Client, s: FreshnessSettings): Promise<void> {
  await writeAll(prisma, [
    [K.assistantDataMaxAgeSeconds, String(s.listMaxAgeSeconds)],
    [K.assistantDetailMaxAgeSeconds, String(s.detailMaxAgeSeconds)],
  ]);
}

export async function writeSignalSettings(prisma: Client, s: SignalSettings): Promise<void> {
  await writeAll(prisma, [
    [K.assistantSignalMinScore, String(s.minScore)],
    [K.assistantSignalRtpChangePoints, String(s.rtpChangePoints)],
    [K.assistantSignalMaxPerRoom, String(s.maxPerRoom)],
    [K.assistantSignalRefreshCooldownSeconds, String(s.refreshCooldownSeconds)],
    [K.assistantSignalStrengthMin, String(s.strengthMin)],
    [K.assistantSignalStrengthMax, String(s.strengthMax)],
  ]);
}

export async function writeDisplaySettings(prisma: Client, s: DisplaySettings): Promise<void> {
  await writeAll(prisma, [
    [K.assistantBrandName, s.brandName],
    [K.assistantTopTitle, s.topTitle],
  ]);
}

export async function writeTimePlans(prisma: Client, plans: TimePlan[]): Promise<void> {
  const sorted = [...plans].sort((a, b) => a.points - b.points);
  await writeAll(prisma, [[K.assistantTimePlans, JSON.stringify(sorted)]]);
}
