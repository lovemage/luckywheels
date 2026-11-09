// Android App（android/）內嵌會員 SPA 時的橋接。
// App 的 WebView 會在 User-Agent 後面加上 `LuckyDsApp/<versionName>`，並注入 window.LuckyApp。
//
// 面板有兩種模式（App 1.1.0 起）：
//   full：全螢幕的網站（App 開啟時的畫面），底部「進入遊戲」切到遊戲畫面
//   dock：遊戲中點金色按鈕出現的駐守小卡，疊在遊戲上方、不擋操作；「完整助手」回到 full
// App 端掌管目前模式；網頁以 setMode() 要求切換，App 套用後以 `luckyapp:mode` 事件通知回來。

export type DockMode = 'dock' | 'full' | 'signal';

interface LuckyAppBridge {
  /** 收合面板，回到遊戲畫面 */
  collapse(): void;
  /** 1.1.0+ */
  setMode?(mode: DockMode): void;
  /** 1.1.0+：目前模式 */
  getMode?(): string;
  /** 1.1.0+：駐守小卡的內容高度（CSS px），App 依此調整小卡高度 */
  resize?(cssHeight: number): void;
  /** 1.2.0+：在遊戲裡切換到指定機台（只切換、不下注） */
  switchRoom?(roomNo: string): void;
  /** 1.3.0+：守護提醒（震動、打開駐守小卡、顯示訊息） */
  alert?(message: string): void;
  /** 1.4.0+：房間訊號達標（震動、打開訊號浮窗、顯示訊息） */
  signalHit?(message: string): void;
  /** 1.4.0+：App 支援的功能，逗號分隔（例："signal"） */
  capabilities?(): string;
}

/** 遊戲頁讀到的一轉結束盤面（App 1.4.0+）：seq 每轉遞增，counts 為各符號數量 */
export interface BoardResult {
  seq: number;
  counts: Record<string, number>;
}

/** 遊戲畫面上讀到的資訊（App 1.2.0+ 每 2 秒更新；不在遊戲頁時為 null） */
export interface GameHud {
  room: string | null;
  balance: string | null;
  win: string | null;
  stake: string | null;
  /** 1.4.0+：最近幾轉的最終盤面（由舊到新） */
  boards?: BoardResult[];
}

declare global {
  interface Window {
    LuckyApp?: LuckyAppBridge;
  }
}

export const isNativeApp = typeof navigator !== 'undefined' && /\bLuckyDsApp\//.test(navigator.userAgent);

/** App 支援駐守小卡（1.1.0+）；舊版 App 只有完整面板 */
export const hasDock = isNativeApp && typeof window !== 'undefined' && typeof window.LuckyApp?.setMode === 'function';

function call<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function backToGame(): void {
  call(() => window.LuckyApp?.collapse(), undefined);
}

const toMode = (m: unknown): DockMode => (m === 'full' || m === 'signal' ? m : 'dock');

export function currentDockMode(): DockMode {
  return call(() => toMode(window.LuckyApp?.getMode?.()), 'dock');
}

export function requestDockMode(mode: DockMode): void {
  call(() => window.LuckyApp?.setMode?.(mode), undefined);
}

export function reportDockHeight(cssHeight: number): void {
  call(() => window.LuckyApp?.resize?.(Math.ceil(cssHeight)), undefined);
}

/** 訂閱 App 端的模式變化 */
export function onDockModeChange(fn: (mode: DockMode) => void): () => void {
  const handler = (e: Event) => fn(toMode((e as CustomEvent<string>).detail));
  window.addEventListener('luckyapp:mode', handler);
  return () => window.removeEventListener('luckyapp:mode', handler);
}

/** App 支援在遊戲裡自動切換機台（1.2.0+） */
export const hasRoomSwitch = isNativeApp && typeof window !== 'undefined' && typeof window.LuckyApp?.switchRoom === 'function';

export function switchGameRoom(roomNo: string): void {
  call(() => window.LuckyApp?.switchRoom?.(roomNo), undefined);
}

/** App 支援守護提醒（1.3.0+）；舊版 App 只在小卡打開時看得到提醒 */
export const hasNativeAlert = isNativeApp && typeof window !== 'undefined' && typeof window.LuckyApp?.alert === 'function';

export function alertNative(message: string): void {
  call(() => window.LuckyApp?.alert?.(message.slice(0, 200)), undefined);
}

/** App 支援房間訊號浮窗（1.4.0+） */
export const hasSignalFloat =
  isNativeApp &&
  typeof window !== 'undefined' &&
  call(() => (window.LuckyApp?.capabilities?.() ?? '').split(',').includes('signal'), false);

export function signalHitNative(message: string): void {
  call(() => window.LuckyApp?.signalHit?.(message.slice(0, 200)), undefined);
}

// App 只在數值變化時通知，所以從頁面載入起就記住最新一筆（小卡重新掛載時直接取用）
let latestHud: GameHud | null = null;
const hudListeners = new Set<(hud: GameHud | null) => void>();
if (isNativeApp && typeof window !== 'undefined') {
  window.addEventListener('luckyapp:game', (e) => {
    latestHud = ((e as CustomEvent<GameHud | null>).detail ?? null) as GameHud | null;
    hudListeners.forEach((fn) => fn(latestHud));
  });
}

export const currentGameHud = () => latestHud;

/** 訂閱遊戲畫面資訊（目前機台等） */
export function onGameHud(fn: (hud: GameHud | null) => void): () => void {
  hudListeners.add(fn);
  return () => hudListeners.delete(fn);
}
