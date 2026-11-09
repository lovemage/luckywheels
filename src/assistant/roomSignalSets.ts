import type { SignalSymbol } from '../api/assistant.js';

// 房間訊號「第幾組」：每台每天依序 5 組（GET /api/assistant/room-signal 的 sets），
// 會員買完免遊按「換一組」就往下一組。記在本機（localStorage），網頁查房號、App 浮窗、駐守小卡共用。
// 以第 1 組的 key 當版本：伺服器那邊換新（隔天、偵測到自然開出免遊）時 key 會變，組數自動回到第 1 組。

export interface RoomSignalSet {
  key: string;
  symbols: { symbol: SignalSymbol; count: number }[];
}

export interface RoomSignalResponse {
  roomNo: string;
  /** 第 1 組的 key（舊欄位） */
  key: string;
  /** 第 1 組的符號（舊欄位；舊版伺服器只有這個） */
  symbols: RoomSignalSet['symbols'];
  /** 整串訊號；舊版伺服器沒有 */
  sets?: RoomSignalSet[];
  disclaimer: string;
}

const KEY = 'lw.roomSignal.sets';
type Stored = Record<string, { base: string; index: number }>;
// 房號是數字，物件的整數鍵會被排到最前面、打亂「最近使用」順序，所以加前綴
const slot = (roomNo: string) => `r${roomNo}`;

function readAll(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

const listeners = new Set<() => void>();
export function subscribeSetIndex(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
// App 的浮窗與完整助手是不同的 WebView：另一邊換組時跟著更新
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => e.key === KEY && listeners.forEach((fn) => fn()));
}

export const setsOf = (r: RoomSignalResponse): RoomSignalSet[] => (r.sets?.length ? r.sets : [{ key: r.key, symbols: r.symbols }]);

/** 目前用第幾組（0 起算）；版本不同或超出範圍時回到第 1 組 */
export function currentSetIndex(r: RoomSignalResponse): number {
  const s = readAll()[slot(r.roomNo)];
  const total = setsOf(r).length;
  return s && s.base === r.key && Number.isInteger(s.index) && s.index >= 0 && s.index < total ? s.index : 0;
}

export function saveSetIndex(r: RoomSignalResponse, index: number) {
  const all = readAll();
  delete all[slot(r.roomNo)]; // 重新放到最後＝最近使用
  all[slot(r.roomNo)] = { base: r.key, index };
  // 只留最近 30 台
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - 30))) delete all[k];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* 無痕模式：只在這次頁面有效 */
  }
  listeners.forEach((fn) => fn());
}
