import { prisma } from '../src/db.js';

/**
 * One-off cleanup script: wipe Prize rows + re-run the default seed.
 * Useful when a production DB has test leftovers but admins haven't
 * configured real prizes yet. SAFE to re-run; idempotent after the
 * first successful pass.
 *
 * Run via: railway run npx tsx scripts/reseed-prizes.ts
 *   (or locally with DATABASE_URL pointing at the target DB)
 *
 * What it does:
 *   1. Clear consolationPrizeId in app_settings (FK reference)
 *   2. Detach DrawLog.prizeId? -> no: this only deletes Prizes if NO DrawLogs
 *      reference them. If they do, we abort with a clear error.
 *   3. Delete all Prize rows
 *   4. Re-run the default seed
 */

const PRIZES = [
  { rankLabel: '頭獎', name: '最高彩金', cashAmount: 10000, weight: 2,                       segmentColor: '#d92b3a', textColor: '#fff5d6', wheelPosition: 0 },
  { rankLabel: '二獎', name: '彩金',     cashAmount: 5000,  weight: 6,                       segmentColor: '#ec8a26', textColor: '#fff5d6', wheelPosition: 1 },
  { rankLabel: '三獎', name: '彩金',     cashAmount: 1000,  weight: 14,                      segmentColor: '#c98612', textColor: '#fff5d6', wheelPosition: 2 },
  { rankLabel: '四獎', name: '彩金',     cashAmount: 500,   weight: 22,                      segmentColor: '#38a86e', textColor: '#fff5d6', wheelPosition: 3 },
  { rankLabel: '五獎', name: '彩金',     cashAmount: 100,   weight: 26,                      segmentColor: '#2e7cd9', textColor: '#fff5d6', wheelPosition: 4 },
  { rankLabel: '六獎', name: '謝謝參加', cashAmount: 0,     weight: 30, isConsolation: true, segmentColor: '#9b3eb8', textColor: '#fff5d6', wheelPosition: 5 },
];

async function main() {
  const existingPrizes = await prisma.prize.findMany({ select: { id: true } });
  if (existingPrizes.length === 0) {
    console.log('no existing prizes, going straight to seed');
  } else {
    const drawLogCount = await prisma.drawLog.count({ where: { prizeId: { in: existingPrizes.map((p) => p.id) } } });
    if (drawLogCount > 0) {
      console.error(`ABORT: ${drawLogCount} draw_log rows reference existing prizes — refusing to delete.`);
      console.error('Manually clear draw logs first or migrate them before re-seeding.');
      process.exit(2);
    }
    console.log(`deleting ${existingPrizes.length} existing prize row(s)…`);
    // Clear FK reference in app_settings before deletion
    await prisma.appSetting.updateMany({
      where: { key: 'consolationPrizeId' },
      data: { value: '' },
    });
    await prisma.prize.deleteMany({});
  }

  console.log('creating default prizes…');
  for (const p of PRIZES) {
    await prisma.prize.create({ data: { ...p, stock: 9999, enabled: true } });
  }
  const consolation = await prisma.prize.findFirst({ where: { isConsolation: true } });
  if (consolation) {
    await prisma.appSetting.update({
      where: { key: 'consolationPrizeId' },
      data: { value: consolation.id },
    });
    console.log(`consolationPrizeId set to ${consolation.id}`);
  }

  const total = await prisma.prize.count();
  console.log(`reseed done. Total prizes now: ${total}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
