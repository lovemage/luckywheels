import type { PrismaClient } from '@prisma/client';
import { CollectorError, GOLDEN_SETH, runRound } from './atg/browser.js';
import { ensureGame, pickDetailTargets, pruneSnapshots, saveRound, SNAPSHOT_RETENTION_HOURS } from './atg/store.js';
import { loadCredentials, readCollectorSettings } from './settings.js';

// 一輪採集：建立 CollectorRun → 瀏覽器採集 → 單一 transaction 寫入 → 清理舊快照。
// 失敗時 CollectorRun 標為 failed 並記錄錯誤代碼（不含帳號密碼）。

// 一輪的細項階段最多 DETAIL_BUDGET_CAP_MS（再加上登入、列表與寫入約 1 分鐘），所以超過
// RUNNING_STALE_MS 仍是 running 的，必定是程序被中止（例如部署時 SIGKILL）。
// railway.collector.json 的 drainingSeconds 要大於一輪的最長時間。
const DETAIL_BUDGET_CAP_MS = 8 * 60_000;
const RUNNING_STALE_MS = 20 * 60_000;

export type CollectOutcome =
  | { status: 'succeeded'; runId: string; rooms: number; details: number; durationMs: number }
  | { status: 'failed'; runId: string; errorCode: string; errorMessage: string }
  | { status: 'skipped'; reason: string };

export async function collectOnce(
  prisma: PrismaClient,
  opts: { headed?: boolean; log?: (msg: string) => void } = {},
): Promise<CollectOutcome> {
  const log = opts.log ?? (() => {});
  const settings = await readCollectorSettings(prisma);
  const game = await ensureGame(prisma, {
    providerCode: 'atg',
    providerName: 'ATG',
    code: GOLDEN_SETH.code,
    name: GOLDEN_SETH.name,
  });

  // 「檢查有無進行中的一輪 → 建立新的一輪」用 transaction 層級 advisory lock 串列化，
  // 避免常駐程式與手動執行（或多個 replica）同時通過檢查。上一輪中斷（程序被殺）超過 RUNNING_STALE_MS 的 running 紀錄標為失敗。
  const claim = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('atg-collector'), hashtext(${game.id}))`;
    await tx.collectorRun.updateMany({
      where: { gameId: game.id, status: 'running', startedAt: { lt: new Date(Date.now() - RUNNING_STALE_MS) } },
      data: { status: 'failed', finishedAt: new Date(), errorCode: 'INTERRUPTED', errorMessage: '程序中斷，未完成' },
    });
    const active = await tx.collectorRun.findFirst({ where: { gameId: game.id, status: 'running' } });
    if (active) return { active };
    return { run: await tx.collectorRun.create({ data: { gameId: game.id } }) };
  });
  if ('active' in claim) return { status: 'skipped', reason: `另一輪採集進行中（${claim.active?.id}）` };
  const run = claim.run;
  const started = Date.now();
  let accountId: string | null = null;
  try {
    const creds = await loadCredentials(prisma);
    if (!creds) throw new CollectorError('LOGIN_FAILED', '沒有可用的採集帳號（後台未設定，環境變數也沒有）');
    accountId = creds.accountId;

    // 細項批次要在讀完列表後才決定（新機台也要排進去），所以在 detailTargets 回呼內查 DB
    let targets: string[] = [];
    const result = await runRound(creds, GOLDEN_SETH, {
      headed: opts.headed,
      detailTargets: async (rooms) => {
        targets = await pickDetailTargets(prisma, game.id, rooms, settings.detailBatchSize);
        return targets;
      },
      // 細項階段最多用掉採集間隔的 80%，避免拖到下一輪
      detailBudgetMs: Math.min(settings.intervalMinutes * 60_000 * 0.8, DETAIL_BUDGET_CAP_MS),
      log,
    });
    log(`列表 ${result.rooms.length} 台、細項 ${result.details.length}/${targets.length} 台，寫入 DB`);

    await saveRound(prisma, {
      runId: run.id,
      gameId: game.id,
      capturedAt: result.capturedAt,
      rooms: result.rooms,
      details: result.details,
      durationMs: Date.now() - started,
    });
    // saveRound 已把本輪標為 succeeded；以下收尾失敗只記 log，不可再把本輪改成 failed
    if (accountId) {
      await prisma.collectorAccount
        .update({ where: { id: accountId }, data: { lastUsedAt: new Date(), lastError: null } })
        .catch((e) => log(`更新採集帳號使用時間失敗：${e instanceof Error ? e.message : String(e)}`));
    }
    await pruneSnapshots(prisma)
      .then((pruned) => pruned && log(`清除超過 ${SNAPSHOT_RETENTION_HOURS} 小時的快照 ${pruned} 筆`))
      .catch((e) => log(`清除舊快照失敗（下一輪重試）：${e instanceof Error ? e.message : String(e)}`));
    return { status: 'succeeded', runId: run.id, rooms: result.rooms.length, details: result.details.length, durationMs: Date.now() - started };
  } catch (err) {
    const errorCode = err instanceof CollectorError ? err.code : 'UNKNOWN';
    const errorMessage = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    await prisma.collectorRun.update({
      where: { id: run.id },
      data: { status: 'failed', finishedAt: new Date(), durationMs: Date.now() - started, errorCode, errorMessage },
    });
    if (accountId) {
      await prisma.collectorAccount
        .update({ where: { id: accountId }, data: { lastErrorAt: new Date(), lastError: `${errorCode}: ${errorMessage}`.slice(0, 500) } })
        .catch(() => {});
    }
    return { status: 'failed', runId: run.id, errorCode, errorMessage };
  }
}
