import type { PrismaClient } from '@prisma/client';

// 待命模式（備援）：COLLECTOR_STANDBY_MINUTES 設為正整數時，這個 collector 平常不採集，
// 只定期檢查 DB 最近一次成功採集的時間；超過該分鐘數都沒有任何 collector 成功，才自己接手跑一輪。
// 用途：主要 collector 跑在別的機器上（例如本機），Railway 上的這份只在主要的停擺時接手。

/** 待命時多久檢查一次 DB */
export const STANDBY_POLL_MS = 5 * 60_000;

/** 未設定、0、負數或格式錯誤 → 0（不待命，照一般模式採集） */
export function parseStandbyMinutes(raw: string | undefined): number {
  const n = Number(raw?.trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export interface LastSuccess {
  runId: string;
  at: Date;
}

/**
 * 是否繼續待命：最近一次成功採集在 standbyMinutes 內，而且不是自己跑的（ownRunIds）。
 * 接手後最新的成功是自己的，就繼續照間隔採集；等主要 collector 恢復、出現別人的成功紀錄，才退回待命。
 */
export function shouldStandBy(last: LastSuccess | null, ownRunIds: ReadonlySet<string>, standbyMinutes: number, now: Date): boolean {
  if (!last || ownRunIds.has(last.runId)) return false;
  return now.getTime() - last.at.getTime() < standbyMinutes * 60_000;
}

/** 任何 collector（不分機器）最近一次成功的採集 */
export async function lastSuccess(prisma: PrismaClient): Promise<LastSuccess | null> {
  const run = await prisma.collectorRun.findFirst({
    where: { status: 'succeeded' },
    orderBy: { startedAt: 'desc' },
    select: { id: true, startedAt: true, finishedAt: true },
  });
  return run ? { runId: run.id, at: run.finishedAt ?? run.startedAt } : null;
}
