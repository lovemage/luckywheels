// Android App（android/）內嵌會員 SPA 時的橋接。
// App 的 WebView 會在 User-Agent 後面加上 `LuckyDsApp/<versionName>`，並注入 window.LuckyApp。
//
// 面板有兩種模式（App 1.1.0 起）：
//   dock：駐守小卡，疊在遊戲上方、不擋操作，只放機台數據與「換一台」
//   full：完整助手（兌換、本金推薦、規則），從小卡的「完整助手」進入
// App 端掌管目前模式；網頁以 setMode() 要求切換，App 套用後以 `luckyapp:mode` 事件通知回來。

export type DockMode = 'dock' | 'full';

interface LuckyAppBridge {
  /** 收合面板，回到遊戲畫面 */
  collapse(): void;
  /** 1.1.0+ */
  setMode?(mode: DockMode): void;
  /** 1.1.0+：目前模式 */
  getMode?(): string;
  /** 1.1.0+：駐守小卡的內容高度（CSS px），App 依此調整小卡高度 */
  resize?(cssHeight: number): void;
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

export function currentDockMode(): DockMode {
  return call(() => (window.LuckyApp?.getMode?.() === 'full' ? 'full' : 'dock'), 'dock');
}

export function requestDockMode(mode: DockMode): void {
  call(() => window.LuckyApp?.setMode?.(mode), undefined);
}

export function reportDockHeight(cssHeight: number): void {
  call(() => window.LuckyApp?.resize?.(Math.ceil(cssHeight)), undefined);
}

/** 訂閱 App 端的模式變化 */
export function onDockModeChange(fn: (mode: DockMode) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<string>).detail === 'full' ? 'full' : 'dock');
  window.addEventListener('luckyapp:mode', handler);
  return () => window.removeEventListener('luckyapp:mode', handler);
}
