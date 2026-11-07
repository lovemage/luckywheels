import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { SCENE_HELPER_SOURCE } from './scene-helper.js';
import { CollectorError, type Credentials } from '../errors.js';
import { parseDetail, parseListItems, type ListRoom, type RawLabel, type RawListItem, type RoomDetail } from './parse.js';

// 一輪採集的瀏覽器流程：登入主站 → 轉點 0 進入 ATG → 開啟遊戲 → 選擇機台 → 讀列表與細項。
// 規則：不轉點（transfer_quota=0）、不下注、不按「確定」「鎖定」；只讀遊戲畫面上顯示的文字。

export const ATG_GAME_STORE = '54';

export interface AtgGame {
  code: string;
  name: string;
  resourceId: string;
  gameType: string;
}

export const GOLDEN_SETH: AtgGame = {
  code: 'golden-seth',
  name: '戰神賽特 II',
  resourceId: '22020103b31b7390f07b1551e8538589b5e51967',
  gameType: 'slot-erase-any-times-2',
};

export const PAGE_COUNT = 9;

export { CollectorError, type Credentials };

export interface RoundOptions {
  headed?: boolean;
  /** 本輪要抓細項的機台號（依優先順序）；時間不夠時依序截斷 */
  detailTargets?: (rooms: ListRoom[]) => string[] | Promise<string[]>;
  /** 細項階段的時間上限（毫秒） */
  detailBudgetMs?: number;
  /** 整輪的時間上限（毫秒）。逾時直接關閉瀏覽器並拋出 ROUND_TIMEOUT，避免卡在沒有回應的頁面上 */
  roundTimeoutMs?: number;
  log?: (msg: string) => void;
}

export interface RoundResult {
  capturedAt: Date;
  rooms: ListRoom[];
  skippedListItems: RawListItem[];
  details: RoomDetail[];
  detailFailures: string[];
  /** 第一台細項面板的原始文字，用來核對節點名稱（例如前一／前二） */
  sampleDetailLabels: RawLabel[] | null;
  timings: { loginMs: number; enterGameMs: number; listMs: number; detailMs: number; detailAvgMs: number | null };
  pressMethods: Record<string, number>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs: number, intervalMs = 250): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn().catch(() => null);
    if (v) return v;
    await sleep(intervalMs);
  }
  return null;
}

export async function runRound(creds: Credentials, game: AtgGame, opts: RoundOptions = {}): Promise<RoundResult> {
  // COLLECTOR_BROWSER_CHANNEL=chrome：改用系統安裝的 Google Chrome（本機 OS 不支援 playwright install 時）
  const browser: Browser = await chromium.launch({
    headless: !opts.headed,
    channel: process.env.COLLECTOR_BROWSER_CHANNEL || undefined,
  });
  const round = runRoundIn(browser, creds, game, opts);
  if (!opts.roundTimeoutMs) return round;

  // 看門狗：page.evaluate 等呼叫本身沒有逾時，遊戲頁沒有回應時會一直等下去（2026-11-07 整個常駐程式因此停住 9 小時）。
  // 時間到就關掉瀏覽器（讓卡住的呼叫失敗），並且不再等這一輪，直接回報 ROUND_TIMEOUT。
  const limitMs = opts.roundTimeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void browser.close().catch(() => {});
      reject(new CollectorError('ROUND_TIMEOUT', `本輪超過 ${Math.round(limitMs / 60_000)} 分鐘未完成，已中止`));
    }, limitMs);
  });
  round.catch(() => {}); // 逾時後這一輪的後續錯誤不再處理
  try {
    return await Promise.race([round, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function runRoundIn(browser: Browser, creds: Credentials, game: AtgGame, opts: RoundOptions): Promise<RoundResult> {
  const log = opts.log ?? (() => {});
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'zh-TW' });
    const t0 = Date.now();
    await login(context, creds);
    const loginMs = Date.now() - t0;
    log(`登入完成 ${loginMs}ms`);

    const t1 = Date.now();
    const page = await enterGame(context, creds, game);
    const enterGameMs = Date.now() - t1;
    log(`已進入選擇機台 ${enterGameMs}ms`);

    const pressMethods: Record<string, number> = {};
    const press = async (expr: string) => {
      const res = (await page.evaluate(expr)) as { method: string | null; point: { x: number; y: number; inside: boolean } | null } | null;
      if (!res) return false;
      if (res.method) {
        pressMethods[res.method] = (pressMethods[res.method] ?? 0) + 1;
      } else if (res.point?.inside) {
        await page.mouse.click(res.point.x, res.point.y);
        pressMethods.mouse = (pressMethods.mouse ?? 0) + 1;
      } else {
        return false;
      }
      return true;
    };

    // 切到第 p 頁：讀到的機台號全落在該頁範圍、且連續兩次讀取台數相同才算完成；
    // 偶爾切頁請求沒有回應（讀到 0 台），5 秒沒資料就重按，最多 3 次。
    const openPage = async (p: number): Promise<RawListItem[]> => {
      const lo = (p - 1) * 500 + 1;
      const hi = p * 500;
      let lastCount = -1;
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (!(await press(`window.__lw.pressPage(${p})`))) throw new CollectorError('ROOM_LIST_FAILED', `找不到分頁 ${p}`);
        const items = await waitFor(async () => {
          const list = (await page.evaluate('window.__lw.readList()')) as RawListItem[];
          const inRange = list.length > 0 && list.every((i) => i.roomNo && Number(i.roomNo) >= lo && Number(i.roomNo) <= hi);
          const stable = inRange && list.length === lastCount;
          lastCount = inRange ? list.length : -1;
          return stable ? list : null;
        }, 5_000);
        if (items) return items;
        log(`分頁 ${p} 第 ${attempt} 次沒有回應，重試`);
      }
      await saveDebug(page, `page-${p}-timeout`);
      throw new CollectorError('ROOM_LIST_FAILED', `分頁 ${p} 讀取逾時`);
    };

    // 列表層：逐頁切換
    const t2 = Date.now();
    const rawItems: RawListItem[] = [];
    for (let p = 1; p <= PAGE_COUNT; p++) {
      const items = await openPage(p);
      rawItems.push(...items);
      log(`分頁 ${p}：${items.length} 台`);
    }
    const capturedAt = new Date();
    const { rooms, skipped } = parseListItems(rawItems);
    const listMs = Date.now() - t2;

    // 細項層：選取機台（不按確定），等面板機台號換成目標後讀取
    const t3 = Date.now();
    const targets = (await opts.detailTargets?.(rooms)) ?? [];
    const details: RoomDetail[] = [];
    const detailFailures: string[] = [];
    let sampleDetailLabels: RawLabel[] | null = null;
    let currentPage = PAGE_COUNT;
    for (const roomNo of targets) {
      if (opts.detailBudgetMs && Date.now() - t3 > opts.detailBudgetMs) break;
      const page_ = Math.floor((Number(roomNo) - 1) / 500) + 1;
      if (page_ !== currentPage) {
        await openPage(page_);
        currentPage = page_;
      }
      if (!(await press(`window.__lw.pressRoom(${JSON.stringify(roomNo)})`))) {
        detailFailures.push(roomNo);
        continue;
      }
      const labels = await waitFor(async () => {
        const l = (await page.evaluate('window.__lw.readDetail()')) as RawLabel[] | null;
        return l && parseDetail(l)?.roomNo === roomNo ? l : null;
      }, 8_000, 150);
      const detail = labels && parseDetail(labels);
      if (!detail) {
        detailFailures.push(roomNo);
        continue;
      }
      sampleDetailLabels ??= labels;
      details.push(detail);
    }
    const detailMs = Date.now() - t3;

    return {
      capturedAt,
      rooms,
      skippedListItems: skipped,
      details,
      detailFailures,
      sampleDetailLabels,
      timings: {
        loginMs,
        enterGameMs,
        listMs,
        detailMs,
        detailAvgMs: details.length ? Math.round(detailMs / details.length) : null,
      },
      pressMethods,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function login(context: BrowserContext, creds: Credentials) {
  const origin = new URL(creds.casinoUrl).origin;
  const res = await context.request.post(`${origin}/mobile/op/sty1_home_op.php?pdisplay=login`, {
    form: { userid: creds.account, passwd: creds.password, lang: 'tw' },
    headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: `${origin}/mobile/sty4_home.php` },
  });
  const body = await res.text();
  // 成功時回 location.reload()；失敗時是錯誤訊息彈窗（不把回應內容寫進 log，避免夾帶帳號資訊）
  if (!res.ok() || !body.includes('location.reload')) {
    throw new CollectorError('LOGIN_FAILED', `登入失敗（HTTP ${res.status()}）`);
  }
}

async function enterGame(context: BrowserContext, creds: Credentials, game: AtgGame): Promise<Page> {
  const origin = new URL(creds.casinoUrl).origin;
  const page = await context.newPage();
  // 轉點頁會自動以 transfer_quota=0 呼叫「進入遊戲」，再導向 ATG 大廳（同分頁或新分頁）
  const lobbyPage = await Promise.race([
    page.waitForURL(/godeebxp\.com/, { timeout: 30_000 }).then(() => page),
    context.waitForEvent('page', { timeout: 30_000 }).then(async (p) => {
      await p.waitForURL(/godeebxp\.com/, { timeout: 30_000 });
      return p;
    }),
    page.goto(`${origin}/mobile/check_games.php?game_store=${ATG_GAME_STORE}&type=0&transfer_quota=`).then(() => new Promise<never>(() => {})),
  ]).catch(() => null);
  if (!lobbyPage) throw new CollectorError('ENTER_GAME_FAILED', '未導向 ATG 大廳');

  // 大廳（Vue 頁面）：依卡片圖片網址中的資源 ID 找到該遊戲，按它的「開始遊戲」。
  // 遊戲用的 token 由大廳發出，大廳網址上的 t= 不能直接開遊戲（會出現「找不到 Token 資料」）。
  const startButton = lobbyPage.locator(`.card:has(img[src*="/egames/${game.resourceId}/"]) button`, { hasText: '開始遊戲' });
  try {
    await startButton.first().waitFor({ state: 'attached', timeout: 30_000 });
  } catch {
    await saveDebug(lobbyPage, 'lobby-card-missing');
    throw new CollectorError('ENTER_GAME_FAILED', `大廳找不到遊戲 ${game.name}`);
  }
  const gamePage = await Promise.race([
    lobbyPage.waitForURL(/\/egames\/[0-9a-f]{40}\/game\//, { timeout: 30_000 }).then(() => lobbyPage),
    context.waitForEvent('page', { timeout: 30_000 }).then(async (p) => {
      await p.waitForURL(/\/egames\/[0-9a-f]{40}\/game\//, { timeout: 30_000 });
      return p;
    }),
    startButton.first().click({ force: true }).then(() => new Promise<never>(() => {})),
  ]).catch(() => null);
  if (!gamePage) {
    await saveDebug(lobbyPage, 'game-not-opened');
    throw new CollectorError('ENTER_GAME_FAILED', `無法開啟遊戲 ${game.name}`);
  }

  const ready = await waitFor(async () => {
    await gamePage.evaluate(SCENE_HELPER_SOURCE);
    return (await gamePage.evaluate('window.__lw.ready()')) as boolean;
  }, 60_000, 1000);
  if (!ready) throw new CollectorError('SCENE_NOT_READY', '遊戲場景未載入');

  // 開始畫面 →「開始遊戲」→ 跳出選擇機台
  const opened = await waitFor(async () => {
    const list = (await gamePage.evaluate('window.__lw.readList()')) as RawListItem[];
    if (list.length > 0) return true;
    const res = (await gamePage.evaluate('window.__lw.pressText("開始遊戲")')) as { method: string | null; point: { x: number; y: number; inside: boolean } | null } | null;
    if (res && !res.method && res.point?.inside) await gamePage.mouse.click(res.point.x, res.point.y);
    return false;
  }, 60_000, 2000);
  if (!opened) {
    await saveDebug(gamePage, 'select-room-missing');
    throw new CollectorError('SCENE_NOT_READY', '選擇機台未出現');
  }
  return gamePage;
}

// COLLECTOR_DEBUG_DIR 有設定時，失敗當下存截圖與場景文字節點（不含 token：網址不寫入）
async function saveDebug(page: Page, name: string) {
  const dir = process.env.COLLECTOR_DEBUG_DIR;
  if (!dir) return;
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png` }).catch(() => {});
  const labels = await page.evaluate('window.__lw && window.__lw.debug()').catch((e) => String(e));
  writeFileSync(`${dir}/${name}.json`, JSON.stringify(labels, null, 2));
}
