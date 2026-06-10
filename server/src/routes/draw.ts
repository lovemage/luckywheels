import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { GatedBy, type Prisma, type Prize, type User } from '@prisma/client';
import { AppError } from '../errors.js';
import { requireUser } from '../auth/middleware.js';
import { prisma } from '../db.js';
import { writeAdminActionLog } from '../audit/log.js';
import { deriveTier, resolveThreshold, type Tier } from '../draw/tier.js';
import {
  readDrawSettings,
  readSystemTotalsForUpdate,
  incrementSystemTotals,
  type DrawSettings,
} from '../draw/settings.js';
import { pickPrize } from '../draw/pick.js';
import { generateRedemptionCode } from '../draw/redemption-code.js';

const BodySchema = z.object({ draws: z.number().int().positive() });

export const drawRoutes = new Hono();

drawRoutes.post('/api/draw', requireUser, async (c) => {
  const user = c.get('user');

  // Gate 0: blacklist
  if (user.accountType === 'blacklisted') {
    await writeAdminActionLog(prisma, {
      event: 'draw_blocked_blacklist',
      targetType: 'user',
      targetId: user.id,
      ip: c.req.header('x-forwarded-for') ?? null,
      userAgent: c.req.header('user-agent') ?? null,
    });
    throw new AppError('USER_BLACKLISTED', 'this account is suspended', 403);
  }

  // Gate 0.5: entertainment-code binding required
  if (!user.nickname || !user.entertainmentMemberCode) {
    throw new AppError('ONBOARDING_REQUIRED', 'must complete onboarding (nickname + entertainment code) before drawing', 403);
  }

  if (user.accountType === 'pending') {
    throw new AppError('ACCOUNT_PENDING_APPROVAL', 'member approval is pending', 403);
  }

  // Body parse
  let body: { draws: number };
  try { body = BodySchema.parse(await c.req.json()); }
  catch { throw new AppError('TIER_INVALID', 'draws must match a configured threshold', 400); }

  const settings = await readDrawSettings();
  let threshold;
  try {
    threshold = resolveThreshold(body.draws, settings.pointThresholds);
  } catch {
    throw new AppError('TIER_INVALID', 'draws must match a configured threshold', 400);
  }
  const tier = deriveTier(threshold);

  if (user.accountType === 'test') {
    return handleTestDraw(c, user, tier, threshold);  // implemented in Task 22
  }

  return handleVerifiedDraw(c, user, tier, threshold);
});

// Build the JSON response body (new Rev 3 shape).
function buildResponse(params: {
  redemption: { id: string; code: string; status: string; totalWinAmount: number; tier: string };
  drawLogs: Array<{ log: { id: string; subIndex: number; winningCashAmount: number; gatedBy: string | null }; chosen: Prize }>;
  finalUserPoints: number;
  tier: Tier;
  tierDraws: number;
  isTest: boolean;
}) {
  return {
    redemption: {
      id: params.redemption.id,
      code: params.redemption.code,
      status: params.redemption.status,
      totalWinAmount: params.redemption.totalWinAmount,
    },
    draws: params.drawLogs.map(({ log, chosen }) => ({
      drawLogId: log.id,
      subIndex: log.subIndex,
      prize: {
        id: chosen.id,
        rankLabel: chosen.rankLabel,
        name: chosen.name,
        description: chosen.description,
        imageUrl: chosen.imageUrl,
        wheelPosition: chosen.wheelPosition,
      },
      winningCashAmount: log.winningCashAmount,
      gatedBy: log.gatedBy,
    })),
    points: params.finalUserPoints,
    tier: params.tier,
    tierDraws: params.tierDraws,
    isTest: params.isTest,
  };
}

function replayBody(
  redemption: Awaited<ReturnType<typeof prisma.redemption.findUnique>> & {
    drawLogs: Array<{ id: string; subIndex: number; winningCashAmount: number; gatedBy: string | null; pointsAfter: number; prize: Prize }>;
  },
  threshold: { points: number; draws: number },
  tier: Tier,
) {
  return {
    redemption: {
      id: redemption!.id,
      code: redemption!.code,
      status: redemption!.status,
      totalWinAmount: redemption!.totalWinAmount,
    },
    draws: redemption!.drawLogs.map((log) => ({
      drawLogId: log.id,
      subIndex: log.subIndex,
      prize: {
        id: log.prize.id,
        rankLabel: log.prize.rankLabel,
        name: log.prize.name,
        description: log.prize.description,
        imageUrl: log.prize.imageUrl,
        wheelPosition: log.prize.wheelPosition,
      },
      winningCashAmount: log.winningCashAmount,
      gatedBy: log.gatedBy,
    })),
    // pointsAfter is identical across all sibling sub-draws (set by the same finalize step).
    points: redemption!.drawLogs[0]?.pointsAfter ?? 0,
    tier,
    tierDraws: threshold.draws,
    isTest: redemption!.isTest,
  };
}

function pickLowestCostPrize(prizes: Prize[], paidOnly = false): Prize {
  const available = prizes.filter((p) => p.enabled && (p.isConsolation || p.stock > 0));
  const paid = available.filter((p) => p.cashAmount > 0);
  const pool = paidOnly && paid.length > 0 ? paid : (paid.length > 0 ? paid : available);
  const chosen = [...pool].sort((a, b) => {
    if (a.cashAmount !== b.cashAmount) return a.cashAmount - b.cashAmount;
    return a.wheelPosition - b.wheelPosition;
  })[0];
  if (!chosen) throw new AppError('NO_PRIZE_AVAILABLE', 'no enabled prize available', 500);
  return chosen;
}

function costControlGate(globalDrawNumber: number, settings: DrawSettings): GatedBy | null {
  if (!settings.costControlEnabled) return null;
  if (settings.costControlInterval <= 0) return null;
  return globalDrawNumber % settings.costControlInterval === 0 ? null : GatedBy.cost_control;
}

function testForcePrizePool(user: User): string[] {
  const testUser = user as User & { testForcePrizeIds?: string[] };
  if (testUser.testForcePrizeIds?.length) return testUser.testForcePrizeIds;
  return user.testForcePrizeId ? [user.testForcePrizeId] : [];
}

function pickForcedTestPrize(pool: Prize[], mode: string, subIndex: number): Prize {
  if (mode === 'cycle') return pool[subIndex % pool.length]!;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

async function reservePrizeStock(tx: Prisma.TransactionClient, prize: Prize): Promise<boolean> {
  if (prize.isConsolation) return true;
  const stockUpdate = await tx.prize.updateMany({
    where: { id: prize.id, stock: { gt: 0 } },
    data: { stock: { decrement: 1 } },
  });
  if (stockUpdate.count === 0) {
    prize.stock = 0;
    return false;
  }
  prize.stock = Math.max(0, prize.stock - 1);
  return true;
}

async function handleVerifiedDraw(c: Context, user: User, tier: Tier, threshold: { points: number; draws: number }) {
  const settings = await readDrawSettings();

  // NOTE: no pre-tx precheck on user.points. The middleware-loaded user is
  // potentially stale; the `WHERE points: { gte: cost }` inside the tx is
  // authoritative. P2025 → 422 below.

  // Idempotency on Redemption (NOT DrawLog — multi has 10 children with same key).
  const idempotencyKey = c.req.header('idempotency-key') ?? null;

  if (idempotencyKey) {
    const existing = await prisma.redemption.findUnique({
      where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } },
      include: { drawLogs: { include: { prize: true }, orderBy: { subIndex: 'asc' } } },
    });
    if (existing) return c.json(replayBody(existing, threshold, tier));
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const totals = await readSystemTotalsForUpdate(tx);

      // Deduct + lifetime increment atomically. P2025 if insufficient.
      const updatedUser = await tx.user.update({
        where: { id: user.id, points: { gte: threshold.points } },
        data: {
          points: { decrement: threshold.points },
          lifetimeDrawCount: { increment: threshold.draws },
          totalBurnAmount: { increment: threshold.points },
        },
      });

      const eligible = await tx.prize.findMany({ where: { enabled: true } });

      const redemption = await tx.redemption.create({
        data: {
          userId: user.id,
          code: generateRedemptionCode(),
          tier,
          totalWinAmount: 0,
          isTest: false,
          idempotencyKey,
        },
      });

      const subDraws: Array<{ chosen: Prize; winningCashAmount: number; gatedBy: GatedBy | null }> = [];
      for (let i = 0; i < threshold.draws; i++) {
        let chosen: Prize;
        const gatedBy = costControlGate(totals.totalDrawCount + i + 1, settings);
        if (gatedBy) {
          chosen = pickLowestCostPrize(eligible, true);
          if (!(await reservePrizeStock(tx, chosen))) {
            chosen = pickLowestCostPrize(eligible);
            if (!(await reservePrizeStock(tx, chosen))) {
              throw new AppError('NO_PRIZE_STOCK', 'lowest-cost prize stock unavailable', 500);
            }
          }
        } else {
          chosen = pickPrize(eligible);
          if (!chosen.isConsolation) {
            if (!(await reservePrizeStock(tx, chosen))) {
              chosen = pickLowestCostPrize(eligible);
              if (!(await reservePrizeStock(tx, chosen))) {
                throw new AppError('NO_PRIZE_STOCK', 'fallback prize stock unavailable', 500);
              }
            }
          }
        }
        const winningCashAmount = chosen.isConsolation ? 0 : chosen.cashAmount;
        subDraws.push({ chosen, winningCashAmount, gatedBy });
      }

      const totalWinAmount = subDraws.reduce((s, d) => s + d.winningCashAmount, 0);
      const hasWeightedWin = subDraws.some((d) => d.winningCashAmount > 0 && d.gatedBy === null);

      const finalUser = totalWinAmount > 0
        ? await tx.user.update({
            where: { id: user.id },
            data: {
              lifetimePayoutAmount: { increment: totalWinAmount },
              totalLuckAmount: { increment: totalWinAmount },
              ...(hasWeightedWin ? { lastWinDrawIndex: updatedUser.lifetimeDrawCount } : {}),
            },
          })
        : updatedUser;

      const drawLogs: Array<{ log: Awaited<ReturnType<typeof tx.drawLog.create>>; chosen: Prize }> = [];
      for (let i = 0; i < subDraws.length; i++) {
        const { chosen, winningCashAmount, gatedBy } = subDraws[i]!;
        const log = await tx.drawLog.create({
          data: {
            userId: user.id,
            redemptionId: redemption.id,
            subIndex: i,
            prizeId: chosen.id,
            tier,
            tierCost: threshold.points,
            tierDraws: threshold.draws,
            pointsBefore: user.points,
            pointsAfter: finalUser.points,
            randomSeed: randomBytes(8).toString('hex'),
            winningCashAmount,
            isTest: false,
            forcedByAdmin: false,
            gatedBy: gatedBy ?? undefined,
          },
        });
        drawLogs.push({ log, chosen });
      }

      const finalRedemption = await tx.redemption.update({
        where: { id: redemption.id },
        data: { totalWinAmount },
      });

      await incrementSystemTotals(tx, {
        drawCount: threshold.draws,
        pointsBurned: threshold.points,
        payoutAmount: totalWinAmount,
      });

      return { redemption: finalRedemption, drawLogs, finalUser };
    }, { timeout: 60_000, maxWait: 30_000 });
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2025') {
      throw new AppError('INSUFFICIENT_POINTS', 'points below tier cost', 422);
    }
    if ((err as { code?: string })?.code === 'P2002' && idempotencyKey) {
      const replay = await prisma.redemption.findUnique({
        where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } },
        include: { drawLogs: { include: { prize: true }, orderBy: { subIndex: 'asc' } } },
      });
      if (replay) return c.json(replayBody(replay, threshold, tier));
    }
    throw err;
  }

  return c.json(buildResponse({
    redemption: result.redemption,
    drawLogs: result.drawLogs,
    finalUserPoints: result.finalUser.points,
    tier,
    tierDraws: threshold.draws,
    isTest: false,
  }));
}

async function handleTestDraw(c: Context, user: User, tier: Tier, threshold: { points: number; draws: number }) {

  const idempotencyKey = c.req.header('idempotency-key') ?? null;

  if (idempotencyKey) {
    const existing = await prisma.redemption.findUnique({
      where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } },
      include: { drawLogs: { include: { prize: true }, orderBy: { subIndex: 'asc' } } },
    });
    if (existing) return c.json(replayBody(existing, threshold, tier));
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      let finalUser: User = user;
      if (!user.testSkipCost) {
        finalUser = await tx.user.update({
          where: { id: user.id, points: { gte: threshold.points } },
          data: { points: { decrement: threshold.points } },
        });
      }

      // Prize selection inside tx so a concurrent admin disable can't poison
      // the read. Test draws DO NOT decrement stock (documented decision: test
      // sessions must not deplete real prize stock).
      const eligible = await tx.prize.findMany({ where: { enabled: true } });

      const redemption = await tx.redemption.create({
        data: {
          userId: user.id,
          code: generateRedemptionCode(),
          tier,
          totalWinAmount: 0,
          isTest: true,
          idempotencyKey,
        },
      });

      const forcedIds = testForcePrizePool(user);
      const forcedByAdmin = forcedIds.length > 0;
      const forcedPrizeById = new Map(eligible.map((p) => [p.id, p]));
      const forcedPool: Prize[] = [];
      for (const id of forcedIds) {
        const forcedPrize = forcedPrizeById.get(id);
        if (!forcedPrize) {
          throw new AppError('FORCE_PRIZE_NOT_FOUND', 'test override prize missing', 422);
        }
        forcedPool.push(forcedPrize);
      }

      const subDraws: Array<{ chosen: Prize; winningCashAmount: number }> = [];
      for (let i = 0; i < threshold.draws; i++) {
        let chosen: Prize;
        if (forcedByAdmin) {
          chosen = pickForcedTestPrize(forcedPool, (user as User & { testForcePrizeMode?: string }).testForcePrizeMode ?? 'random', i);
        } else {
          chosen = pickPrize(eligible);
        }
        const winningCashAmount = chosen.isConsolation ? 0 : chosen.cashAmount;
        subDraws.push({ chosen, winningCashAmount });
      }

      const totalWinAmount = subDraws.reduce((s, d) => s + d.winningCashAmount, 0);

      const drawLogs: Array<{ log: Awaited<ReturnType<typeof tx.drawLog.create>>; chosen: Prize }> = [];
      for (let i = 0; i < subDraws.length; i++) {
        const { chosen, winningCashAmount } = subDraws[i]!;
        const log = await tx.drawLog.create({
          data: {
            userId: user.id,
            redemptionId: redemption.id,
            subIndex: i,
            prizeId: chosen.id,
            tier,
            tierCost: threshold.points,
            tierDraws: threshold.draws,
            pointsBefore: user.points,
            pointsAfter: finalUser.points,
            randomSeed: randomBytes(8).toString('hex'),
            winningCashAmount,
            isTest: true,
            forcedByAdmin,
          },
        });
        drawLogs.push({ log, chosen });
      }

      const finalRedemption = await tx.redemption.update({
        where: { id: redemption.id },
        data: { totalWinAmount },
      });

      // Test draws DON'T update system totals or user lifetime/ranking counters.
      return { redemption: finalRedemption, drawLogs, finalUser };
    }, { timeout: 60_000, maxWait: 30_000 });
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2025') {
      throw new AppError('INSUFFICIENT_POINTS', 'points below tier cost', 422);
    }
    if ((err as { code?: string })?.code === 'P2002' && idempotencyKey) {
      const replay = await prisma.redemption.findUnique({
        where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } },
        include: { drawLogs: { include: { prize: true }, orderBy: { subIndex: 'asc' } } },
      });
      if (replay) return c.json(replayBody(replay, threshold, tier));
    }
    throw err;
  }

  return c.json(buildResponse({
    redemption: result.redemption,
    drawLogs: result.drawLogs,
    finalUserPoints: result.finalUser.points,
    tier,
    tierDraws: threshold.draws,
    isTest: true,
  }));
}

export { buildResponse };
