import { prisma } from '../src/db.js';

export const SETTINGS_KEYS = {
  pointThresholds: 'pointThresholds',
  spinDurationMs: 'spinDurationMs',
  minDrawsBeforeWin: 'minDrawsBeforeWin',
  cooldownDrawsAfterWin: 'cooldownDrawsAfterWin',
  payoutCapEnabled: 'payoutCapEnabled',
  payoutCapRatio: 'payoutCapRatio',
  rulesText: 'rulesText',
  consolationPrizeId: 'consolationPrizeId',
  // System totals — maintained atomically inside the draw transaction
  // (replaces SUM(User) aggregation; addresses Codex finding B1/D1).
  totalDrawCount: 'totalDrawCount',
  totalPayoutAmount: 'totalPayoutAmount',
  totalPointsBurned: 'totalPointsBurned',
} as const;

export const DEFAULT_THRESHOLDS = [
  { points: 6, draws: 1 },
  { points: 15, draws: 3 },
  { points: 25, draws: 5 },
  { points: 35, draws: 7 },
  { points: 48, draws: 10 },
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  [SETTINGS_KEYS.pointThresholds]: JSON.stringify(DEFAULT_THRESHOLDS),
  [SETTINGS_KEYS.spinDurationMs]: '4300',
  [SETTINGS_KEYS.minDrawsBeforeWin]: '0',
  [SETTINGS_KEYS.cooldownDrawsAfterWin]: '0',
  [SETTINGS_KEYS.payoutCapEnabled]: 'false',
  [SETTINGS_KEYS.payoutCapRatio]: '0.45',
  [SETTINGS_KEYS.rulesText]: [
    '單抽消耗 6 積分、連抽消耗 48 積分，結果由伺服器判定。',
    '中獎時會產生 Redemption 隨機碼，將碼截圖傳給管理員兌換彩金。',
    '積分由管理員後台派發，會員不可自行修改。',
  ].join('\n'),
  [SETTINGS_KEYS.consolationPrizeId]: '',
  [SETTINGS_KEYS.totalDrawCount]: '0',
  [SETTINGS_KEYS.totalPayoutAmount]: '0',
  [SETTINGS_KEYS.totalPointsBurned]: '0',
};

const PRIZES = [
  { rankLabel: '頭獎', name: '最高彩金', cashAmount: 10000, weight: 2,                    segmentColor: '#d92b3a', wheelPosition: 0 },
  { rankLabel: '二獎', name: '彩金',     cashAmount: 5000,  weight: 6,                    segmentColor: '#ec8a26', wheelPosition: 1 },
  { rankLabel: '三獎', name: '彩金',     cashAmount: 1000,  weight: 14,                   segmentColor: '#c98612', wheelPosition: 2 },
  { rankLabel: '四獎', name: '彩金',     cashAmount: 500,   weight: 22,                   segmentColor: '#38a86e', wheelPosition: 3 },
  { rankLabel: '五獎', name: '彩金',     cashAmount: 100,   weight: 26,                   segmentColor: '#2e7cd9', wheelPosition: 4 },
  { rankLabel: '六獎', name: '謝謝參加', cashAmount: 0,     weight: 30, isConsolation: true, segmentColor: '#9b3eb8', wheelPosition: 5 },
];

async function main() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: {} });
  }
  if ((await prisma.prize.count()) === 0) {
    for (const p of PRIZES) await prisma.prize.create({ data: { ...p, stock: 9999 } });
    const consolation = await prisma.prize.findFirst({ where: { isConsolation: true } });
    if (consolation) {
      await prisma.appSetting.update({
        where: { key: SETTINGS_KEYS.consolationPrizeId },
        data: { value: consolation.id },
      });
    }
  } else {
    // Re-enable any prize that was disabled (e.g. by integration tests that
    // exercise the enabled=false path). Doesn't touch other fields so admin
    // edits to weight / stock / cashAmount survive.
    await prisma.prize.updateMany({ where: { enabled: false }, data: { enabled: true } });
  }
  console.log('seed done');
}

if (process.argv[1]?.endsWith('seed.ts')) {
  main().finally(() => prisma.$disconnect());
}
