import { Prisma, type AssistantExchange, type PrismaClient } from '@prisma/client';
import { AppError } from '../errors.js';
import type { TimePlan } from './settings.js';

// 數據助手使用期限（計劃 M1，2026-11-04 業主指示）：積分直接兌換時長，不經過金幣。
// 積分與輪盤共用 User.points（只扣除，不改結構）。續兌從 max(now, expiresAt) 往後加。
// 同一會員的兌換與人工調整以 advisory lock 排隊，避免兩筆同時讀到舊的到期時間。

type Tx = Prisma.TransactionClient;
const HOUR = 3_600_000;
const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

export interface PassView {
  active: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  remainingSeconds: number;
}

export function toPassView(pass: { startsAt: Date; expiresAt: Date } | null, now: Date): PassView {
  if (!pass) return { active: false, startsAt: null, expiresAt: null, remainingSeconds: 0 };
  const remaining = Math.max(0, Math.floor((pass.expiresAt.getTime() - now.getTime()) / 1000));
  return { active: remaining > 0, startsAt: pass.startsAt.toISOString(), expiresAt: pass.expiresAt.toISOString(), remainingSeconds: remaining };
}

export async function getPass(prisma: PrismaClient | Tx, userId: string, now: Date): Promise<PassView> {
  return toPassView(await prisma.assistantPass.findUnique({ where: { userId } }), now);
}

/** 方案文案（前台介紹頁、兌換頁直接顯示；後台改方案後自動更新） */
export function planLabel(plan: TimePlan): string {
  const days = plan.hours >= 24 && plan.hours % 24 === 0 ? `（${plan.hours / 24} 天）` : '';
  return `${plan.points} 點積分兌換 ${plan.hours} 小時${days}`;
}

export const presentPlans = (plans: TimePlan[]) => plans.map((p) => ({ ...p, label: planLabel(p) }));

const lockUser = (tx: Tx, userId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assistant-pass:${userId}`}))`;

async function extend(tx: Tx, userId: string, hours: number, now: Date) {
  const pass = await tx.assistantPass.findUnique({ where: { userId } });
  const active = pass !== null && pass.expiresAt > now;
  const before = pass?.expiresAt ?? null;
  let after: Date;
  if (hours >= 0) {
    after = new Date((active ? pass!.expiresAt : now).getTime() + hours * HOUR);
  } else {
    if (!active) throw new AppError('ASSISTANT_PASS_NOT_ACTIVE', 'pass is not active; nothing to deduct', 409);
    // 扣時最多扣到現在（立即到期），不會變成負的
    after = new Date(Math.max(now.getTime(), pass!.expiresAt.getTime() + hours * HOUR));
  }
  await tx.assistantPass.upsert({
    where: { userId },
    create: { userId, startsAt: now, expiresAt: after },
    // 過期後重新開通：起算時間重設
    update: active ? { expiresAt: after } : { startsAt: now, expiresAt: after },
  });
  return { before, after };
}

export interface ExchangeResult {
  exchange: AssistantExchange;
  replayed: boolean;
}

export async function exchangePointsForTime(
  prisma: PrismaClient,
  userId: string,
  plan: TimePlan,
  idempotencyKey: string,
): Promise<ExchangeResult> {
  const existing = await prisma.assistantExchange.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
  if (existing) return { exchange: existing, replayed: true };
  try {
    const exchange = await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const now = new Date();
      const dec = await tx.user.updateMany({
        where: { id: userId, points: { gte: plan.points } },
        data: { points: { decrement: plan.points } },
      });
      if (dec.count === 0) throw new AppError('INSUFFICIENT_POINTS', 'not enough points', 422);
      const { points } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { points: true } });
      const { before, after } = await extend(tx, userId, plan.hours, now);
      return tx.assistantExchange.create({
        data: {
          userId,
          kind: 'points_to_time',
          pointsSpent: plan.points,
          pointsBefore: points + plan.points,
          pointsAfter: points,
          hours: plan.hours,
          expiresBefore: before,
          expiresAfter: after,
          idempotencyKey,
        },
      });
    }, TX_OPTIONS);
    return { exchange, replayed: false };
  } catch (e) {
    // 同一把 key 併發重送：另一筆已先寫入
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const row = await prisma.assistantExchange.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
      if (row) return { exchange: row, replayed: true };
    }
    throw e;
  }
}

/** 後台人工加時（hours > 0）／扣時（hours < 0）。呼叫端負責寫 AdminActionLog（同一個 tx）。 */
export async function adminAdjustPass(
  tx: Tx,
  userId: string,
  hours: number,
  adminUserId: string | null,
  note: string | null,
): Promise<AssistantExchange> {
  await lockUser(tx, userId);
  const now = new Date();
  const { before, after } = await extend(tx, userId, hours, now);
  return tx.assistantExchange.create({
    data: { userId, kind: 'admin_adjust', hours, expiresBefore: before, expiresAfter: after, adminUserId, note },
  });
}

export const ADJUST_TX_OPTIONS = TX_OPTIONS;

export function presentExchange(e: AssistantExchange) {
  return {
    id: e.id,
    kind: e.kind,
    pointsSpent: e.pointsSpent,
    pointsBefore: e.pointsBefore,
    pointsAfter: e.pointsAfter,
    hours: e.hours,
    expiresBefore: e.expiresBefore?.toISOString() ?? null,
    expiresAfter: e.expiresAfter.toISOString(),
    note: e.note,
    createdAt: e.createdAt.toISOString(),
  };
}
