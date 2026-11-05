// Android App（android/）內嵌會員 SPA 時的橋接。
// App 的 WebView 會在 User-Agent 後面加上 `LuckyDsApp/<versionName>`，並注入 window.LuckyApp。

interface LuckyAppBridge {
  /** 收合助手面板，回到遊戲畫面 */
  collapse(): void;
}

declare global {
  interface Window {
    LuckyApp?: LuckyAppBridge;
  }
}

export const isNativeApp = typeof navigator !== 'undefined' && /\bLuckyDsApp\//.test(navigator.userAgent);

export function backToGame(): void {
  try {
    window.LuckyApp?.collapse();
  } catch {
    /* 舊版 App 沒有這個方法 */
  }
}
