// 側邊欄：嵌入 luckyds.com 會員網站（和 Chrome 共用登入狀態），並扮演 Android App 的角色：
//  - 每 2 秒讀遊戲分頁（play.godeebxp.com）畫面上的機台、點數、贏分、押注與盤面，有變化才轉給網頁
//  - 網頁要求切換機台時，由 game-bridge.js 在遊戲裡切換（只切換、不按 Spin、不下注）
//  - 守護／房間訊號提醒：桌面通知＋側邊欄提示
// 對應：android/…/MainActivity.kt、luckyds-shim.js（網頁端的 window.LuckyApp）、src/native.ts。
'use strict';

const ORIGIN = self.LW_CONFIG.origin;
const GAME_HOST = 'godeebxp.com';
const HUD_INTERVAL_MS = 2000;
const SWITCH_TIMEOUT_MS = 20000;
const DEFAULT_CASINO_URL = 'https://www.ds8899.net/sty4_home.php?invite_code=su001&c=3';

const $ = (id) => document.getElementById(id);
const frame = $('app');
const bar = $('bar');
const statusEl = $('status');

let mode = 'full';
/** 目前的遊戲位置 { tabId, frameIds } */
let game = null;
let lastHudJson = null;
let loginTabId = null;
let toastTimer = 0;

frame.src = ORIGIN + '/';

// ── 和網頁溝通 ─────────────────────────────────────

function postToApp(type, data) {
  try {
    frame.contentWindow.postMessage({ source: 'luckyds-panel', type, data }, ORIGIN);
  } catch (_) {
    // 網頁還沒載入
  }
}

function setMode(next) {
  if (next !== 'dock' && next !== 'full' && next !== 'signal') return;
  if (next === mode) return;
  mode = next;
  postToApp('mode', mode);
}

window.addEventListener('message', (e) => {
  if (e.origin !== ORIGIN || e.source !== frame.contentWindow) return;
  const m = e.data;
  if (!m || m.source !== 'luckyds') return;
  switch (m.type) {
    case 'ready':
      // 網頁（重新）載入：重送目前模式，下一次輪詢重送遊戲資訊
      lastHudJson = null;
      if (mode !== 'full') postToApp('mode', mode);
      break;
    case 'collapse':
      // 「進入遊戲」：完整助手切成駐守小卡並回到遊戲分頁；小卡／訊號浮窗的收合只回到遊戲
      if (mode === 'full') setMode('dock');
      else if (mode === 'signal') setMode('dock');
      void focusOrOpenGame();
      break;
    case 'setMode':
      setMode(String(m.data));
      break;
    case 'switchRoom':
      void switchRoom(String(m.data || ''));
      break;
    case 'alert':
      notify('守護提醒', String(m.data || ''));
      if (mode !== 'dock') setMode('dock');
      break;
    case 'signalHit':
      notify('房間訊號達標', String(m.data || ''));
      if (mode === 'full') setMode('signal');
      break;
    case 'login':
      void openLogin();
      break;
    case 'openTab':
      openSafeTab(String(m.data || ''));
      break;
  }
});

// ── 狀態列、提示 ───────────────────────────────────

function showToast(message, warn = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('is-warn', warn);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 6000);
}

$('toast').addEventListener('click', () => {
  clearTimeout(toastTimer);
  $('toast').hidden = true;
});

function notify(title, message) {
  if (message) showToast(message, true);
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: '曜金數據助手｜' + title,
      message: message || title,
      priority: 2,
      requireInteraction: true,
    });
  } catch (_) {
    // 通知被關閉時只顯示側邊欄提示
  }
}

function renderStatus(hud) {
  const on = !!(game && hud);
  bar.classList.toggle('is-on', on);
  $('openGame').hidden = !!game;
  $('focusGame').hidden = !game;
  if (!game) statusEl.textContent = '尚未偵測到遊戲分頁';
  else if (!hud) statusEl.textContent = '已找到遊戲分頁，進入機台後開始讀取';
  else {
    const parts = [];
    if (hud.room) parts.push('#' + hud.room);
    if (hud.balance) parts.push('點數 ' + hud.balance);
    if (hud.fg) parts.push('免遊中');
    statusEl.textContent = '已連上遊戲　' + parts.join('　');
  }
}

// ── 找遊戲分頁 ─────────────────────────────────────

const isGameUrl = (url) => {
  try {
    const h = new URL(url).hostname;
    return h === GAME_HOST || h.endsWith('.' + GAME_HOST);
  } catch (_) {
    return false;
  }
};

async function gameFramesIn(tabId) {
  try {
    const frames = (await chrome.webNavigation.getAllFrames({ tabId })) || [];
    return frames.filter((f) => isGameUrl(f.url)).map((f) => f.frameId);
  } catch (_) {
    return [];
  }
}

/** 優先沿用上一次的遊戲分頁；否則找目前視窗作用中的分頁，再找任何開著遊戲的分頁 */
async function locateGame() {
  if (game) {
    const ids = await gameFramesIn(game.tabId);
    if (ids.length) return { tabId: game.tabId, frameIds: ids };
  }
  const tabs = await chrome.tabs.query({});
  tabs.sort((a, b) => Number(b.active) - Number(a.active) || (b.lastAccessed || 0) - (a.lastAccessed || 0));
  for (const t of tabs) {
    if (t.id == null || t.discarded) continue;
    const ids = await gameFramesIn(t.id);
    if (ids.length) return { tabId: t.id, frameIds: ids };
  }
  return null;
}

/** 在遊戲頁執行（先確保 game-bridge.js 已注入），回傳第一個有值的結果 */
async function evalGame(func, args = []) {
  if (!game) return undefined;
  const target = { tabId: game.tabId, frameIds: game.frameIds };
  await chrome.scripting.executeScript({ target, world: 'MAIN', files: ['game-bridge.js'] });
  const results = await chrome.scripting.executeScript({ target, world: 'MAIN', func, args });
  for (const r of results) if (r && r.result != null) return r.result;
  return null;
}

async function pollHud() {
  let hud = null;
  try {
    game = await locateGame();
    if (game) hud = await evalGame(() => (window.__lwApp ? window.__lwApp.hud() : null));
  } catch (_) {
    hud = null;
  }
  hud = hud || null;
  renderStatus(hud);
  const json = JSON.stringify(hud);
  if (json !== lastHudJson) {
    lastHudJson = json;
    postToApp('game', hud);
  }
}

async function loop() {
  await pollHud();
  setTimeout(loop, HUD_INTERVAL_MS);
}
void loop();

// ── 切換機台 ───────────────────────────────────────

function switchError(code, roomNo) {
  if (code === 'ROOM_UNAVAILABLE') return `#${roomNo} 目前無法選取，請換一台`;
  if (code === 'ALL_BUSY') return '推薦的機台目前都有人，請按「換一組」';
  if (code === 'NOT_READY' || code === 'NOT_IN_GAME' || code === 'LIST_NOT_OPEN') return '請先進入遊戲畫面，再點推薦機台';
  return `無法自動切換到 #${roomNo}，請在遊戲裡手動選擇`;
}

async function switchRoom(roomNos) {
  const rooms = [...new Set(roomNos.split(',').map((s) => s.trim()).filter((s) => /^\d{1,6}$/.test(s)))].slice(0, 10);
  if (!rooms.length) return;
  game = await locateGame().catch(() => null);
  if (!game) {
    showToast('請先進入遊戲畫面，再點推薦機台', true);
    return;
  }
  await chrome.tabs.update(game.tabId, { active: true }).catch(() => {});
  try {
    await evalGame((list) => window.__lwApp.switchRoom(list), [rooms]);
  } catch (_) {
    showToast(switchError('', rooms[0]), true);
    return;
  }
  showToast(`正在切換到 #${rooms[0]}…`);
  const deadline = Date.now() + SWITCH_TIMEOUT_MS * Math.min(rooms.length, 3);
  for (;;) {
    await new Promise((r) => setTimeout(r, 500));
    let o = null;
    try {
      o = await evalGame(() => ({ s: window.__lwApp.switchState(), h: window.__lwApp.hud() }));
    } catch (_) {
      o = null; // 遊戲重新載入中
    }
    const st = o && o.s;
    const room = o && o.h && o.h.room;
    const target = st && st.target;
    const skipped = ((st && st.skipped) || []).map((r) => '#' + r);
    const mine = target != null && rooms.includes(target);
    const skippedMsg = (to) => `${skipped.join('、')} 有人，已改坐 #${to}`;
    if (room && rooms.includes(room) && room === target) {
      return showToast(skipped.length ? skippedMsg(room) : `已切換到 #${room}`);
    }
    if (mine && st.status === 'error') return showToast(switchError(st.error, target), true);
    if ((mine && st.status === 'switching') || (o && !o.h) || !o) {
      const to = target || rooms[0];
      return showToast(skipped.length ? skippedMsg(to) : `正在切換到 #${to}，載入後請按「開始遊戲」`);
    }
    if (Date.now() > deadline) return showToast(switchError('', rooms[0]), true);
  }
}

// ── 遊戲分頁、娛樂城 ───────────────────────────────

async function casinoUrl() {
  try {
    const res = await fetch(ORIGIN + '/api/public/app-config', { credentials: 'include', cache: 'no-store' });
    const body = await res.json();
    if (typeof body.casinoUrl === 'string' && /^https:\/\//.test(body.casinoUrl)) return body.casinoUrl;
  } catch (_) {
    // 用預設網址
  }
  return DEFAULT_CASINO_URL;
}

async function focusOrOpenGame() {
  game = game || (await locateGame().catch(() => null));
  if (game) {
    const tab = await chrome.tabs.update(game.tabId, { active: true }).catch(() => null);
    if (tab) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    return;
  }
  chrome.tabs.create({ url: await casinoUrl() });
}

$('openGame').addEventListener('click', () => void focusOrOpenGame());
$('focusGame').addEventListener('click', () => void focusOrOpenGame());

function openSafeTab(url) {
  try {
    const u = new URL(url, ORIGIN);
    if (u.protocol === 'https:' || u.origin === ORIGIN) chrome.tabs.create({ url: u.href });
  } catch (_) {
    // 不合法的網址
  }
}

// ── LINE 登入：在新分頁登入，完成後重新整理側邊欄 ─────

async function openLogin() {
  const tab = await chrome.tabs.create({ url: ORIGIN + '/api/auth/line/start' });
  loginTabId = tab.id ?? null;
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tabId !== loginTabId || info.status !== 'complete' || !tab.url) return;
  let u;
  try {
    u = new URL(tab.url);
  } catch (_) {
    return;
  }
  // 登入完成會回到會員首頁（/）；還在 LINE 或 /api/auth/* 中途時不處理
  if (u.origin !== ORIGIN || u.pathname.startsWith('/api/')) return;
  loginTabId = null;
  frame.src = ORIGIN + '/?t=' + Date.now();
  chrome.tabs.remove(tabId).catch(() => {});
  showToast('已登入，助手已更新');
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === loginTabId) loginTabId = null;
  if (game && tabId === game.tabId) game = null;
});
