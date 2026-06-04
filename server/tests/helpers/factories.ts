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

export async function seedDefaultSettings(over: Record<string, string> = {}) {
  for (const [key, value] of Object.entries({ ...DEFAULT_SETTINGS, ...over })) {
    await prisma.appSetting.upsert({
      where: { key }, create: { key, value }, update: { value },
    });
  }
}

export { SETTINGS_KEYS };
