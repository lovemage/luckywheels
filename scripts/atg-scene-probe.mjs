// ATG 探測：確認能否從遊戲的 Cocos 場景樹讀到「選擇機台」上的數字（機台號、RTP、未開轉數…）。
// 不解密任何資料，只讀遊戲自己顯示在畫面上的文字；也不自動點擊，操作全由使用者進行。
//
//   node scripts/atg-scene-probe.mjs
//
// 瀏覽器開啟後：登入 → 電子 → ATG電子 → 金額留空「轉點進入」→ 戰神賽特 II「開始遊戲」→「開始遊戲」→ 選擇機台
// 在終端機按 Enter 擷取一次（可多次：換分頁、點選機台後各擷取一次），輸入 q 再按 Enter 結束。
//
// 輸出到 .atg-capture/<時間>/（已 gitignore）：
//   scene-N.json  場景樹中所有有文字的節點（路徑、文字、是否顯示）
//   scene-N.png   同一時間的畫面截圖，用來對照
//   events.jsonl  socket.io 事件（伺服器推送的明文事件、客戶端送出的事件名稱；token 已遮蔽，二進位只記大小）

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

const START_URL = 'https://www.ds8899.net/sty4_home.php';
const GAME_HOST = /godeebxp\.com/;

const outDir = join('.atg-capture', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(outDir, { recursive: true });
const eventsFile = join(outDir, 'events.jsonl');

const redactToken = (text) => text.replace(/("token"\s*:\s*")[^"]*/g, '$1<redacted>');

function logFrame(dir, payload) {
  const entry = { ts: Date.now(), dir };
  if (typeof payload === 'string') {
    // Engine.IO 心跳（2／3）不記
    if (payload === '2' || payload === '3') return;
    entry.text = redactToken(payload).slice(0, 4000);
  } else {
    entry.binaryBytes = payload.length;
  }
  appendFileSync(eventsFile, JSON.stringify(entry) + '\n');
}

function watchPage(page) {
  page.on('websocket', (ws) => {
    if (!GAME_HOST.test(ws.url())) return;
    console.log('[ws] 遊戲連線已建立');
    ws.on('framesent', (f) => logFrame('sent', f.payload));
    ws.on('framereceived', (f) => logFrame('recv', f.payload));
  });
}

// 在遊戲頁面內執行：走訪 Cocos 場景樹，收集所有帶文字的元件（cc.Label、cc.RichText 等）。
// 同時相容 Cocos Creator 2.x（node._components）與 3.x（node.components）。
function dumpScene() {
  const cc = globalThis.cc;
  if (!cc || !cc.director || !cc.director.getScene) return { cc: false };
  const labels = [];
  const walk = (node, path, depth) => {
    if (!node || depth > 80) return;
    const here = path ? `${path}/${node.name}` : node.name;
    for (const comp of node._components || node.components || []) {
      if (comp && typeof comp.string === 'string' && comp.string.trim() !== '') {
        labels.push({
          path: here,
          text: comp.string,
          comp: comp.__classname__ || comp.constructor?.name || '',
          visible: node.activeInHierarchy !== false,
        });
      }
    }
    for (const child of node.children || []) walk(child, here, depth + 1);
  };
  walk(cc.director.getScene(), '', 0);
  return { cc: true, version: cc.ENGINE_VERSION, labels };
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, locale: 'zh-TW' });
context.on('page', watchPage);
const first = await context.newPage();
await first.goto(START_URL);

console.log(`輸出：${outDir}`);
console.log('請在瀏覽器內進到「選擇機台」，然後回終端機按 Enter 擷取；輸入 q 再按 Enter 結束。');
console.log('只看不按：不要按「確定」「鎖定」，不要轉點。');

let shot = 0;
async function capture() {
  const gamePages = context.pages().filter((p) => GAME_HOST.test(p.url()));
  if (gamePages.length === 0) {
    console.log('還沒找到遊戲分頁（play.godeebxp.com），請先進入遊戲。');
    return;
  }
  for (const page of gamePages) {
    shot++;
    const results = [];
    for (const frame of page.frames()) {
      try {
        const r = await frame.evaluate(dumpScene);
        if (r.cc) results.push({ frame: frame === page.mainFrame() ? 'main' : 'iframe', ...r });
      } catch {
        // 跨來源或尚未載入的 frame，略過
      }
    }
    writeFileSync(join(outDir, `scene-${shot}.json`), JSON.stringify(results, null, 2));
    await page.screenshot({ path: join(outDir, `scene-${shot}.png`) }).catch(() => {});

    if (results.length === 0) {
      console.log(`#${shot}：這個分頁找不到 Cocos（window.cc），已存截圖。`);
      continue;
    }
    for (const r of results) {
      const visible = r.labels.filter((l) => l.visible);
      const numeric = visible.filter((l) => /\d/.test(l.text));
      console.log(`#${shot}：Cocos ${r.version ?? '?'}（${r.frame}），文字節點 ${r.labels.length}（顯示中 ${visible.length}，含數字 ${numeric.length}）`);
      for (const l of numeric.slice(0, 15)) console.log(`   ${l.text.replace(/\s+/g, ' ').slice(0, 40)}  ← ${l.path.split('/').slice(-3).join('/')}`);
    }
  }
}

const rl = createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  if (line.trim().toLowerCase() === 'q') {
    rl.close();
    await browser.close().catch(() => {});
    return;
  }
  await capture().catch((err) => console.log('擷取失敗：', err.message));
});

await new Promise((resolve) => browser.on('disconnected', resolve));
rl.close();
console.log(`結束，檔案在 ${outDir}`);
