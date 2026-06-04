import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import type { Prize, User } from '@prisma/client';
import { AppError } from '../errors.js';
import { requireUser } from '../auth/middleware.js';
import { prisma } from '../db.js';
import { writeAdminActionLog } from '../audit/log.js';
import { resolveThreshold, type Tier } from '../draw/tier.js';
import {
  readDrawSettings,
  readSystemTotalsForUpdate,
  incrementSystemTotals,
  type DrawSettings,
} from '../draw/settings.js';
import { evaluateGates } from '../draw/gates.js';
import { pickPrize } from '../draw/pick.js';
import { generateRedemptionCode } from '../draw/redemption-code.js';

const BodySchema = z.object({ tier: z.union([z.literal('single'), z.literal('multi')]) });

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

  // Body parse
  let body: { tier: Tier };
  try { body = BodySchema.parse(await c.req.json()); }
  catch { throw new AppError('TIER_INVALID', 'tier must be "single" or "multi"', 400); }

  if (user.accountType === 'test') {
    return handleTestDraw(c, user, body.tier);  // implemented in Task 22
  }

  return handleVerifiedDraw(c, user, body.tier);
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

async function handleVerifiedDraw(c: Context, user: User, tier: Tier) {
  const settings = await readDrawSettings();
  const threshold = resolveThreshold(tier, settings.pointThresholds);

  // NOTE: no pre-tx precheck on user.points. The middleware-loaded user is
  // potentially stale; the `WHERE points: { gte: cost }` inside the tx is
  // authoritative. P2025 → 422 below.

  // Idempotency on Redemption (NOT DrawLog — multi has 10 children with same key).
  const idempotencyKey = c.req.header('idempotency-key') ?? null;

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

      const gated = evaluateGates(
        { lifetimeDrawCount: updatedUser.lifetimeDrawCount, lastWinDrawIndex: updatedUser.lastWinDrawIndex },
        totals,
        settings,
      );

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

      const subDraws: Array<{ chosen: Prize; winningCashAmount: number }> = [];
      for (let i = 0; i < threshold.draws; i++) {
        let chosen: Prize;
        if (gated) {
          chosen = (eligible.find((p) => p.id === settings.consolationPrizeId)
                ?? eligible.find((p) => p.isConsolation)) as Prize | undefined
                ?? (() => { throw new AppError('NO_CONSOLATION_PRIZE', 'consolation prize missing', 500); })();
        } else {
          chosen = pickPrize(eligible);
          if (!chosen.isConsolation) {
            const stockUpdate = await tx.prize.updateMany({
              where: { id: chosen.id, stock: { gt: 0 } },
              data: { stock: { decrement: 1 } },
            });
            if (stockUpdate.count === 0) {
              chosen = (eligible.find((p) => p.id === settings.consolationPrizeId)
                    ?? eligible.find((p) => p.isConsolation)) as Prize | undefined
                    ?? (() => { throw new AppError('NO_CONSOLATION_PRIZE', 'consolation prize missing', 500); })();
            }
          }
        }
        const winningCashAmount = chosen.isConsolation ? 0 : chosen.cashAmount;
        subDraws.push({ chosen, winningCashAmount });
      }

      const totalWinAmount = subDraws.reduce((s, d) => s + d.winningCashAmount, 0);

      const finalUser = (!gated && totalWinAmount > 0)
        ? await tx.user.update({
            where: { id: user.id },
            data: {
              lifetimePayoutAmount: { increment: totalWinAmount },
              totalLuckAmount: { increment: totalWinAmount },
              lastWinDrawIndex: updatedUser.lifetimeDrawCount,
            },
          })
        : updatedUser;

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
            isTest: false,
            forcedByAdmin: false,
            gatedBy: gated ?? undefined,
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
    }, { timeout: 30_000, maxWait: 10_000 });
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2025') {
      throw new AppError('INSUFFICIENT_POINTS', 'points below tier cost', 422);
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

async function handleTestDraw(_c: Context, _user: User, _tier: Tier): Promise<Response> {
  throw new AppError('NOT_IMPLEMENTED', 'test branch lands in Task 22', 500);
}

export { buildResponse };
