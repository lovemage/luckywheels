#!/usr/bin/env node
// 產生介紹網站（public/intro/**）：五個靜態頁面＋共用樣式。
//   node scripts/build-intro.mjs
// - 元件外觀沿用數據助手：從 src/assistant/assistant.css 複製成 public/intro/assets/assistant.css，
//   助手改了樣式後重跑一次即可同步。網站版面在 scripts/intro/site.css。
// - 主視覺光柱（scripts/intro/pillars.svg）取自助手首頁 LightPillars 的渲染結果（固定種子，與助手一致）。
// - 標題字：從所有頁面的標題文字產生子集 public/intro/assets/intro-display.woff2（需要 python3 + fonttools + brotli）。
// - 每頁各自的 OG 圖在 public/intro/assets/og/*.jpg（底圖由 Codex CLI 生成，再疊上標題）。
// - 畫面中的機台數字都是示意數據，頁面上一律標示。
// - 快取：Cloudflare 會在邊緣快取 CSS／圖片／字型（/assets/* 更是一年 immutable），同名覆蓋的檔案會一直是舊版。
//   所以 HTML 與 CSS 裡引用的本站靜態檔一律加上內容雜湊 ?v=xxxxxxxx，內容一變網址就變。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/intro');
const ORIGIN = 'https://luckyds.com';
const APK = '/downloads/luckyds-assistant.apk';
const APP_VERSION = '1.5.0';

const pillars = readFileSync(join(ROOT, 'scripts/intro/pillars.svg'), 'utf8');

// ── 圖示（單一筆畫風格） ──
const ICON = {
  android: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.6 9.48 19.44 6.3a.38.38 0 0 0-.66-.38l-1.86 3.22a11.5 11.5 0 0 0-9.84 0L5.22 5.92a.38.38 0 1 0-.66.38L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52ZM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z"/></svg>',
  apple: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.7c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.8-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8s2.2-1.3 3.1-2.5c1-1.4 1.4-2.8 1.4-2.9 0 0-2.8-1.1-2.9-4.2ZM13.9 5.2c.7-.8 1.2-2 1-3.2-1 0-2.2.7-3 1.5-.6.7-1.2 1.9-1 3.1 1.1.1 2.3-.6 3-1.4Z"/></svg>',
  line: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5C6.5 2.5 2 6.1 2 10.6c0 4 3.6 7.4 8.4 8 .3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5 1.1-.5 5.9-3.5 8-6 1.5-1.6 2.2-3.2 2.2-5C22 6.1 17.5 2.5 12 2.5Zm-3.7 10.6H6.4a.5.5 0 0 1-.5-.5V8.8a.5.5 0 0 1 1 0v3.3h1.4a.5.5 0 0 1 0 1Zm2-.5a.5.5 0 0 1-1 0V8.8a.5.5 0 0 1 1 0v3.8Zm4.5 0a.5.5 0 0 1-.9.3l-1.9-2.6v2.3a.5.5 0 0 1-1 0V8.8a.5.5 0 0 1 .9-.3l1.9 2.6V8.8a.5.5 0 0 1 1 0v3.8Zm3.1-2.4a.5.5 0 0 1 0 1h-1.4v.9h1.4a.5.5 0 0 1 0 1h-1.9a.5.5 0 0 1-.5-.5V8.8c0-.3.2-.5.5-.5h1.9a.5.5 0 0 1 0 1h-1.4v.9h1.4Z"/></svg>',
  monitor: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 20h6M12 16v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>',
  corner: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M3.5 4.5h17v15h-17z"/><path fill="currentColor" d="M5.5 6.5h7v4.5h-7z"/></svg>',
  switch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6L12 3Z"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M8.5 12h7"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/></svg>',
};

const MARK = `<svg class="aa-mark" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lw-mark-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0c2"/><stop offset="0.5" stop-color="#e7b552"/><stop offset="1" stop-color="#9c6a1c"/></linearGradient></defs><path d="M16 1 L19 13 L31 16 L19 19 L16 31 L13 19 L1 16 L13 13 Z" fill="url(#lw-mark-gold)"/><path d="M16 7 L17.4 14.6 L25 16 L17.4 17.4 L16 25 L14.6 17.4 L7 16 L14.6 14.6 Z" fill="#120c05" opacity="0.55"/><circle cx="16" cy="16" r="1.6" fill="#fff6d8"/></svg>`;

// iPhone「分享 → 加入主畫面」示意圖（系統畫面無法截圖，用幾何線條示意）
const IOS_A2HS = `<svg class="lw-step-shot lw-a2hs" viewBox="0 0 180 390" role="img" aria-label="示意圖：點 Safari 下方的分享按鈕，選「加入主畫面」">
  <rect x="1" y="1" width="178" height="388" rx="26" fill="#0d0b08" stroke="rgba(236,196,116,.45)"/>
  <rect x="14" y="40" width="152" height="120" rx="10" fill="#17120b"/>
  <rect x="26" y="58" width="80" height="10" rx="3" fill="#e8c274" opacity=".8"/>
  <rect x="26" y="78" width="120" height="7" rx="3" fill="#6d6150"/>
  <rect x="26" y="92" width="100" height="7" rx="3" fill="#6d6150"/>
  <rect x="8" y="176" width="164" height="168" rx="14" fill="#1d1810"/>
  <rect x="20" y="190" width="140" height="30" rx="7" fill="#27201497"/>
  <text x="30" y="210" fill="#b8aa8e" font-size="12">拷貝</text>
  <rect x="20" y="226" width="140" height="30" rx="7" fill="#27201497"/>
  <text x="30" y="246" fill="#b8aa8e" font-size="12">加入書籤</text>
  <rect x="20" y="262" width="140" height="32" rx="7" fill="#e8c274"/>
  <text x="30" y="283" fill="#1a1206" font-size="12.5" font-weight="700">加入主畫面</text>
  <rect x="136" y="270" width="14" height="14" rx="3" fill="none" stroke="#1a1206" stroke-width="1.6"/>
  <path d="M143 273v8M139 277h8" stroke="#1a1206" stroke-width="1.6"/>
  <rect x="1" y="350" width="178" height="38" fill="#14110b"/>
  <circle cx="90" cy="368" r="14" fill="none" stroke="#ffe3a6" stroke-width="2"/>
  <path d="M90 360v12M85 364l5-5 5 5M84 370v4h12v-4" fill="none" stroke="#ffe3a6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M30 368h10M140 362v12M150 362v12" stroke="#6d6150" stroke-width="2" stroke-linecap="round"/>
  <text x="90" y="330" fill="#e8c274" font-size="11" text-anchor="middle">示意圖</text>
</svg>`;

// Q 版主要角色（區塊標題旁）：public/intro/assets/ip/q-<pose>.webp
const qv = (pose) => `<img class="lw-q" src="/intro/assets/ip/q-${pose}.webp" width="160" height="160" alt="" aria-hidden="true">`;

const ink = (key, alt, cls = 'lw-ink-h') => `<img class="${cls}" src="/assets/assistant/ink/title-${key}.webp" alt="${alt}" draggable="false">`;
const demo = '<span class="lw-demo">示意數據</span>';

// ── 導覽 ──
const PAGES = [
  { id: 'home', path: '/intro/', label: '首頁', icon: '<img src="/assets/assistant/ink/icon-home.webp" alt="">' },
  { id: 'rules', path: '/intro/rules/', label: '曜金規則', tab: '規則', icon: '<img src="/assets/assistant/ink/icon-rules.webp" alt="">' },
  { id: 'signal', path: '/intro/signal/', label: '曜金訊號', tab: '訊號', icon: '<img src="/intro/assets/symbols/symbol_01.webp" alt="">' },
  { id: 'wheel', path: '/intro/wheel/', label: '幸運輪盤', tab: '輪盤', icon: '<img src="/assets/assistant/ink/icon-wheel.webp" alt="">' },
  { id: 'install', path: '/intro/install/', label: '安裝 App', tab: '安裝', icon: ICON.android },
];

function shell(page, { title, description, ogTitle, ogDesc, body }) {
  const cur = (p) => (p.id === page ? ' aria-current="page"' : '');
  const url = ORIGIN + PAGES.find((p) => p.id === page).path;
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="theme-color" content="#050403">
<link rel="canonical" href="${url}">
<link rel="icon" href="/assets/favicon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="曜金數據助手">
<meta property="og:title" content="${ogTitle}">
<meta property="og:description" content="${ogDesc}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ORIGIN}/intro/assets/og/${page}.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="zh_TW">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${ogTitle}">
<meta name="twitter:image" content="${ORIGIN}/intro/assets/og/${page}.jpg">
<link rel="preload" href="/intro/assets/intro-display.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/intro/assets/assistant.css">
<link rel="stylesheet" href="/intro/assets/site.css">
</head>
<body>
<div class="aa-stage lw-site">
<header class="aa-topbar lw-top">
  <a class="aa-brand" href="/intro/">${MARK}<span>曜金分析助手 × 輪盤</span></a>
  <nav class="lw-nav" aria-label="網站導覽">
    ${PAGES.map((p) => `<a href="${p.path}"${cur(p)}>${p.label}</a>`).join('\n    ')}
  </nav>
  <a class="aa-badge lw-login" href="/">LINE 登入</a>
</header>
<main class="lw-main" id="main">
${body}
</main>
<footer class="lw-foot">
  <div class="lw-wrap">
    <nav aria-label="頁尾連結">
      ${PAGES.map((p) => `<a href="${p.path}">${p.label}</a>`).join('\n      ')}
      <a href="/">會員登入</a>
    </nav>
    <p><span class="lw-age" aria-label="未滿 18 歲請勿使用">18+</span></p>
    <p>曜金數據助手的分數、排序、訊號與推薦，都是依已發生的紀錄整理的參考資訊，不代表遊戲結果，也不保證獲利。</p>
    <p>每一轉的結果都由遊戲伺服器獨立決定，長期而言對玩家不利。請先設定預算、量力而為；未滿 18 歲請勿使用。</p>
    <p>標示「示意數據」的畫面為介面說明用，數字並非真實機台資料。遊戲畫面與符號圖示版權屬原遊戲商所有。</p>
    <p>© luckyds.com</p>
  </div>
</footer>
<nav class="aa-tabs lw-tabs" aria-label="網站導覽">
  ${PAGES.map((p) => `<a class="aa-tab${p.id === page ? ' is-active' : ''}" href="${p.path}"${cur(p)}><span class="aa-tab-icon" aria-hidden="true">${p.icon}</span><span>${p.tab ?? p.label}</span></a>`).join('\n  ')}
</nav>
</div>
</body>
</html>
`;
}

const ctaPair = `<div class="lw-hero-cta">
        <a class="aa-cta" href="${APK}" download>${ICON.android}下載 Android App</a>
        <a class="lw-ghost" href="/">${ICON.line}LINE 登入網頁版</a>
      </div>`;

// 各分頁頂部：主要角色場景圖（public/intro/assets/ip/<page>.webp，Codex CLI 以角色參考圖生成；原圖在 docs/assistant-assets/ip）
const subhero = (art, heading, lead) => `<section class="lw-subhero has-ip" style="--lw-art:url('/intro/assets/ip/${art}.webp')">
  <div class="lw-wrap">
    ${heading}
    <p class="lw-hero-lead">${lead}</p>
  </div>
</section>`;

// 示意的精選空台與訊號（與助手畫面相同的元件）
const ROOMS = [
  ['1288', '02', 412, '88.4%', '186,400', 98, true],
  ['3071', '24', 365, '91.7%', '142,800', 97, true],
  ['0526', '06', 338, '84.9%', '98,600', 96, false],
  ['2194', '09', 301, '93.2%', '211,300', 94, false],
  ['4410', '22', 287, '89.6%', '77,200', 93, false],
];
const roomsList = `<ol class="aa-rooms">
${ROOMS.map(([no, icon, un, rtp, bet, score, premium], i) => `  <li class="aa-room" style="--i: ${i};"><span class="aa-room-rank" aria-label="第 ${i + 1} 名">${i + 1}</span><img class="aa-room-icon" alt="" width="56" height="56" loading="lazy" src="/assets/assistant/slots/${icon}.webp"><div class="aa-room-main"><p class="aa-room-title"><span class="aa-room-no">#${no}</span>${i < 2 ? '<img class="aa-rec-label" alt="推薦" width="52" height="28" src="/assets/assistant/rec-label.webp">' : ''}<span class="aa-chip">空台</span>${premium ? '<span class="aa-chip aa-chip--solid">精品</span>' : ''}</p><p class="aa-room-meta"><span>未開 <b>${un}</b></span><span>RTP <b>${rtp}</b></span><span>下注 <b>${bet}</b></span></p></div><div class="aa-room-score"><span>綜合分數</span><strong>${score}</strong></div></li>`).join('\n')}
</ol>`;

// 曜金訊號的符號（與 src/assistant/atgSymbols.ts 相同）：[圖片編號, 名稱]
const SIG = {
  eye: ['01', '眼睛'], cobra: ['02', '眼鏡蛇'], bow: ['03', '弓'], sickle: ['04', '鐮刀'],
  gem_yellow: ['05', '黃寶石'], gem_red: ['06', '紅寶石'], gem_purple: ['07', '紫寶石'], gem_blue: ['08', '藍寶石'], gem_green: ['09', '綠寶石'],
};
const signalPlate = (symbols, strength) => `<div class="aa-signal-plate">
  <ul class="aa-signal-symbols" data-count="${symbols.length}">
${symbols.map(([k, n], i) => `    <li class="aa-signal-cell" style="--i: ${i};"><img alt="" width="72" height="72" draggable="false" src="/intro/assets/symbols/symbol_${SIG[k][0]}.webp"><span class="aa-signal-mult aa-display" aria-label="${SIG[k][1]} ${n} 個"><span aria-hidden="true"><span class="aa-signal-x">×</span>${n}</span></span><span class="aa-signal-name" aria-hidden="true">${SIG[k][1]}</span></li>`).join('\n')}
  </ul>
  <p class="aa-signal-summary">盤面 ${symbols.map(([k, n]) => `${SIG[k][1]} ${n} 個`).join('、')}</p>
  <div class="aa-signal-meter"><span class="aa-signal-meter-label">訊號強度</span><span class="aa-signal-meter-track" role="meter" aria-label="訊號強度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${strength}"><span class="aa-signal-meter-fill" style="width: ${strength}%;"></span></span><strong class="aa-signal-meter-value">${strength}%</strong></div>
</div>`;

// 戰神賽特 II 盤面符號（圖片取自遊戲本身，見 docs/plans/2026-11-09-board-signal-recon.md）
const SYMBOL_GROUPS = [
  ['高分符號', '四種神器圖騰，出現在盤面任意位置都算數', [['01', '眼睛'], ['02', '眼鏡蛇'], ['03', '弓'], ['04', '鐮刀']]],
  ['寶石', '五種寶石，數量最多、最常落下', [['05', '黃寶石'], ['06', '紅寶石'], ['07', '紫寶石'], ['08', '藍寶石'], ['09', '綠寶石']]],
  ['倍數球', '球上會浮現倍數（例：2x、3x、8x），顏色有紅、紫、藍、綠四種', [['10', '紅'], ['11', '紫'], ['12', '藍'], ['13', '綠']]],
  ['特殊符號', '金色 Scatter 出現 3 個、再加 1 個紫色 Scatter，就會喚醒「覺醒之力」', [['15', '金色 Scatter'], ['16', '紫色 Scatter'], ['14', 'JP'], ['17', '男神'], ['18', '女神']]],
];
const symImg = (n, alt = '') => `<img src="/intro/assets/symbols/symbol_${n}.webp" alt="${alt}" width="72" height="72" loading="lazy" decoding="async">`;
const symbolGroups = SYMBOL_GROUPS.map(([title, desc, items]) => `<div class="lw-symgroup">
        <h3 class="aa-display">${title}</h3>
        <p>${desc}</p>
        <ul class="lw-symbols">
          ${items.map(([n, name]) => `<li>${symImg(n)}<span>${name}</span></li>`).join('\n          ')}
        </ul>
      </div>`).join('\n      ');
const symbolStrip = `<a class="lw-symstrip" href="/intro/rules/#symbols" aria-label="認識戰神賽特 II 的盤面符號">
        ${['01', '02', '03', '04', '15', '16', '13', '10', '07', '05'].map((n) => symImg(n)).join('')}
      </a>`;

const note = (lines) => `<section class="aa-rule aa-rule-note" aria-labelledby="note-title">
      ${ink('note', '使用提醒', 'aa-rule-note-title')}
      ${lines.map((l) => `<p>${l}</p>`).join('\n      ')}
    </section>`;
const NOTE_LINES = [
  '畫面上的數字都是已經發生的紀錄，每一轉的結果仍由遊戲獨立決定',
  '綜合分數與訊號強度都是排序參考，不代表中獎機率，也不保證獲利',
  '請依自己的預算設定本金，理性遊玩',
];

// 首頁開場（每次進入都播）：黑底虎頭 → 虎頭沒入黑暗、快消失時全螢幕金光由螢幕底部往上流動 → 收縮成 Hero 區塊。
// 系統設定「減少動態效果」時不播；點一下或按任意鍵略過。
const introRays = (() => {
  let seed = 0x9e3779b9;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x1_0000_0000);
  return Array.from({ length: 56 }, () => {
    const x = (r() * 100).toFixed(2);
    const h = (45 + r() * 55).toFixed(1);
    const w = r() < 0.18 ? 2 : 1;
    const d = (r() * 0.9).toFixed(2);
    const o = (0.35 + r() * 0.65).toFixed(2);
    return `<i style="left:${x}%;height:${h}%;width:${w}px;--d:${d}s;opacity:${o}"></i>`;
  }).join('');
})();
const introOverlay = `<div class="lw-intro" id="lw-intro" aria-hidden="true" hidden>
  <div class="lw-intro-stage">
    <img class="lw-intro-tiger" src="/assets/assistant/tiger.webp" alt="" draggable="false">
    <div class="lw-intro-rays">${introRays}</div>
    <div class="lw-intro-horizon"></div>
  </div>
  <p class="lw-intro-skip">點一下略過</p>
</div>
<script>
(function () {
  var el = document.getElementById('lw-intro');
  if (!el) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !el.animate) { el.parentNode.removeChild(el); return; }
  var root = document.documentElement;
  el.hidden = false;
  root.classList.add('lw-intro-on');
  var done = false;
  var timers = [];
  function finish() {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    root.classList.remove('lw-intro-on');
    if (el.parentNode) el.parentNode.removeChild(el);
  }
  function shrink() {
    var hero = document.querySelector('.aa-hero');
    if (!hero) return finish();
    var r = hero.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight;
    var to = 'inset(' + Math.max(0, r.top) + 'px ' + Math.max(0, vw - r.right) + 'px ' + Math.max(0, vh - r.bottom) + 'px ' + Math.max(0, r.left) + 'px)';
    var a = el.animate(
      [{ clipPath: 'inset(0px 0px 0px 0px)', opacity: 1 }, { clipPath: to, opacity: 1, offset: 0.7 }, { clipPath: to, opacity: 0 }],
      { duration: 900, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' }
    );
    a.onfinish = finish;
  }
  el.addEventListener('click', finish);
  window.addEventListener('keydown', finish, { once: true });
  timers.push(setTimeout(shrink, 2900));
  timers.push(setTimeout(finish, 4400));
})();
</script>`;

// ════════════════ 首頁 ════════════════
const home = shell('home', {
  title: '曜金數據助手｜金光之下，每台機台都有紀錄',
  description: '曜金數據助手把 ATG 數千台機台的紀錄排成一道看得見的光：精選空台、本金推薦、曜金訊號，遊戲中也能隨時叫出。LINE 登入，用幸運輪盤的積分開通。',
  ogTitle: '曜金數據助手',
  ogDesc: '金光之下，每台機台都有紀錄。LINE 登入轉輪盤，積分開通數據助手。',
  body: `${introOverlay}
<section class="aa-hero" aria-labelledby="hero-title">
  <img class="aa-tiger" alt="" aria-hidden="true" draggable="false" src="/assets/assistant/tiger.webp">
  ${pillars}
  <div class="aa-hero-copy">
    <h1 id="hero-title" class="aa-display aa-ink-title">${ink('hero', '機台數據 一眼看清', '')}</h1>
    <div class="aa-hero-space" aria-hidden="true"></div>
  </div>
</section>
<div class="lw-wrap lw-hero-after">
  ${ctaPair}
  <p class="lw-meta">Android ${APP_VERSION} · iPhone 請先使用網頁版</p>
</div>

<div class="lw-wrap">
  <section class="lw-band" aria-labelledby="intro-title">
    <div class="lw-grid is-center">
      <div>
        <div class="aa-section-head has-q">${qv('wave')}<h2 id="intro-title" class="aa-display">它不猜，它只看</h2></div>
        <p class="lw-mystic">曜金不替你按下轉動，也不說下一轉會怎樣。它只做一件事：把散落在數千台機台上的紀錄，排成一道你看得見的光。</p>
        <p class="lw-lead" style="margin-top:14px">同一個 LINE 帳號、同一份積分：可以拿去轉幸運輪盤，也可以換成曜金的使用時間。</p>
      ${symbolStrip}
      </div>
      <nav class="aa-entries" aria-label="網站內容">
        <a class="aa-entry" href="/intro/rules/"><span class="aa-entry-icon" aria-hidden="true"><img class="aa-ink-icon" alt="" src="/assets/assistant/ink/icon-rules.webp"></span><span class="aa-entry-copy"><span class="aa-entry-title aa-display">曜金規則</span><span class="aa-entry-sub">數字怎麼讀</span></span></a>
        <a class="aa-entry" href="/intro/signal/"><span class="aa-entry-icon" aria-hidden="true"><img class="aa-ink-icon" alt="" src="/intro/assets/symbols/symbol_01.webp"></span><span class="aa-entry-copy"><span class="aa-entry-title aa-display">曜金訊號</span><span class="aa-entry-sub">盤面符號</span></span></a>
        <a class="aa-entry" href="/intro/wheel/"><span class="aa-entry-icon" aria-hidden="true"><img class="aa-ink-icon" alt="" src="/assets/assistant/ink/icon-wheel.webp"></span><span class="aa-entry-copy"><span class="aa-entry-title aa-display">幸運輪盤</span><span class="aa-entry-sub">積分抽彩金</span></span></a>
        <a class="aa-entry" href="/intro/install/"><span class="aa-entry-icon" aria-hidden="true"><img class="aa-ink-icon" alt="" src="/assets/assistant/ink/icon-exchange.webp"></span><span class="aa-entry-copy"><span class="aa-entry-title aa-display">安裝 App</span><span class="aa-entry-sub">帶進遊戲裡</span></span></a>
      </nav>
    </div>
  </section>

  <section class="lw-band" aria-labelledby="top-title">
    <div class="lw-grid is-wide-left">
      <div class="lw-panel">
        <div class="aa-section-head"><h2 id="top-title" class="aa-display aa-ink-title">${ink('top', '精選空台 TOP 5')}</h2><img class="aa-section-note aa-ink-note" alt="戰神賽特 II" src="/assets/assistant/ink/title-game.webp"></div>
        ${roomsList}
        <div class="lw-panel-foot"><p class="aa-disclaimer" style="margin:0">數據攻略僅供參考</p>${demo}</div>
      </div>
      <div>
        <div class="aa-section-head"><h2 class="aa-display">只看空著的機台</h2></div>
        <p class="lw-lead">精選空台只列現在沒有人坐、資料仍在更新的機台。未開轉數、今日 RTP、近 30 天 RTP、今日下注量，四項紀錄在同一款遊戲裡各自排名，再合成一個綜合分數。</p>
        <p class="lw-lead">分數最高的五台，就是此刻浮上來的光。</p>
        <p style="margin-top:18px"><a href="/intro/rules/">看曜金規則怎麼讀這些數字 ›</a></p>
      </div>
    </div>
  </section>

  <section class="lw-band" aria-labelledby="ingame-title">
    <div class="aa-section-head has-q">${qv('phone')}<h2 id="ingame-title" class="aa-display">遊戲裡，它安靜地守在一角</h2></div>
    <p class="lw-lead">在 App 裡登入娛樂城、直接進遊戲。點一下金色按鈕，駐守小卡只佔左上角，右側的轉動與功能鍵完全不擋。</p>
    <figure class="lw-shot" style="margin-top:20px">
      <img src="/intro/assets/shot-ingame.webp" width="1366" height="768" loading="lazy" decoding="async" alt="遊戲畫面左上角疊著駐守小卡：目前機台 #0459、本場損益 +320 與停損停利線，以及兩台推薦機台">
      ${demo}
    </figure>
    <ul class="lw-callouts is-row">
      <li>${ICON.corner}<div><b>只佔一角</b><span>平常三行，點「更多」才展開；小卡開在金色按鈕那一側。</span></div></li>
      <li>${ICON.switch}<div><b>一點換台</b><span>點推薦的機台，App 直接在遊戲裡切過去；轉不轉、押多少由你決定。</span></div></li>
      <li>${ICON.shield}<div><b>守住界線</b><span>本場輸贏碰到你設的停損、停利，手機震動並打開小卡提醒你。</span></div></li>
    </ul>
  </section>

  <section class="lw-band" aria-labelledby="signal-title">
    <div class="lw-grid is-center flip">
      <div class="lw-panel">
        ${signalPlate([['eye', 3], ['sickle', 2], ['gem_purple', 6]], 92)}
        <div class="lw-panel-foot"><p class="aa-disclaimer" style="margin:0">強度依機台綜合分數換算 · 排序參考</p>${demo}</div>
      </div>
      <div>
        <div class="aa-section-head has-q">${qv('gem')}<h2 id="signal-title" class="aa-display">曜金訊號</h2></div>
        <p class="lw-mystic">眼睛、眼鏡蛇、寶石……和遊戲盤面上一模一樣的符號。每一組訊號，都是精選空台 TOP 5 其中一台的房間訊號。</p>
        <p class="lw-lead" style="margin-top:12px">是哪一台，畫面上不會說；逐台查房間訊號，對得上的就是那台。機台一有變化，訊號就自動換成新的一組。</p>
        <p style="margin-top:18px"><a href="/intro/signal/">讀懂曜金訊號 ›</a></p>
      </div>
    </div>
  </section>

  <section class="lw-band lw-start" aria-labelledby="start-title">
    <div class="lw-start-copy">
      <div class="aa-section-head"><h2 id="start-title" class="aa-display">三步，開啟曜金</h2></div>
      <ol class="lw-steps">
        <li><div><b>LINE 登入</b><p>不用另外註冊。登入後就是會員，可以轉幸運輪盤。</p></div></li>
        <li><div><b>積分開通</b><p>把輪盤積分換成使用時間，<em>不用另外儲值</em>。使用中再換會往後延長。</p></div></li>
        <li><div><b>帶進遊戲</b><p>Android 安裝 App，遊戲中隨時叫出駐守小卡；iPhone 用 Safari 網頁版、<a href="/intro/install/#ios">加入主畫面</a>。</p></div></li>
      </ol>
    </div>
    <img class="lw-start-figure" src="/intro/assets/ip/full.webp" width="730" height="1100" loading="lazy" decoding="async" alt="">
  </section>

  <section class="lw-band">
    <div class="lw-grid">
      ${note(NOTE_LINES)}
      <div class="lw-close">
        <p class="lw-mystic">先轉一次輪盤，<br>再決定要不要點亮曜金。</p>
        ${ctaPair}
      </div>
    </div>
  </section>
</div>`,
});

// ════════════════ 曜金規則 ════════════════
const METRICS = [
  ['unopened', '未開轉數', '綜合分數比重 35%', '這台機台從上一次開出到現在，已經累積轉了幾轉還沒開出', [
    '數字越大，代表這台距離上一次開出越久',
    '可以搭配「前兩次開出間隔」一起看，知道這台近期大約隔多少轉開出一次',
    '助手會把每台的未開轉數跟同一款遊戲的所有機台比較，告訴你它多於多少比例的機台',
  ]],
  ['rtp', 'RTP 返還率', '今日 RTP 比重 25% · 近 30 天 RTP 比重 20%', '機台派出的金額占玩家總下注的比例', [
    '今日 RTP 是今天到目前為止的返還率，下注量少的時候數字起伏很大',
    '近 30 天 RTP 涵蓋較長的期間，比較能反映這台機台平常的水準',
    '兩個數字對照著看。今日 RTP 偏低、近 30 天 RTP 正常或偏高，代表這台今天派出的比例低於它平常的表現',
    '單日 RTP 偶爾會出現上千 % 的極端數字，助手計分時看的是它在同遊戲中的排名，單一極端值不會把排序拉歪',
  ]],
  ['bet', '今日下注量', '綜合分數比重 20%', '今天所有玩家在這台機台累積的下注金額', [
    '下注量高，代表今天有很多人在這台遊玩，是熱度的參考',
    '下注量也決定今日 RTP 有多可信。同樣是 80%，累積下注 100 元和累積下注 10 萬元，代表的意義差很多',
    '看到今日 RTP 很低或很高時，先確認下注量夠不夠大，再決定要不要參考這個數字',
  ]],
];
const rule = ([id, name, weight, meaning, points]) => `<section id="rule-${id}" class="aa-rule" aria-labelledby="rule-${id}-title">
      <div class="aa-section-head"><h2 id="rule-${id}-title" class="aa-display aa-ink-title">${ink(id, name)}</h2></div>
      <p class="aa-rule-weight">${weight}</p>
      <p class="aa-rule-meaning">${meaning}</p>
      <ul class="aa-reasons aa-rule-points">
        ${points.map((p) => `<li>${p}</li>`).join('\n        ')}
      </ul>
    </section>`;

const rules = shell('rules', {
  title: '曜金規則｜讀懂數字背後的紀錄｜曜金數據助手',
  description: '曜金規則說明數據助手畫面上的每個數字：未開轉數、RTP 返還率、今日下注量代表什麼，以及綜合分數、精選空台與本金推薦如何排序。',
  ogTitle: '曜金規則｜讀懂數字背後的紀錄',
  ogDesc: '未開轉數、RTP 返還率、今日下注量，曜金怎麼把它們排成一道光。',
  body: `${subhero('rules', `<h1 class="aa-ink-title">${ink('rules', '曜金規則', '')}</h1>`, '每個數字，都是已發生的紀錄')}
<div class="lw-wrap">
  <section class="lw-band">
    <nav class="aa-rules-toc" aria-label="本頁內容" style="margin:0">
      <a href="#rule-unopened">未開轉數</a><a href="#rule-rtp">RTP 返還率</a><a href="#rule-bet">今日下注量</a><a href="#rule-score">怎麼排序</a><a href="#rule-recommend">本金推薦</a><a href="#symbols">盤面符號</a><a href="/intro/signal/">曜金訊號</a>
    </nav>
  </section>
  <div class="lw-grid" style="margin-top:8px">
    <div>
      ${METRICS.map(rule).join('\n      ')}
    </div>
    <div>
      <section id="rule-score" class="aa-rule" aria-labelledby="rule-score-title">
        <div class="aa-section-head has-q">${qv('point')}<h2 id="rule-score-title" class="aa-display aa-ink-title">${ink('score', '助手怎麼排序')}</h2></div>
        <ul class="aa-reasons aa-rule-points">
          <li>四項數字各自換算成在同遊戲中的排名，再依比重合成綜合分數</li>
          <li>未開轉數越多、今日 RTP 越低、近 30 天 RTP 越高、今日下注量越高，分數越高</li>
          <li>精選空台只列目前沒人使用的機台，依綜合分數取前 5 名；分數前 5% 的空台標為「精品」</li>
          <li>超過 30 分鐘沒有更新的機台不列入排序；細項資料較舊時，該項以中間值計算</li>
        </ul>
      </section>
      <section id="rule-recommend" class="aa-rule" aria-labelledby="rule-recommend-title">
        <div class="aa-section-head"><h2 id="rule-recommend-title" class="aa-display aa-ink-title">${ink('recommend', '本金推薦')}</h2></div>
        <p class="aa-rule-meaning">輸入這次準備的本金、選今天的目標倍數，曜金只從空台裡挑分數達到門檻的機台</p>
        <ul class="aa-reasons aa-rule-points">
          <li>本金分成三個級距，級距越高、目標倍數越高，門檻分數跟著提高</li>
          <li>每台推薦附兩三條理由，例如「未開 412 轉，多於 92% 的機台」</li>
          <li>推薦會分散到不同機台，減少多人同時擠進同一台；符合的機台不足時，會以分數最高的空台補上並標示</li>
          <li>建議單注 10 元以上</li>
        </ul>
        <figure class="lw-shot lw-phone" style="margin-top:22px">
          <img src="/intro/assets/shot-assistant-recommend.webp" width="780" height="1688" loading="lazy" decoding="async" alt="本金推薦畫面：本金 8,000、目標 2 倍，列出符合門檻的空台與推薦理由">
          ${demo}
        </figure>
      </section>
    </div>
  </div>
  <section class="lw-band" id="symbols" aria-labelledby="symbols-title">
    <div class="aa-section-head has-q">${qv('gem')}<h2 id="symbols-title" class="aa-display aa-ink-title">${ink('game', '戰神賽特 II')}</h2><span class="aa-section-note">盤面符號</span></div>
    <p class="lw-lead">盤面 6 欄 × 5 列，共 30 格。認得這些符號，在遊戲裡就讀得懂每一次落下的盤面。</p>
    <div class="lw-symgroups">
      ${symbolGroups}
    </div>
    <p class="aa-disclaimer" style="margin-top:14px">符號圖示取自遊戲畫面，版權屬原遊戲商所有</p>
  </section>
  <section class="lw-band">
    ${note(NOTE_LINES)}
  </section>
</div>`,
});

// ════════════════ 曜金訊號 ════════════════
const signal = shell('signal', {
  title: '曜金訊號｜盤面上的符號，一組只屬於此刻｜曜金數據助手',
  description: '曜金訊號用戰神賽特 II 盤面上的符號與數量組成，和遊戲裡看到的一模一樣；每一組都是精選空台 TOP 5 其中一台的房間訊號，機台一有變化就自動換組。',
  ogTitle: '曜金訊號｜盤面上的符號，一組只屬於此刻',
  ogDesc: '眼睛、眼鏡蛇、寶石，和遊戲盤面一模一樣。每一組訊號，都是此刻 TOP 5 其中一台的房間訊號。',
  body: `${subhero('signal', '<h1 class="aa-ink-title"><img src="/intro/assets/ink/title-signal.webp" alt="曜金訊號" draggable="false"></h1>', '盤面上的符號，排成此刻的訊號')}
<div class="lw-wrap">
  <section class="lw-band" aria-labelledby="what-title">
    <div class="lw-grid is-center">
      <div class="lw-panel">
        ${signalPlate([['eye', 3], ['cobra', 2], ['gem_red', 5]], 88)}
        <div class="lw-panel-foot"><p class="aa-disclaimer" style="margin:0">發出 21:06 · 排序參考，不代表遊戲結果</p>${demo}</div>
      </div>
      <div>
        <div class="aa-section-head has-q">${qv('point')}<h2 id="what-title" class="aa-display">訊號是什麼</h2></div>
        <p class="lw-mystic">每一組訊號，都是助手首頁精選空台 TOP 5 其中一台的房間訊號。</p>
        <p class="lw-lead" style="margin-top:12px">是哪一台，畫面上不會顯示；開通後看得到 TOP 5 的房號，逐台查房間訊號，對得上的就是那台。曜金訊號不用開通也看得到，一次一組。</p>
      </div>
    </div>
  </section>

  <section class="lw-band" id="room-signal" aria-labelledby="room-title">
    <div class="aa-section-head has-q">${qv('wave')}<h2 id="room-title" class="aa-display">房間訊號</h2><span class="aa-section-note">坐上機台之後</span></div>
    <p class="lw-mystic">連續多日分析，每天更新前七天單一房間數據。</p>
    <p class="lw-lead" style="margin-top:10px">我們抓連續好幾天的數據做分析，每天更新前七天單一房間數據，推薦當天最適合這一台的訊號。房間訊號列出幾種符號各需要幾個；坐上機台後，每轉結束時盤面上這些符號的數量都剛好相等，就是訊號達標，可買免遊。</p>
    <div class="lw-grid is-center" style="margin-top:22px">
      <figure class="lw-shot lw-float-shot">
        <img src="/intro/assets/shot-signal-float.webp" width="460" height="668" loading="lazy" decoding="async" alt="Android App 的房間訊號浮窗：訊號達標！可買免遊，眼睛 4/4、紅寶石 3/3、紫寶石 5/5">
        <figcaption>Android App：遊戲內浮窗自動比對，達標時震動提醒 · 示意數據</figcaption>
      </figure>
      <figure class="lw-shot lw-phone">
        <img src="/intro/assets/ios-roomsig.webp" width="600" height="1298" loading="lazy" decoding="async" alt="網頁版房間訊號：輸入房號 459，顯示眼睛 = 4、紅寶石 = 3、紫寶石 = 5">
        <figcaption>iPhone／網頁版：輸入房號查詢，自己對照盤面 · 示意數據</figcaption>
      </figure>
    </div>
    <p style="margin-top:16px"><a href="/intro/install/">Android 安裝與 iPhone 使用方式 ›</a></p>
  </section>

  <section class="lw-band" aria-labelledby="metal-title">
    <div class="aa-section-head has-q">${qv('gem')}<h2 id="metal-title" class="aa-display">訊號用的符號</h2><span class="aa-section-note">與遊戲盤面相同</span></div>
    <p class="lw-lead">訊號只用戰神賽特 II 的九種一般符號。每組 2–3 種、至少一種高分符號，每種配上盤面數量，讀法和遊戲裡一樣：「眼睛 3 個、紅寶石 5 個」。</p>
    <div class="lw-symgroups">
      <div class="lw-symgroup">
        <h3 class="aa-display">高分符號</h3>
        <p>每組至少一種，數量 2–5 個</p>
        <ul class="lw-symbols">
          ${['01', '02', '03', '04'].map((n) => `<li>${symImg(n)}<span>${Object.values(SIG).find((x) => x[0] === n)[1]}</span></li>`).join('\n          ')}
        </ul>
      </div>
      <div class="lw-symgroup">
        <h3 class="aa-display">寶石</h3>
        <p>數量 3–8 個</p>
        <ul class="lw-symbols">
          ${['05', '06', '07', '08', '09'].map((n) => `<li>${symImg(n)}<span>${Object.values(SIG).find((x) => x[0] === n)[1]}</span></li>`).join('\n          ')}
        </ul>
      </div>
    </div>
    <ul class="aa-reasons aa-rule-points" style="margin-top:18px">
      <li>Scatter 與倍數球不會出現在訊號裡</li>
      <li>符號的種類與數量用來區分不同的訊號，本身不代表大小或好壞，真正的差別看「訊號強度」</li>
      <li>符號圖示取自遊戲畫面，版權屬原遊戲商所有</li>
    </ul>
  </section>

  <section class="lw-band">
    <div class="lw-grid">
      <section class="aa-rule" aria-labelledby="strength-title" style="margin:0">
        <div class="aa-section-head"><h2 id="strength-title" class="aa-display">訊號強度</h2></div>
        <p class="aa-rule-meaning">由對應機台的綜合分數換算，分數越高，強度越高</p>
        <ul class="aa-reasons aa-rule-points">
          <li>綜合分數怎麼來，請看<a href="/intro/rules/#rule-score">曜金規則</a></li>
          <li>強度是排序參考，不代表中獎機率</li>
        </ul>
      </section>
      <section class="aa-rule" aria-labelledby="swap-title" style="margin:0">
        <div class="aa-section-head"><h2 id="swap-title" class="aa-display">什麼時候換一組</h2></div>
        <p class="aa-rule-meaning">對應的機台只要出現下面任一種變化，系統就自動換一組新訊號，並在畫面上說明原因</p>
        <ul class="aa-reasons aa-rule-points">
          <li>有人入座</li>
          <li>開過免費遊戲</li>
          <li>今日 RTP 明顯變動</li>
          <li>資料停止更新</li>
          <li>掉出精選空台 TOP 5</li>
          <li>到了隔天</li>
        </ul>
      </section>
      <section class="aa-rule" aria-labelledby="refresh-title" style="margin:0">
        <div class="aa-section-head"><h2 id="refresh-title" class="aa-display">免遊結束，換下一組</h2></div>
        <ul class="aa-reasons aa-rule-points">
          <li>按鈕在房間訊號：免遊結束後可按「免遊結束，換下一組」，看同一台的下一組</li>
          <li>每台每天 5 組，按錯可以回上一組</li>
        </ul>
      </section>
      <section class="aa-rule" aria-labelledby="limit-title" style="margin:0">
        <div class="aa-section-head"><h2 id="limit-title" class="aa-display">不讓光擠在一處</h2></div>
        <ul class="aa-reasons aa-rule-points">
          <li>同一台機台同時對應的訊號數有上限，避免太多會員擠進同一台</li>
        </ul>
      </section>
    </div>
  </section>

  <section class="lw-band">
    ${note(NOTE_LINES)}
  </section>
</div>`,
});

// ════════════════ 幸運輪盤 ════════════════
const wheel = shell('wheel', {
  title: '幸運輪盤｜LINE 登入，轉動今天的手氣｜曜金數據助手',
  description: 'LINE 登入就能轉幸運輪盤，用積分抽彩金；同一份積分也能開通曜金數據助手。單抽 6 積分、十連抽 48 積分，結果由伺服器判定。',
  ogTitle: '幸運輪盤｜LINE 登入，轉動今天的手氣',
  ogDesc: '積分抽彩金，也能開通曜金數據助手。',
  body: `${subhero('wheel', '<h1 class="aa-ink-title"><img src="/intro/assets/ink/title-wheel.webp" alt="幸運輪盤" draggable="false"></h1>', 'LINE 登入，轉動今天的手氣')}
<div class="lw-wrap">
  <section class="lw-band" aria-labelledby="wheel-how">
    <div class="lw-grid is-center">
      <figure class="lw-shot lw-phone">
        <img src="/intro/assets/shot-wheel.webp" width="780" height="1688" loading="lazy" decoding="async" alt="幸運輪盤畫面：六個獎項的金色輪盤、會員積分與抽獎按鈕">
      </figure>
      <div>
        <div class="aa-section-head has-q">${qv('wave')}<h2 id="wheel-how" class="aa-display">怎麼轉</h2></div>
        <p class="lw-lead">不用另外註冊。用 LINE 登入、填好會員資料，就能用積分轉輪盤。</p>
        <ul class="lw-facts">
          <li><span>單抽</span><span>6 積分</span></li>
          <li><span>十連抽</span><span>48 積分</span></li>
          <li><span>抽獎結果</span><span>由伺服器判定</span></li>
          <li><span>中獎兌換</span><span>兌換碼截圖給管理員</span></li>
          <li><span>積分來源</span><span>由管理員派發</span></li>
        </ul>
        <ul class="lw-prizes" aria-label="目前獎項">
          <li><b>頭獎</b>20,000 彩金</li><li><b>二獎</b>10,000 彩金</li><li><b>三獎</b>5,000 彩金</li><li><b>四獎</b>1,888 彩金</li><li><b>五獎</b>888 彩金</li><li><b>六獎</b>388 彩金</li>
        </ul>
        <p class="aa-disclaimer" style="margin-top:14px">獎項與積分以會員頁面顯示為準</p>
      </div>
    </div>
  </section>

  <section class="lw-band" aria-labelledby="exchange-title">
    <div class="lw-grid is-center flip">
      <figure class="lw-shot lw-phone">
        <img src="/intro/assets/shot-assistant-exchange.webp" width="780" height="1688" loading="lazy" decoding="async" alt="積分兌換畫面：目前積分、剩餘時間與 1 天、3 天、7 天方案">
        ${demo}
      </figure>
      <div>
        <div class="aa-section-head has-q">${qv('point')}<h2 id="exchange-title" class="aa-display aa-ink-title">${ink('exchange', '積分兌換')}</h2></div>
        <p class="lw-mystic">同一份積分，可以交給輪盤，也可以拿來點亮曜金。</p>
        <p class="lw-lead" style="margin-top:12px">選好方案就開始計時，不用另外儲值；使用中再兌換，會從原本的到期時間往後延長。兌換方案與開放時間以會員頁面為準。</p>
        <p style="margin-top:18px"><a href="/intro/">看看曜金能做什麼 ›</a></p>
      </div>
    </div>
  </section>

  <section class="lw-band lw-close">
    <p class="lw-mystic">指針會停在哪裡，轉了才知道。</p>
    <div class="lw-hero-cta"><a class="aa-cta" href="/">${ICON.line}LINE 登入轉輪盤</a></div>
  </section>
</div>`,
});

// ════════════════ 安裝 ════════════════
const install = shell('install', {
  title: '安裝 App｜把助手帶進遊戲裡｜曜金數據助手',
  description: '下載曜金數據助手 Android App：在 App 裡登入娛樂城、直接玩遊戲，駐守小卡隨時叫出。iPhone 版準備中，現在可先使用網頁版。',
  ogTitle: '安裝 App｜把助手帶進遊戲裡',
  ogDesc: 'Android 立即下載；iPhone 版準備中，可先使用網頁版。',
  body: `${subhero('install', '<h1 class="aa-ink-title"><img src="/intro/assets/ink/title-install.webp" alt="把助手帶進遊戲裡" draggable="false"></h1>', 'Android 裝 App，iPhone 用網頁版')}
<div class="lw-wrap">
  <section class="lw-band" aria-labelledby="dock-title">
    <div class="lw-grid is-center">
      <div>
        <div class="aa-section-head has-q">${qv('phone')}<h2 id="dock-title" class="aa-display">駐守小卡</h2></div>
        <p class="lw-lead">App 會讀出你目前坐的機台號，小卡直接顯示這台的數據，再推薦兩台空台；點一下，App 在遊戲裡幫你切過去。</p>
        <ul class="aa-reasons aa-rule-points">
          <li>平常三行：目前機台、本場損益、兩台推薦</li>
          <li>點「更多」展開機台數據、綜合／精品兩榜與停損停利設定</li>
          <li>本場輸贏碰到停損、停利，手機震動並打開小卡提醒</li>
          <li>只提醒、不代按：不會自動轉、不會替你下注</li>
        </ul>
      </div>
      <div style="display:grid;gap:14px;max-width:380px;margin-inline:auto;width:100%">
        <figure class="lw-shot"><img src="/intro/assets/shot-dock-compact.webp" width="660" height="272" loading="lazy" decoding="async" alt="精簡小卡：目前機台、本場損益、兩台推薦"><figcaption>精簡模式（預設）</figcaption></figure>
        <figure class="lw-shot"><img src="/intro/assets/shot-dock-expanded.webp" width="660" height="866" loading="lazy" decoding="async" alt="展開小卡：本場損益與停損停利、目前機台數據、綜合與精品推薦"><figcaption>點「更多」展開 · 示意數據</figcaption></figure>
      </div>
    </div>
  </section>

  <!-- 安裝方式：依裝置分頁（Android／iPhone／電腦）。網址 #android、#ios、#pc 直接打開對應分頁；沒有 JS 時三塊全部顯示 -->
  <section class="lw-band" id="platforms" aria-label="安裝方式">
    <div class="lw-devtabs" role="tablist" aria-label="選擇裝置" hidden>
      <button type="button" role="tab" id="tab-android" aria-controls="android" aria-selected="true">${ICON.android}<span>Android</span></button>
      <button type="button" role="tab" id="tab-ios" aria-controls="ios" aria-selected="false" tabindex="-1">${ICON.apple}<span>iPhone</span></button>
      <button type="button" role="tab" id="tab-pc" aria-controls="pc" aria-selected="false" tabindex="-1">${ICON.monitor}<span>電腦</span><em>尚未推出</em></button>
    </div>
    <div class="lw-devpanel" role="tabpanel" id="android" aria-labelledby="tab-android">
      <div class="lw-platform">
      <div class="lw-platform-head">
        <div>
          <h2 id="android-title" class="aa-display">${ICON.android}Android App</h2>
          <p class="lw-meta" style="margin-top:4px">版本 ${APP_VERSION} · 約 0.8 MB · Android 8.0 以上</p>
        </div>
        <a class="aa-cta" style="margin:0;text-decoration:none" href="${APK}" download>${ICON.download}下載安裝檔</a>
      </div>
      <ol class="lw-steps is-cols2">
        <li><div><b>下載安裝檔</b><p>用手機 Chrome 開這一頁按下載。Chrome 提醒「檔案可能有害」時按<em>仍要下載</em>，Play 商店以外的安裝檔都會這樣提醒。</p></div><img class="lw-step-img" src="/assets/app-install/01-download.webp" width="540" height="1200" loading="lazy" alt="Chrome 下載提示"></li>
        <li><div><b>允許 Chrome 安裝</b><p>第一次會被擋下來，按<em>設定</em>，打開「允許這個來源的應用程式」。只要設定一次。</p></div><img class="lw-step-img" src="/assets/app-install/04-allow.webp" width="540" height="1200" loading="lazy" alt="允許此來源的應用程式開關"></li>
        <li><div><b>安裝並開啟</b><p>回到安裝畫面按<em>安裝</em>，完成後按<em>開啟</em>。已裝過舊版的直接覆蓋，不用先移除。</p></div><img class="lw-step-img" src="/assets/app-install/06-install.webp" width="540" height="1200" loading="lazy" alt="安裝確認畫面"></li>
        <li><div><b>LINE 登入、進入遊戲</b><p>在 App 裡用 LINE 登入，按<em>進入遊戲</em>登入娛樂城。遊戲中點左側金色按鈕，就能喚出駐守小卡。</p></div><img class="lw-step-img" src="/assets/app-install/09-home.webp" width="540" height="1200" loading="lazy" alt="曜金數據助手首頁，右下角「進入遊戲」按鈕"></li>
      </ol>
      <p class="lw-lead" style="margin-top:18px">在 LINE 裡打開這頁的話，先點右上角選單「以預設瀏覽器開啟」再下載。<a href="/android/">完整安裝說明（含各品牌手機設定）</a></p>
    </div>
    </div>
    <!-- iOS：目前用網頁版（Safari＋加入主畫面）。iPhone App 推出後，在這一塊加入與 Android 相同結構的下載區塊 -->
    <div class="lw-devpanel" role="tabpanel" id="ios" aria-labelledby="tab-ios">
      <div class="lw-platform">
      <div class="lw-platform-head">
        <div>
          <h2 id="ios-title" class="aa-display">${ICON.apple}iPhone 網頁版</h2>
          <p class="lw-meta" style="margin-top:4px">不用安裝 · Safari 開啟 · iPhone App 準備中</p>
        </div>
        <a class="lw-ghost" href="/">${ICON.line}開啟網頁版</a>
      </div>
      <p class="lw-lead" style="margin-bottom:18px">iPhone 目前使用網頁版：用 Safari 開啟、加入主畫面，之後就像 App 一樣從主畫面打開。遊戲在娛樂城另外開啟，兩邊切換使用。</p>
      <ol class="lw-steps is-cols2 lw-ios-steps">
        <li><div><b>用 Safari 開啟、LINE 登入</b><p>在 Safari 網址列輸入 <em>luckyds.com</em>。從 LINE 收到連結時，點右上角「⋯」選<em>在 Safari 中開啟</em>，再按「用 LINE 登入」。</p></div><img class="lw-step-shot" src="/intro/assets/ios-login.webp" width="600" height="1298" loading="lazy" alt="LINE 登入畫面"></li>
        <li><div><b>加入主畫面</b><p>點 Safari 下方的<em>分享</em>按鈕，往下滑選<em>加入主畫面</em>，再按右上角「新增」。之後從主畫面的圖示直接打開。</p></div>${IOS_A2HS}</li>
        <li><div><b>開通、看數據</b><p>首頁的曜金訊號不用開通就看得到；用輪盤積分開通後，還有精選空台房號、房間訊號與本金推薦。</p></div><img class="lw-step-shot" src="/intro/assets/ios-home.webp" width="600" height="1298" loading="lazy" alt="助手首頁畫面（示意數據）"></li>
        <li><div><b>入座後查房間訊號</b><p>在娛樂城選好機台入座，回到助手首頁的<em>房間訊號</em>輸入房號。每轉結束後對照盤面，符號數量都剛好相等就是訊號達標，可買免遊；免遊結束後可按<em>換下一組</em>。網頁會記得房號與組數，來回切換不用重打。</p></div><img class="lw-step-shot" src="/intro/assets/ios-roomsig.webp" width="600" height="1298" loading="lazy" alt="房間訊號查詢畫面（示意數據）"></li>
      </ol>
      <p class="lw-lead" style="margin-top:18px">網頁版讀不到遊戲畫面，所以房間訊號要自己對照；遊戲內浮窗、自動比對與震動提醒目前只有 Android App。iPhone App 推出後，安裝方式會放在這裡。</p>
    </div>
    </div>
    <!-- 電腦版：尚未推出。推出後換成下載／安裝說明 -->
    <div class="lw-devpanel" role="tabpanel" id="pc" aria-labelledby="tab-pc" data-status="coming-soon">
      <div class="lw-platform is-soon">
        <div class="lw-platform-head">
          <h2 class="aa-display">${ICON.monitor}電腦版</h2>
          <span class="lw-soon">尚未推出</span>
        </div>
        <p class="lw-lead">電腦版還在準備中，推出後安裝方式會放在這裡。</p>
      </div>
    </div>
  </section>
  <script>
  (function () {
    var bar = document.querySelector('.lw-devtabs');
    if (!bar) return;
    var tabs = [].slice.call(bar.querySelectorAll('[role=tab]'));
    var ids = tabs.map(function (t) { return t.getAttribute('aria-controls'); });
    function show(id, focus) {
      tabs.forEach(function (t) {
        var on = t.getAttribute('aria-controls') === id;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
        if (on && focus) t.focus();
      });
    }
    bar.hidden = false;
    var fromHash = location.hash.slice(1);
    var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    show(ids.indexOf(fromHash) >= 0 ? fromHash : isIOS ? 'ios' : 'android');
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () {
        show(ids[i]);
        if (history.replaceState) history.replaceState(null, '', '#' + ids[i]);
      });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = (i + d + tabs.length) % tabs.length;
        show(ids[n], true);
      });
    });
    window.addEventListener('hashchange', function () {
      var h = location.hash.slice(1);
      if (ids.indexOf(h) >= 0) show(h);
    });
  })();
  </script>


  <section class="lw-band" aria-labelledby="faq-title">
    <div class="aa-section-head has-q">${qv('point')}<h2 id="faq-title" class="aa-display">常見問題</h2></div>
    <div class="lw-faq">
      <details><summary>需要另外註冊或付費嗎？${ICON.plus}</summary><p>不用另外註冊，用 LINE 登入就好。數據助手用輪盤的會員積分兌換使用時間，不需要另外付費。</p></details>
      <details><summary>用了助手會比較容易中嗎？${ICON.plus}</summary><p>不會。每一轉的結果都由遊戲伺服器決定，曜金只把已發生的機台紀錄整理、排序給你參考，不改變也不預測結果。請量力而為、先設好預算。</p></details>
      <details><summary>iPhone 可以用嗎？${ICON.plus}</summary><p>可以，用網頁版：Safari 開啟 luckyds.com、LINE 登入，建議加入主畫面。房間訊號在網頁版要輸入房號查詢、自己對照盤面；遊戲內浮窗與自動提醒目前只有 Android App。</p></details>
      <details><summary>支援哪些遊戲？${ICON.plus}</summary><p>目前支援 ATG 的戰神賽特 II。</p></details>
      <details><summary>安裝時跳出「檔案可能有害」怎麼辦？${ICON.plus}</summary><p>這是 Chrome 對所有 Play 商店以外安裝檔的固定提醒，按「仍要下載」即可。請只從 luckyds.com 下載安裝檔。</p></details>
      <details><summary>娛樂城帳號會不會被助手拿走？${ICON.plus}</summary><p>娛樂城是在娛樂城自己的頁面登入，助手不讀取、也不儲存你的娛樂城帳號密碼。App 只讀遊戲畫面上的機台號和點數，用來顯示數據和計算本場損益。</p></details>
    </div>
  </section>
</div>`,
});

// ── 輸出 ──
const pages = { '': home, rules, signal, wheel, install };

// 本站靜態檔加內容雜湊（public/ 底下找得到的才加；字型子集在下面產生後才雜湊，所以 CSS 與 HTML 最後處理）
const hashOf = (urlPath) => {
  const file = join(ROOT, 'public', urlPath);
  return existsSync(file) ? createHash('md5').update(readFileSync(file)).digest('hex').slice(0, 8) : null;
};
const versioned = (text) =>
  text.replace(/(?<![\w./])((?:https:\/\/luckyds\.com)?(\/(?:intro\/)?assets\/[\w./-]+\.(?:css|woff2|webp|png|jpg|svg)))(?![\w?])/g, (m, full, p) => {
    const h = hashOf(p);
    return h ? `${full}?v=${h}` : m;
  });

// 標題字子集：所有頁面的 h1–h3、標題類文字
const all = Object.values(pages).join('\n');
const display = [
  ...all.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/g),
  ...all.matchAll(/class="(?:aa-entry-title aa-display|lw-mystic|aa-cta|lw-ghost|aa-signal-mult aa-display|aa-brand)"[^>]*>([\s\S]*?)<\/(?:span|p|a|div)>/g),
  ...all.matchAll(/<b>([^<]*)<\/b>/g),
].map((m) => m[1].replace(/<[^>]+>/g, '')).join('') + '曜金數據助手0123456789×%';
execFileSync('python3', ['-c', `
import sys
from fontTools.ttLib import TTFont
from fontTools import subset
chars = {chr(c) for c in range(0x20, 0x7F)} | set('·，、：（）「」×？！') | set(sys.argv[1])
opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['kern', 'palt', 'liga']; opts.name_IDs = ['*']; opts.notdef_outline = True
f = TTFont('/usr/share/fonts/opentype/noto/NotoSerifCJK-SemiBold.ttc', fontNumber=3)
s = subset.Subsetter(opts); s.populate(text=''.join(sorted(chars))); s.subset(f)
f.flavor = 'woff2'; f.save(sys.argv[2])
`, display, join(OUT, 'assets/intro-display.woff2')]);

mkdirSync(join(OUT, 'assets'), { recursive: true });
writeFileSync(join(OUT, 'assets/assistant.css'), versioned(readFileSync(join(ROOT, 'src/assistant/assistant.css'), 'utf8')));
writeFileSync(join(OUT, 'assets/site.css'), versioned(readFileSync(join(ROOT, 'scripts/intro/site.css'), 'utf8')));
for (const [dir, html] of Object.entries(pages)) {
  const d = join(OUT, dir);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'index.html'), versioned(html));
}

console.log('built', Object.keys(pages).map((d) => '/intro/' + (d ? d + '/' : '')).join(' '));
