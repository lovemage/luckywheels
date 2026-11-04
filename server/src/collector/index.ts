// atg-collector 常駐程式：依後台設定的間隔（AppSetting.atgCollectIntervalMinutes）反覆採集。
//
//   npm run collector:dev            # 本機，跑一輪就結束（--once）
//   node dist/src/collector/index.js # 部署（Railway atg-collector 服務）
//
// 需要：DATABASE_URL（只連 luckyds.com 的 DB）、DATA_ASSISTANT_ENABLED=true、
// COLLECTOR_CREDENTIALS_KEY（使用後台帳號時）。旗標未開啟時不採集，只待命。

import { parseArgs } from 'node:util';
import { prisma } from '../db.js';
import { collectOnce } from './collect.js';
import { readCollectorSettings } from './settings.js';
import { dataAssistantEnabled } from '../assistant/feature.js';

const { values } = parseArgs({
  options: {
    once: { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
  },
});

const log = (msg: string) => console.log(`[collector ${new Date().toISOString()}] ${msg}`);

let stopping = false;
let wake: (() => void) | null = null;
const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    wake = () => {
      clearTimeout(timer);
      resolve();
    };
  });

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    log(`收到 ${sig}，本輪結束後停止`);
    stopping = true;
    wake?.();
  });
}

async function runOnce() {
  const outcome = await collectOnce(prisma, { headed: values.headed, log });
  if (outcome.status === 'succeeded') {
    log(`完成：${outcome.rooms} 台、細項 ${outcome.details} 台、${Math.round(outcome.durationMs / 1000)} 秒（run ${outcome.runId}）`);
  } else if (outcome.status === 'failed') {
    log(`失敗：${outcome.errorCode} ${outcome.errorMessage}（run ${outcome.runId}）`);
  } else {
    log(`略過：${outcome.reason}`);
  }
  return outcome;
}

if (!dataAssistantEnabled()) {
  log('DATA_ASSISTANT_ENABLED 未開啟，不採集');
  if (!values.once) while (!stopping) await sleep(60 * 60_000);
} else if (values.once) {
  const outcome = await runOnce();
  process.exitCode = outcome.status === 'failed' ? 1 : 0;
} else {
  while (!stopping) {
    const started = Date.now();
    await runOnce().catch((err) => log(`未預期錯誤：${err instanceof Error ? err.message : String(err)}`));
    if (stopping) break;
    // 間隔以「開始到開始」計算；本輪超時則至少休息 30 秒
    const { intervalMinutes } = await readCollectorSettings(prisma).catch(() => ({ intervalMinutes: 10 }));
    await sleep(Math.max(30_000, intervalMinutes * 60_000 - (Date.now() - started)));
  }
}

await prisma.$disconnect();
