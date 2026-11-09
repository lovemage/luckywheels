// ATG 盤面偵察：確認戰神賽特 II 的滾輪盤面（6×5 符號）能否從 Cocos 場景樹讀出，供「盤面符號訊號」使用。
// 只讀場景樹，不按 Spin、不下注、不轉點、不讀網路封包；入座與轉動全由使用者在瀏覽器內操作。
//
//   node --env-file=.env scripts/atg-board-probe.mjs
//
// 帳號用 .env 的 TEST_ACCOUNT／TEST_PASSWORD（不寫入 log），娛樂城網址用 ATG_COLLECTOR_CASINO_URL。
// 執行後瀏覽器保持開啟，輸出在 .atg-capture/board-<時間>/（已 gitignore）：
//   cmd/<名稱>.js     放進去的 JS 會在遊戲頁執行一次（運算式），結果寫到 out/<名稱>.json，並存同時間截圖
//   watch.jsonl       開啟監看後（cmd 裡呼叫 __probe.watch(...)），盤面每次變化記一筆
// 刪除 cmd/STOP 以外的檔案不影響；建立 cmd/STOP 結束並關閉瀏覽器。
//
// 遠端操作（瀏覽器跑在沒有螢幕的主機上時）：設定 VIEW_HOST（例如 Tailscale IP）與 VIEW_PORT，
// 瀏覽器改為 headless，並在 http://VIEW_HOST:VIEW_PORT/?t=<token> 提供即時畫面：點畫面＝點遊戲、可輸入文字。
// 只綁定指定的位址，token 每次啟動隨機產生。

import { chromium } from 'playwright';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const account = process.env.TEST_ACCOUNT;
const password = process.env.TEST_PASSWORD;
const casinoUrl = process.env.ATG_COLLECTOR_CASINO_URL || 'https://www.ds8899.net';
if (!account || !password) {
  console.error('缺少 TEST_ACCOUNT／TEST_PASSWORD');
  process.exit(1);
}
const origin = new URL(casinoUrl).origin;
const GAME_RESOURCE = '22020103b31b7390f07b1551e8538589b5e51967'; // 戰神賽特 II

const outDir = join('.atg-capture', `board-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const cmdDir = join(outDir, 'cmd');
const resDir = join(outDir, 'out');
mkdirSync(cmdDir, { recursive: true });
mkdirSync(resDir, { recursive: true });
const log = (msg) => {
  const line = `[${new Date().toLocaleTimeString('zh-TW', { hour12: false })}] ${msg}`;
  console.log(line);
  appendFileSync(join(outDir, 'probe.log'), line + '\n');
};

// 注入遊戲頁的讀取工具（window.__probe）。只讀節點，不呼叫任何按鈕事件。
const PROBE_SOURCE = String.raw`
(function () {
  if (window.__probe) return;
  const cc = () => window.cc;
  const compName = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '';
  const comps = (n) => n._components || n.components || [];
  function pathOf(n) {
    const parts = [];
    for (let x = n; x && x.parent; x = x.parent) parts.unshift(x.name);
    return parts.join('/');
  }
  function worldPos(n) {
    try {
      const p = n.worldPosition || (n.getWorldPosition && n.getWorldPosition());
      return p ? [Math.round(p.x), Math.round(p.y)] : null;
    } catch (e) { return null; }
  }
  function visual(n) {
    const out = [];
    for (const c of comps(n)) {
      const name = compName(c);
      if (name === 'cc.Sprite' && c.spriteFrame) out.push({ k: 'sprite', v: c.spriteFrame.name });
      else if (name === 'sp.Skeleton') {
        let anim = null;
        try { const t = c.getCurrent && c.getCurrent(0); anim = t && t.animation && t.animation.name; } catch (e) {}
        out.push({ k: 'spine', v: (c.skeletonData && c.skeletonData.name) || '?', anim: anim || c.animation || null });
      } else if ((name === 'cc.Label' || name === 'cc.RichText') && c.string) out.push({ k: 'text', v: String(c.string).slice(0, 40) });
    }
    return out;
  }
  function walk(n, fn, depth) {
    if (!n || depth > 80) return;
    fn(n, depth);
    for (const ch of n.children || []) walk(ch, fn, depth + 1);
  }
  const scene = () => cc().director.getScene();

  // 所有顯示中、帶圖片／骨骼動畫／文字的節點
  function dumpVisual(filter) {
    const out = [];
    walk(scene(), (n) => {
      if (!n.activeInHierarchy) return;
      const v = visual(n);
      if (!v.length) return;
      const p = pathOf(n);
      if (filter && !p.includes(filter)) return;
      out.push({ p, pos: worldPos(n), v });
    }, 0);
    return out;
  }
  // 子節點數量多、名稱重複（像格子）的節點，找滾輪容器用
  function gridCandidates(min) {
    const out = [];
    walk(scene(), (n) => {
      if (!n.activeInHierarchy) return;
      const kids = (n.children || []).filter((c) => c.activeInHierarchy);
      if (kids.length < (min || 5)) return;
      const names = {};
      kids.forEach((c) => (names[c.name] = (names[c.name] || 0) + 1));
      out.push({ p: pathOf(n), kids: kids.length, names });
    }, 0);
    return out;
  }
  // 某節點底下的結構（名稱、子節點數、元件）
  function tree(path, maxDepth) {
    let root = null;
    walk(scene(), (n) => { if (!root && pathOf(n) === path) root = n; }, 0);
    if (!root) return null;
    const rec = (n, d) => ({
      n: n.name, on: n.activeInHierarchy, pos: worldPos(n),
      c: comps(n).map(compName).filter((x) => x && x !== 'cc.UITransform'), v: visual(n),
      ch: d < (maxDepth || 4) ? (n.children || []).map((c) => rec(c, d + 1)) : (n.children || []).length,
    });
    return rec(root, 0);
  }
  function hud() {
    const get = (name) => { let t = null; walk(scene(), (n) => { if (t === null && n.name === name && n.activeInHierarchy) { const v = visual(n).find((x) => x.k === 'text'); if (v) t = v.v; } }, 0); return t; };
    return { balance: get('balanceLabel'), win: get('totalWinLabel') };
  }

  // 監看：每 intervalMs 讀一次 fn 的結果，有變化就推進佇列（由 Node 端取走寫檔）
  const queue = [];
  let timer = null;
  let last = null;
  function watch(src, intervalMs) {
    unwatch();
    const fn = new Function('P', 'return (' + src + ')(P)');
    timer = setInterval(() => {
      let v;
      try { v = JSON.stringify(fn(window.__probe)); } catch (e) { v = JSON.stringify({ error: String(e) }); }
      if (v !== last) { last = v; queue.push({ t: Date.now(), hud: hud(), v: JSON.parse(v) }); if (queue.length > 5000) queue.shift(); }
    }, intervalMs || 100);
    return true;
  }
  function unwatch() { if (timer) clearInterval(timer); timer = null; last = null; return true; }
  function drain() { return queue.splice(0, queue.length); }

  window.__probe = { dumpVisual, gridCandidates, tree, hud, watch, unwatch, drain, visual, pathOf, walk, scene };
})();
`;

const VIEW_HOST = process.env.VIEW_HOST;
const VIEW_PORT = Number(process.env.VIEW_PORT || 0);
const browser = await chromium.launch({ headless: Boolean(VIEW_HOST), channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'zh-TW' });

// 1. 登入（同採集器：POST 登入，session 放在 context 的 cookie）
const res = await context.request.post(`${origin}/mobile/op/sty1_home_op.php?pdisplay=login`, {
  form: { userid: account, passwd: password, lang: 'tw' },
  headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: `${origin}/mobile/sty4_home.php` },
});
if (!res.ok() || !(await res.text()).includes('location.reload')) {
  log(`登入失敗（HTTP ${res.status()}）`);
  await browser.close();
  process.exit(1);
}
log('登入完成');

// 2. 進 ATG 大廳（不帶轉點金額）→ 戰神賽特 II「開始遊戲」
const page = await context.newPage();
const lobby = await Promise.race([
  page.waitForURL(/godeebxp\.com/, { timeout: 30_000 }).then(() => page),
  context.waitForEvent('page', { timeout: 30_000 }).then(async (p) => (await p.waitForURL(/godeebxp\.com/, { timeout: 30_000 }), p)),
  page.goto(`${origin}/mobile/check_games.php?game_store=54&type=0&transfer_quota=`).then(() => new Promise(() => {})),
]).catch(() => null);
if (!lobby) log('未自動導向 ATG 大廳，請在瀏覽器內自行進入');

let game = null;
if (lobby) {
  const start = lobby.locator(`.card:has(img[src*="/egames/${GAME_RESOURCE}/"]) button`, { hasText: '開始遊戲' });
  game = await Promise.race([
    lobby.waitForURL(/\/egames\/[0-9a-f]{40}\/game\//, { timeout: 40_000 }).then(() => lobby),
    context.waitForEvent('page', { timeout: 40_000 }).then(async (p) => (await p.waitForURL(/\/egames\/[0-9a-f]{40}\/game\//, { timeout: 40_000 }), p)),
    start.first().waitFor({ state: 'attached', timeout: 30_000 }).then(() => start.first().click({ force: true })).then(() => new Promise(() => {})),
  ]).catch(() => null);
}

const gamePage = async () => {
  if (game && !game.isClosed() && /\/egames\//.test(game.url())) return game;
  game = context.pages().find((p) => /\/egames\/[0-9a-f]{40}\/game\//.test(p.url())) || null;
  return game;
};

if (VIEW_HOST && VIEW_PORT) startViewer();
log((await gamePage()) ? '已開啟遊戲頁，請在瀏覽器內按「開始遊戲」並選一台空台入座' : '還沒找到遊戲頁');
writeFileSync(join(outDir, 'READY'), new Date().toISOString());
log(`指令資料夾：${cmdDir}`);

// ── 遠端操作網頁 ──
function viewTarget() {
  const pages = context.pages().filter((p) => !p.isClosed());
  return (game && !game.isClosed() ? game : null) || pages[pages.length - 1] || null;
}

const VIEWER_HTML = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ATG 偵察畫面</title>
<style>
  body { margin: 0; background: #111; color: #ddd; font: 14px system-ui, sans-serif; }
  #bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 6px 8px; }
  #bar input { flex: 1; min-width: 120px; padding: 6px; font-size: 16px; }
  #bar button { padding: 6px 10px; font-size: 14px; }
  #screen { display: block; width: 100%; height: auto; cursor: crosshair; touch-action: manipulation; }
  #st { color: #8c8; }
</style></head><body>
<div id="bar">
  <input id="txt" placeholder="要輸入的文字（先點遊戲裡的輸入框）">
  <button id="send">輸入</button><button id="enter">Enter</button><button id="bs">⌫</button>
  <span id="st"></span>
</div>
<img id="screen" alt="遊戲畫面">
<script>
  const T = new URLSearchParams(location.search).get('t');
  const img = document.getElementById('screen'), st = document.getElementById('st');
  const q = (path, params) => fetch(path + '?' + new URLSearchParams({ t: T, ...params }), { method: 'POST' });
  let busy = false;
  async function frame() {
    if (busy) return; busy = true;
    try {
      const r = await fetch('/frame.jpg?t=' + T + '&_=' + Date.now());
      if (r.ok) { const b = await r.blob(); const u = URL.createObjectURL(b); const old = img.src; img.src = u; if (old) URL.revokeObjectURL(old); st.textContent = ''; }
      else st.textContent = '無畫面';
    } catch (e) { st.textContent = '連線中斷'; }
    busy = false;
  }
  setInterval(frame, 350); frame();
  img.addEventListener('click', (e) => {
    const r = img.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * img.naturalWidth;
    const y = (e.clientY - r.top) / r.height * img.naturalHeight;
    q('/click', { x: Math.round(x), y: Math.round(y) }); st.textContent = '點擊';
  });
  document.getElementById('send').onclick = () => { const v = document.getElementById('txt').value; if (v) q('/type', { s: v }); document.getElementById('txt').value = ''; };
  document.getElementById('enter').onclick = () => q('/key', { k: 'Enter' });
  document.getElementById('bs').onclick = () => q('/key', { k: 'Backspace' });
</script></body></html>`;

function startViewer() {
  const token = randomBytes(12).toString('hex');
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.searchParams.get('t') !== token) { res.writeHead(403); return res.end(); }
    try {
      const page = viewTarget();
      if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(VIEWER_HTML); }
      if (!page) { res.writeHead(503); return res.end(); }
      if (url.pathname === '/frame.jpg') {
        const buf = await page.screenshot({ type: 'jpeg', quality: 60 });
        res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' });
        return res.end(buf);
      }
      if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
      if (url.pathname === '/click') await page.mouse.click(Number(url.searchParams.get('x')), Number(url.searchParams.get('y')));
      else if (url.pathname === '/type') await page.keyboard.type(String(url.searchParams.get('s') || '').slice(0, 100));
      else if (url.pathname === '/key' && ['Enter', 'Backspace'].includes(url.searchParams.get('k'))) await page.keyboard.press(url.searchParams.get('k'));
      else { res.writeHead(404); return res.end(); }
      res.writeHead(204); res.end();
    } catch (e) {
      res.writeHead(500); res.end(String(e && e.message));
    }
  });
  server.listen(VIEW_PORT, VIEW_HOST, () => log(`遠端畫面：http://${VIEW_HOST}:${VIEW_PORT}/?t=${token}`));
  browser.on('disconnected', () => server.close());
}

async function evalInGame(expr) {
  const p = await gamePage();
  if (!p) throw new Error('NO_GAME_PAGE');
  await p.evaluate(PROBE_SOURCE);
  return { page: p, value: await p.evaluate(`(function(){ return (${expr}); })()`) };
}

// 3. 指令迴圈：cmd/*.js → out/*.json（＋截圖）；監看佇列 → watch.jsonl
let stopping = false;
while (!stopping) {
  for (const f of readdirSync(cmdDir).sort()) {
    if (f === 'STOP') { stopping = true; break; }
    if (!f.endsWith('.js')) continue;
    const name = f.slice(0, -3);
    const src = readFileSync(join(cmdDir, f), 'utf8');
    renameSync(join(cmdDir, f), join(cmdDir, `${f}.done`));
    try {
      const { page: p, value } = await evalInGame(src);
      writeFileSync(join(resDir, `${name}.json`), JSON.stringify(value, null, 1));
      await p.screenshot({ path: join(resDir, `${name}.png`) }).catch(() => {});
      log(`完成 ${name}`);
    } catch (e) {
      writeFileSync(join(resDir, `${name}.json`), JSON.stringify({ error: String(e && e.message || e) }));
      log(`失敗 ${name}：${e && e.message}`);
    }
  }
  try {
    const p = await gamePage();
    if (p) {
      const items = await p.evaluate('window.__probe ? window.__probe.drain() : []');
      for (const it of items) appendFileSync(join(outDir, 'watch.jsonl'), JSON.stringify(it) + '\n');
    }
  } catch { /* 場景切換中 */ }
  if (!browser.isConnected()) break;
  await new Promise((r) => setTimeout(r, 300));
}
if (existsSync(join(cmdDir, 'STOP'))) log('收到 STOP');
await browser.close().catch(() => {});
log(`結束，檔案在 ${outDir}`);
