import type { AccountType } from '@prisma/client';
import { prisma } from '../../src/db.js';
import { DEFAULT_SETTINGS, SETTINGS_KEYS } from '../../prisma/seed.js';

let u = 0, p = 0;

export async function createUser(o: Partial<{
  lineUserId: string;
  displayName: string;
  points: number;
  accountType: AccountType;
  testSkipCost: boolean;
  testForcePrizeId: string | null;
  lifetimeDrawCount: number;
  lastWinDrawIndex: number | null;
  totalBurnAmount: number;
  totalLuckAmount: number;
  nickname: string | null;                  // Rev 3: pass null to opt out of the onboarding gate (default: pre-onboarded)
  entertainmentMemberCode: string | null;   // Rev 3: same — pass null to test the onboarding gate
}> = {}) {
  u += 1;
  // Factory default: users are pre-onboarded (both nickname AND code set) so existing
  // draw tests don't have to call the onboarding endpoint. Tests of the onboarding
  // gate explicitly pass `nickname: null` or `entertainmentMemberCode: null` to opt out.
  const defaultNickname = `小測${u}`;
  const defaultCode = `EM_${u.toString().padStart(8, '0')}`;
  const codeValue = o.entertainmentMemberCode === undefined ? defaultCode : o.entertainmentMemberCode;
  const nicknameValue = o.nickname === undefined ? defaultNickname : o.nickname;
  return prisma.user.create({
    data: {
      lineUserId: o.lineUserId ?? `U_test_${u}`,
      displayName: o.displayName ?? `Tester ${u}`,
      nickname: nicknameValue,
      points: o.points ?? 100,
      accountType: o.accountType ?? 'verified',
      testSkipCost: o.testSkipCost ?? false,
      testForcePrizeId: o.testForcePrizeId ?? null,
      lifetimeDrawCount: o.lifetimeDrawCount ?? 0,
      lastWinDrawIndex: o.lastWinDrawIndex ?? null,
      totalBurnAmount: o.totalBurnAmount ?? 0,
      totalLuckAmount: o.totalLuckAmount ?? 0,
      entertainmentMemberCode: codeValue,
      entertainmentCodeBoundAt: codeValue === null ? null : new Date(),
    },
  });
}

export async function createPrize(o: Partial<{
  rankLabel: string;
  cashAmount: number;
  weight: number;
  isConsolation: boolean;
  enabled: boolean;
  stock: number;
}> = {}) {
  p += 1;
  return prisma.prize.create({
    data: {
      rankLabel: o.rankLabel ?? `prize-${p}`,
      name: 'test prize',
      stock: o.stock ?? 100,
      weight: o.weight ?? 10,
      cashAmount: o.cashAmount ?? 100,
      isConsolation: o.isConsolation ?? false,
      enabled: o.enabled ?? true,
    },
  });
}

let rdm = 0;
export async function createRedemption(o: Partial<{
  userId: string;
  code: string;
  tier: 'single' | 'multi';
  status: 'pending' | 'delivered' | 'cancelled';
  isTest: boolean;
  totalWinAmount: number;
}> = {}) {
  rdm += 1;
  return prisma.redemption.create({
    data: {
      userId: o.userId!,
      code: o.code ?? `TST${rdm.toString().padStart(4, '0')}-XXXX-XXXX`,
      tier: o.tier ?? 'single',
      status: o.status ?? 'pending',
      isTest: o.isTest ?? false,
      totalWinAmount: o.totalWinAmount ?? 0,
    },
  });
}

let dlg = 0;
export async function createDrawLog(o: Partial<{
  userId: string;
  redemptionId: string;
  prizeId: string;
  subIndex: number;
  tier: 'single' | 'multi';
  winningCashAmount: number;
}> = {}) {
  dlg += 1;
  return prisma.drawLog.create({
    data: {
      userId: o.userId!,
      redemptionId: o.redemptionId!,
      prizeId: o.prizeId!,
      subIndex: o.subIndex ?? 0,
      tier: o.tier ?? 'single',
      tierCost: o.tier === 'multi' ? 48 : 6,
      tierDraws: o.tier === 'multi' ? 10 : 1,
      pointsBefore: 100,
      pointsAfter: 94,
      randomSeed: `seed-${dlg}`,
      winningCashAmount: o.winningCashAmount ?? 0,
    },
  });
}

export async function seedDefaultSettings(over: Record<string, string> = {}) {
  for (const [key, value] of Object.entries({ ...DEFAULT_SETTINGS, ...over })) {
    await prisma.appSetting.upsert({
      where: { key }, create: { key, value }, update: { value },
    });
  }
}

export { SETTINGS_KEYS };
