#!/usr/bin/env node
// 產生介紹網站（public/intro/**）：五個靜態頁面＋共用樣式。
//   node scripts/build-intro.mjs
// - 元件外觀沿用數據助手：從 src/assistant/assistant.css 複製成 public/intro/assets/assistant.css，
//   助手改了樣式後重跑一次即可同步。網站版面在 scripts/intro/site.css。
// - 主視覺光柱（scripts/intro/pillars.svg）取自助手首頁 LightPillars 的渲染結果（固定種子，與助手一致）。
// - 標題字：從所有頁面的標題文字產生子集 public/intro/assets/intro-display.woff2（需要 python3 + fonttools + brotli）。
// - 每頁各自的 OG 圖在 public/intro/assets/og/*.jpg（底圖由 Codex CLI 生成，再疊上標題）。
// - 畫面中的機台數字都是示意數據，頁面上一律標示。

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/intro');
const ORIGIN = 'https://luckyds.com';
const APK = '/downloads/luckyds-assistant.apk';
const APP_VERSION = '1.3.0';

const pillars = readFileSync(join(ROOT, 'scripts/intro/pillars.svg'), 'utf8');

// ── 圖示（單一筆畫風格） ──
const ICON = {
  android: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.6 9.48 19.44 6.3a.38.38 0 0 0-.66-.38l-1.86 3.22a11.5 11.5 0 0 0-9.84 0L5.22 5.92a.38.38 0 1 0-.66.38L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52ZM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z"/></svg>',
  apple: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.7c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.8-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8s2.2-1.3 3.1-2.5c1-1.4 1.4-2.8 1.4-2.9 0 0-2.8-1.1-2.9-4.2ZM13.9 5.2c.7-.8 1.2-2 1-3.2-1 0-2.2.7-3 1.5-.6.7-1.2 1.9-1 3.1 1.1.1 2.3-.6 3-1.4Z"/></svg>',
  line: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5C6.5 2.5 2 6.1 2 10.6c0 4 3.6 7.4 8.4 8 .3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5 1.1-.5 5.9-3.5 8-6 1.5-1.6 2.2-3.2 2.2-5C22 6.1 17.5 2.5 12 2.5Zm-3.7 10.6H6.4a.5.5 0 0 1-.5-.5V8.8a.5.5 0 0 1 1 0v3.3h1.4a.5.5 0 0 1 0 1Zm2-.5a.5.5 0 0 1-1 0V8.8a.5.5 0 0 1 1 0v3.8Zm4.5 0a.5.5 0 0 1-.9.3l-1.9-2.6v2.3a.5.5 0 0 1-1 0V8.8a.5.5 0 0 1 .9-.3l1.9 2.6V8.8a.5.5 0 0 1 1 0v3.8Zm3.1-2.4a.5.5 0 0 1 0 1h-1.4v.9h1.4a.5.5 0 0 1 0 1h-1.9a.5.5 0 0 1-.5-.5V8.8c0-.3.2-.5.5-.5h1.9a.5.5 0 0 1 0 1h-1.4v.9h1.4Z"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>',
  corner: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M3.5 4.5h17v15h-17z"/><path fill="currentColor" d="M5.5 6.5h7v4.5h-7z"/></svg>',
  switch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6L12 3Z"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M8.5 12h7"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/></svg>',
};

const MARK = `<svg class="aa-mark" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lw-mark-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0c2"/><stop offset="0.5" stop-color="#e7b552"/><stop offset="1" stop-color="#9c6a1c"/></linearGradient></defs><path d="M16 1 L19 13 L31 16 L19 19 L16 31 L13 19 L1 16 L13 13 Z" fill="url(#lw-mark-gold)"/><path d="M16 7 L17.4 14.6 L25 16 L17.4 17.4 L16 25 L14.6 17.4 L7 16 L14.6 14.6 Z" fill="#120c05" opacity="0.55"/><circle cx="16" cy="16" r="1.6" fill="#fff6d8"/></svg>`;

const ink = (key, alt, cls = 'lw-ink-h') => `<img class="${cls}" src="/assets/assistant/ink/title-${key}.webp" alt="${alt}" draggable="false">`;
const demo = '<span class="lw-demo">示意數據</span>';

// ── 導覽 ──
const PAGES = [
  { id: 'home', path: '/intro/', label: '首頁', icon: '<img src="/assets/assistant/ink/icon-home.webp" alt="">' },
  { id: 'rules', path: '/intro/rules/', label: '曜金規則', tab: '規則', icon: '<img src="/assets/assistant/ink/icon-rules.webp" alt="">' },
  { id: 'signal', path: '/intro/signal/', label: '曜金訊號', tab: '訊號', icon: '<img src="/assets/assistant/metal/gold.webp" alt="">' },
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
  <a class="aa-brand" href="/intro/">${MARK}<span>曜金數據助手</span></a>
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

const subhero = (art, heading, lead) => `<section class="lw-subhero" style="--lw-art:url('/intro/assets/og/${art}-art.webp')">
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

const METAL = { silver: '銀', gold: '黃金', platinum: '白金', obsidian: '曜金' };
const signalPlate = (symbols, strength) => `<div class="aa-signal-plate">
  <ul class="aa-signal-symbols" data-count="${symbols.length}">
${symbols.map(([k, m], i) => `    <li class="aa-signal-cell" style="--i: ${i};"><img alt="" width="72" height="72" draggable="false" src="/assets/assistant/metal/${k}.webp"><span class="aa-signal-mult aa-display" aria-label="${METAL[k]} ${m} 倍"><span aria-hidden="true"><span class="aa-signal-x">×</span>${m}</span></span><span class="aa-signal-name" aria-hidden="true">${METAL[k]}</span></li>`).join('\n')}
  </ul>
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

// ════════════════ 首頁 ════════════════
const home = shell('home', {
  title: '曜金數據助手｜金光之下，每台機台都有紀錄',
  description: '曜金數據助手把 ATG 數千台機台的紀錄排成一道看得見的光：精選空台、本金推薦、曜金訊號，遊戲中也能隨時叫出。LINE 登入，用幸運輪盤的積分開通。',
  ogTitle: '曜金數據助手',
  ogDesc: '金光之下，每台機台都有紀錄。LINE 登入轉輪盤，積分開通數據助手。',
  body: `<section class="aa-hero" aria-labelledby="hero-title">
  <img class="aa-tiger" alt="" aria-hidden="true" draggable="false" src="/assets/assistant/tiger.webp">
  ${pillars}
  <div class="aa-hero-copy">
    <h1 id="hero-title" class="aa-display aa-ink-title">${ink('hero', '機台數據 一眼看清', '')}</h1>
    <p class="aa-hero-sub">ATG 房間整理 · 本金條件篩選</p>
    <div class="aa-hero-space" aria-hidden="true"></div>
  </div>
</section>
<div class="lw-wrap lw-hero-after">
  <p class="lw-hero-lead">每一台機台都留下了紀錄。金光升起的地方，曜金替你把它們讀出來。</p>
  ${ctaPair}
  <p class="lw-meta">Android ${APP_VERSION} · iPhone 請先使用網頁版</p>
</div>

<div class="lw-wrap">
  <section class="lw-band" aria-labelledby="intro-title">
    <div class="lw-grid is-center">
      <div>
        <div class="aa-section-head"><h2 id="intro-title" class="aa-display">它不猜，它只看</h2></div>
        <p class="lw-mystic">曜金不替你按下轉動，也不說下一轉會怎樣。它只做一件事：把散落在數千台機台上的紀錄，排成一道你看得見的光。</p>
        <p class="lw-lead" style="margin-top:14px">同一個 LINE 帳號、同一份積分：可以拿去轉幸運輪盤，也可以換成曜金的使用時間。</p>
      ${symbolStrip}
      </div>
      <nav class="aa-entries" aria-label="網站內容">
        <a class="aa-entry" href="/intro/rules/"><span class="aa-entry-icon" aria-hidden="true"><img class="aa-ink-icon" alt="" src="/assets/assistant/ink/icon-rules.webp"></span><span class="aa-entry-copy"><span class="aa-entry-title aa-display">曜金規則</span><span class="aa-entry-sub">數字怎麼讀</span></span></a>
        <a class="aa-entry" href="/intro/signal/"><span class="aa-entry-icon" aria-hidden="true"><img class="aa-ink-icon" alt="" src="/assets/assistant/metal/gold.webp"></span><span class="aa-entry-copy"><span class="aa-entry-title aa-display">曜金訊號</span><span class="aa-entry-sub">四種元寶</span></span></a>
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
    <div class="aa-section-head"><h2 id="ingame-title" class="aa-display">遊戲裡，它安靜地守在一角</h2></div>
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
        ${signalPlate([['gold', 3], ['platinum', 5], ['obsidian', 2]], 92)}
        <div class="lw-panel-foot"><p class="aa-disclaimer" style="margin:0">強度依機台綜合分數換算 · 排序參考</p>${demo}</div>
      </div>
      <div>
        <div class="aa-section-head"><h2 id="signal-title" class="aa-display">曜金訊號</h2></div>
        <p class="lw-mystic">銀、黃金、白金、曜金。每一組元寶，都對應著某一台此刻符合條件、無人入座的機台。</p>
        <p class="lw-lead" style="margin-top:12px">那台機台是哪一台，畫面上不會說；機台一有變化，訊號就自動換成新的一組。</p>
        <p style="margin-top:18px"><a href="/intro/signal/">讀懂曜金訊號 ›</a></p>
      </div>
    </div>
  </section>

  <section class="lw-band" aria-labelledby="start-title">
    <div class="aa-section-head"><h2 id="start-title" class="aa-display">三步，開啟曜金</h2></div>
    <ol class="lw-steps is-cols">
      <li><div><b>LINE 登入</b><p>不用另外註冊。登入後就是會員，可以轉幸運輪盤。</p></div></li>
      <li><div><b>積分開通</b><p>把輪盤積分換成使用時間，<em>不用另外儲值</em>。使用中再換會往後延長。</p></div></li>
      <li><div><b>帶進遊戲</b><p>Android 安裝 App，遊戲中隨時叫出駐守小卡；iPhone 先用網頁版。</p></div></li>
    </ol>
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
  body: `${subhero('rules', `<h1 class="aa-ink-title">${ink('rules', '曜金規則', '')}</h1>`, '每個數字都是一段已經發生的紀錄。讀懂它們，才看得懂曜金替你排出的順序。')}
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
        <div class="aa-section-head"><h2 id="rule-score-title" class="aa-display aa-ink-title">${ink('score', '助手怎麼排序')}</h2></div>
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
    <div class="aa-section-head"><h2 id="symbols-title" class="aa-display aa-ink-title">${ink('game', '戰神賽特 II')}</h2><span class="aa-section-note">盤面符號</span></div>
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
  title: '曜金訊號｜四種元寶，一組只屬於此刻｜曜金數據助手',
  description: '曜金訊號由銀、黃金、白金、曜金四種元寶與倍數組成，每一組都對應一台發出當下符合條件、無人入座的機台；機台一有變化就自動換組。',
  ogTitle: '曜金訊號｜四種元寶，一組只屬於此刻',
  ogDesc: '銀、黃金、白金、曜金。每一組訊號，都對應著此刻某一台符合條件的空台。',
  body: `${subhero('signal', '<h1>曜金訊號</h1>', '四種元寶，排成一組只屬於此刻的訊號。它背後是一台真實存在、此刻無人入座的機台。')}
<div class="lw-wrap">
  <section class="lw-band" aria-labelledby="what-title">
    <div class="lw-grid is-center">
      <div class="lw-panel">
        ${signalPlate([['silver', 4], ['gold', 3], ['obsidian', 6]], 88)}
        <div class="lw-panel-foot"><p class="aa-disclaimer" style="margin:0">發出 21:06 · 排序參考，不代表遊戲結果</p>${demo}</div>
      </div>
      <div>
        <div class="aa-section-head"><h2 id="what-title" class="aa-display">訊號是什麼</h2></div>
        <p class="lw-mystic">每一組訊號，都綁著一台發出當下符合條件、目前沒人使用的機台。</p>
        <p class="lw-lead" style="margin-top:12px">那台機台是哪一台，畫面上不會顯示；訊號只在開通期間、於助手首頁出現，一次一組。</p>
      </div>
    </div>
  </section>

  <section class="lw-band" aria-labelledby="metal-title">
    <div class="aa-section-head"><h2 id="metal-title" class="aa-display">四種元寶</h2></div>
    <ul class="lw-metals">
      <li><img src="/assets/assistant/metal/silver.webp" alt="" width="76" height="76"><b>銀</b><span>素白的光</span></li>
      <li><img src="/assets/assistant/metal/gold.webp" alt="" width="76" height="76"><b>黃金</b><span>溫熱的光</span></li>
      <li><img src="/assets/assistant/metal/platinum.webp" alt="" width="76" height="76"><b>白金</b><span>冷冽的光</span></li>
      <li><img src="/assets/assistant/metal/obsidian.webp" alt="" width="76" height="76"><b>曜金</b><span>藏在黑裡的光</span></li>
    </ul>
    <ul class="aa-reasons aa-rule-points" style="margin-top:18px">
      <li>每組訊號由 2–3 種元寶加上倍數組成，用來區分不同的訊號</li>
      <li>元寶的種類與倍數本身不代表大小或好壞，真正的差別看「訊號強度」</li>
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
        </ul>
      </section>
      <section class="aa-rule" aria-labelledby="refresh-title" style="margin:0">
        <div class="aa-section-head"><h2 id="refresh-title" class="aa-display">免遊結束，換一組</h2></div>
        <ul class="aa-reasons aa-rule-points">
          <li>玩完一輪免費遊戲後，可以按「免遊結束，換一組」取得新訊號</li>
          <li>剛換過需要稍候一段時間才能再換</li>
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
  body: `${subhero('wheel', '<h1>幸運輪盤</h1>', '指針停下之前，誰也不知道。LINE 登入，就能轉動今天的手氣。')}
<div class="lw-wrap">
  <section class="lw-band" aria-labelledby="wheel-how">
    <div class="lw-grid is-center">
      <figure class="lw-shot lw-phone">
        <img src="/intro/assets/shot-wheel.webp" width="780" height="1688" loading="lazy" decoding="async" alt="幸運輪盤畫面：六個獎項的金色輪盤、會員積分與抽獎按鈕">
      </figure>
      <div>
        <div class="aa-section-head"><h2 id="wheel-how" class="aa-display">怎麼轉</h2></div>
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
        <div class="aa-section-head"><h2 id="exchange-title" class="aa-display aa-ink-title">${ink('exchange', '積分兌換')}</h2></div>
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
  body: `${subhero('install', '<h1>把助手帶進遊戲裡</h1>', '安裝 App 之後，曜金就守在遊戲畫面的一角。需要時喚出，不需要時收成一顆金色按鈕。')}
<div class="lw-wrap">
  <section class="lw-band" aria-labelledby="dock-title">
    <div class="lw-grid is-center">
      <div>
        <div class="aa-section-head"><h2 id="dock-title" class="aa-display">駐守小卡</h2></div>
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

  <section class="lw-band" id="android" aria-labelledby="android-title">
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
        <li><div><b>LINE 登入、進入遊戲</b><p>在 App 裡用 LINE 登入，按<em>進入遊戲</em>登入娛樂城。遊戲中點左側金色按鈕，就能喚出駐守小卡。</p></div></li>
      </ol>
      <p class="lw-lead" style="margin-top:18px">在 LINE 裡打開這頁的話，先點右上角選單「以預設瀏覽器開啟」再下載。<a href="/android/">完整安裝說明（含各品牌手機設定）</a></p>
    </div>
  </section>

  <!-- iOS：App 尚未推出。上架後把 .is-soon 這塊換成與 #android 相同的結構（下載按鈕＋安裝步驟） -->
  <section class="lw-band" id="ios" data-status="coming-soon" aria-labelledby="ios-title">
    <div class="lw-platform is-soon">
      <div class="lw-platform-head">
        <h2 id="ios-title" class="aa-display">${ICON.apple}iPhone</h2>
        <span class="lw-soon">準備中</span>
      </div>
      <p class="lw-lead">iPhone App 還在準備中。現在請用 Safari 開啟網頁版，LINE 登入後一樣能轉輪盤、看機台數據與本金推薦。App 推出後，安裝方式會放在這裡。</p>
      <p style="margin-top:16px"><a class="lw-ghost" href="/">${ICON.line}開啟網頁版</a></p>
    </div>
  </section>

  <section class="lw-band" aria-labelledby="faq-title">
    <div class="aa-section-head"><h2 id="faq-title" class="aa-display">常見問題</h2></div>
    <div class="lw-faq">
      <details><summary>需要另外註冊或付費嗎？${ICON.plus}</summary><p>不用另外註冊，用 LINE 登入就好。數據助手用輪盤的會員積分兌換使用時間，不需要另外付費。</p></details>
      <details><summary>用了助手會比較容易中嗎？${ICON.plus}</summary><p>不會。每一轉的結果都由遊戲伺服器決定，曜金只把已發生的機台紀錄整理、排序給你參考，不改變也不預測結果。請量力而為、先設好預算。</p></details>
      <details><summary>支援哪些遊戲？${ICON.plus}</summary><p>目前支援 ATG 的戰神賽特 II。</p></details>
      <details><summary>安裝時跳出「檔案可能有害」怎麼辦？${ICON.plus}</summary><p>這是 Chrome 對所有 Play 商店以外安裝檔的固定提醒，按「仍要下載」即可。請只從 luckyds.com 下載安裝檔。</p></details>
      <details><summary>娛樂城帳號會不會被助手拿走？${ICON.plus}</summary><p>娛樂城是在娛樂城自己的頁面登入，助手不讀取、也不儲存你的娛樂城帳號密碼。App 只讀遊戲畫面上的機台號和點數，用來顯示數據和計算本場損益。</p></details>
    </div>
  </section>
</div>`,
});

// ── 輸出 ──
const pages = { '': home, rules, signal, wheel, install };
for (const [dir, html] of Object.entries(pages)) {
  const d = join(OUT, dir);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'index.html'), html);
}
mkdirSync(join(OUT, 'assets'), { recursive: true });
copyFileSync(join(ROOT, 'src/assistant/assistant.css'), join(OUT, 'assets/assistant.css'));
copyFileSync(join(ROOT, 'scripts/intro/site.css'), join(OUT, 'assets/site.css'));

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

console.log('built', Object.keys(pages).map((d) => '/intro/' + (d ? d + '/' : '')).join(' '));
