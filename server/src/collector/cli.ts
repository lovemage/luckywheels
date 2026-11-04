// 手動跑一輪 ATG 採集，結果寫成 JSON（還不寫 DB）。用來驗證流程與量測細項耗時。
//
//   npm run collector:once -- [--headed] [--detail 20] [--out path.json]
//
// 帳號讀環境變數 ATG_COLLECTOR_CASINO_URL / ATG_COLLECTOR_ACCOUNT / ATG_COLLECTOR_PASSWORD。

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { GOLDEN_SETH, runRound } from './atg/browser.js';
import { pageOfRoomNo } from './atg/parse.js';

const { values } = parseArgs({
  options: {
    headed: { type: 'boolean', default: false },
    detail: { type: 'string', default: '20' },
    out: { type: 'string' },
  },
});

const strip = (v: string | undefined) => v?.trim().replace(/^['"]|['"]$/g, '');
const casinoUrl = strip(process.env.ATG_COLLECTOR_CASINO_URL);
const account = strip(process.env.ATG_COLLECTOR_ACCOUNT);
const password = strip(process.env.ATG_COLLECTOR_PASSWORD);
if (!casinoUrl || !account || !password) {
  console.error('缺少 ATG_COLLECTOR_CASINO_URL / ATG_COLLECTOR_ACCOUNT / ATG_COLLECTOR_PASSWORD');
  process.exit(1);
}

const detailCount = Number(values.detail);
if (!Number.isInteger(detailCount) || detailCount < 0) {
  console.error('--detail 必須是 0 以上的整數');
  process.exit(1);
}
const started = Date.now();
const result = await runRound({ casinoUrl, account, password }, GOLDEN_SETH, {
  headed: values.headed,
  // 測試用：從列表讀完時停留的最後一頁往前抓 N 台（含切頁，用來量測實際耗時）
  detailTargets: (rooms) =>
    [...rooms].sort((a, b) => pageOfRoomNo(b.roomNo) - pageOfRoomNo(a.roomNo)).slice(0, detailCount).map((r) => r.roomNo),
  log: (msg) => console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s] ${msg}`),
});

const out = values.out ?? join('..', '.atg-capture', `round-${result.capturedAt.toISOString().replace(/[:.]/g, '-')}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2));

const byStatus = result.rooms.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
console.log(`機台 ${result.rooms.length}（略過 ${result.skippedListItems.length}）`, byStatus);
console.log(`細項 ${result.details.length} 成功、${result.detailFailures.length} 失敗`);
console.log('耗時', result.timings, '點擊方式', result.pressMethods);
console.log(`輸出：${out}`);
