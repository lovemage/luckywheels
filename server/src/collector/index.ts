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
import { lastSuccess, parseStandbyMinutes, shouldStandBy, STANDBY_POLL_MS } from './standby.js';

const { values } = parseArgs({
  options: {
    once: { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
  },
});

const MAX_CONSECUTIVE_FAILURES = 4;
/** 連續失敗達上限後先停 30 分鐘再結束程序（讓 Railway 重啟），之後新容器再試 4 輪，依此循環 */
const RESTART_DELAY_MS = 30 * 60_000;

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
  let consecutiveFailures = 0;
  const standbyMinutes = parseStandbyMinutes(process.env.COLLECTOR_STANDBY_MINUTES);
  let standing = false;
  const ownRunIds = new Set<string>();
  if (standbyMinutes) log(`備援模式：最近 ${standbyMinutes} 分鐘內沒有其他 collector 成功採集才接手`);
  while (!stopping) {
    if (standbyMinutes) {
      // DB 查不到（連線失敗）時當成主要的停擺，照常接手；這一輪若同樣連不上 DB 會記為失敗
      const last = await lastSuccess(prisma).catch(() => null);
      if (shouldStandBy(last, ownRunIds, standbyMinutes, new Date())) {
        if (!standing) log(`待命中：其他 collector 最近一次成功 ${last?.at.toISOString()}`);
        standing = true;
        ownRunIds.clear();
        consecutiveFailures = 0;
        await sleep(STANDBY_POLL_MS);
        continue;
      }
      if (standing || ownRunIds.size === 0) {
        log(`超過 ${standbyMinutes} 分鐘沒有其他 collector 成功採集（最近 ${last?.at.toISOString() ?? '無'}），接手採集`);
      }
      standing = false;
    }
    const started = Date.now();
    const outcome = await runOnce().catch((err) => {
      log(`未預期錯誤：${err instanceof Error ? err.message : String(err)}`);
      return null;
    });
    // 連續失敗達上限就結束程序（exit code 1），交給 Railway 重啟容器：
    // 2026-11-10 多輪逾時後 Chromium 在容器內連啟動都失敗，只有重啟容器才會恢復。「略過」不算成功也不算失敗。
    if (outcome?.status === 'succeeded') {
      consecutiveFailures = 0;
      ownRunIds.add(outcome.runId);
    } else if (outcome === null || outcome.status === 'failed') consecutiveFailures++;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      log(`連續 ${consecutiveFailures} 輪採集失敗，停止重試，${RESTART_DELAY_MS / 60_000} 分鐘後結束程序由 Railway 重啟`);
      await sleep(RESTART_DELAY_MS); // 收到 SIGTERM 會提早喚醒
      if (stopping) break; // 部署或手動停止：正常結束，不當成失敗
      process.exitCode = 1;
      break;
    }
    if (stopping) break;
    // 間隔以「開始到開始」計算；本輪超時則至少休息 30 秒
    const { intervalMinutes } = await readCollectorSettings(prisma).catch(() => ({ intervalMinutes: 10 }));
    await sleep(Math.max(30_000, intervalMinutes * 60_000 - (Date.now() - started)));
  }
}

await prisma.$disconnect();
// 逾時中止的那一輪可能還留著瀏覽器或計時器，明確結束，確保 Railway 看得到程序已退出
if (process.exitCode === 1) process.exit(1);
