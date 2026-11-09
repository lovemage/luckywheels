// 房間訊號（App 1.4.0+ 遊戲內浮窗）：會員目前坐的機台有一組符號門檻（GET /api/assistant/room-signal），
// App 從遊戲頁讀出每一轉結束時的盤面，這裡比對「各符號數量都達到門檻」就提醒可買免遊。
// 只提醒，不替會員按任何按鈕。狀態放在模組層級：浮窗收起來時照樣比對。

import { api, ApiError } from '../../api/client.js';
import type { SignalSymbol } from '../../api/assistant.js';
import { currentGameHud, isNativeApp, onGameHud, signalHitNative, type BoardResult, type GameHud } from '../../native.js';
import { atgSymbol } from '../atgSymbols.js';

export interface RoomSignalSymbol {
  symbol: SignalSymbol;
  count: number;
}

interface RoomSignalResponse {
  roomNo: string;
  key: string;
  symbols: RoomSignalSymbol[];
  disclaimer: string;
}

export type RoomSignalStatus = 'off' | 'no-room' | 'loading' | 'ready' | 'expired' | 'error';

export interface RoomSignalState {
  enabled: boolean;
  status: RoomSignalStatus;
  roomNo: string | null;
  symbols: RoomSignalSymbol[] | null;
  /** 最近一轉結束時的各符號數量 */
  counts: Record<string, number> | null;
  /** 最近一轉是否達標 */
  hit: boolean;
  /** 今天（本機日期）達標次數 */
  today: number;
}

const KEY_ON = 'lw.roomSignal.on';
const KEY_TODAY = 'lw.roomSignal.today';
const REFRESH_MS = 60_000;

const localDate = () => new Date().toLocaleDateString('en-CA');

function readToday(): number {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_TODAY) ?? 'null');
    return raw?.date === localDate() && Number.isInteger(raw.count) ? raw.count : 0;
  } catch {
    return 0;
  }
}

function saveToday(count: number) {
  try {
    localStorage.setItem(KEY_TODAY, JSON.stringify({ date: localDate(), count }));
  } catch {
    /* 無痕模式：不保存 */
  }
}

function readOn(): boolean {
  try {
    return localStorage.getItem(KEY_ON) === '1';
  } catch {
    return false;
  }
}

const initiallyOn = readOn();
let state: RoomSignalState = {
  enabled: initiallyOn,
  status: initiallyOn ? 'no-room' : 'off',
  roomNo: null,
  symbols: null,
  counts: null,
  hit: false,
  today: readToday(),
};
const listeners = new Set<() => void>();
const set = (next: Partial<RoomSignalState>) => {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
};

export const roomSignalState = () => state;
export function subscribeRoomSignal(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 各符號都達到門檻 */
export const meets = (symbols: RoomSignalSymbol[], counts: Record<string, number>) =>
  symbols.length > 0 && symbols.every((s) => (counts[s.symbol] ?? 0) >= s.count);

/** 「訊號達標！眼睛 4/3、鐮刀 2/2 可買免遊」（現有／門檻） */
export const hitMessage = (symbols: RoomSignalSymbol[], counts: Record<string, number>) =>
  `訊號達標！${symbols.map((s) => `${atgSymbol(s.symbol).name} ${counts[s.symbol] ?? 0}/${s.count}`).join('、')} 可買免遊`;

let fetchSeq = 0;
let timer: number | null = null;

async function load(roomNo: string) {
  const mine = ++fetchSeq;
  if (state.roomNo !== roomNo || !state.symbols) set({ status: 'loading', symbols: null });
  try {
    const r = await api<RoomSignalResponse>(`/api/assistant/room-signal?roomNo=${encodeURIComponent(roomNo)}`);
    if (mine !== fetchSeq) return;
    set({ status: 'ready', symbols: r.symbols });
  } catch (e) {
    if (mine !== fetchSeq) return;
    set({ status: e instanceof ApiError && e.code === 'ASSISTANT_EXPIRED' ? 'expired' : 'error' });
  }
}

function schedule() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  if (!state.enabled) return;
  timer = window.setInterval(() => state.roomNo && void load(state.roomNo), REFRESH_MS);
}

// 已處理過的盤面（遊戲重新載入後 seq 會從頭算，所以連同遊戲頁的 sid 一起記）
const seen = new Set<string>();
const boardId = (b: BoardResult & { sid?: string }) => `${b.sid ?? ''}:${b.seq}`;

function onHud(hud: GameHud | null) {
  const roomNo = hud?.room ?? null;
  if (roomNo !== state.roomNo) {
    set({ roomNo, symbols: null, counts: null, hit: false, status: state.enabled ? (roomNo ? 'loading' : 'no-room') : 'off' });
    if (state.enabled && roomNo) void load(roomNo);
  }
  const boards = (hud?.boards ?? []) as (BoardResult & { sid?: string })[];
  for (const b of boards) {
    const id = boardId(b);
    if (seen.has(id)) continue;
    seen.add(id);
    if (seen.size > 200) seen.delete(seen.values().next().value!);
    const hit = !!state.symbols && meets(state.symbols, b.counts);
    set({ counts: b.counts, hit });
    if (hit && state.enabled && state.symbols) {
      const today = readToday() + 1;
      saveToday(today);
      set({ today });
      signalHitNative(hitMessage(state.symbols, b.counts));
    }
  }
}

if (isNativeApp && typeof window !== 'undefined') {
  onGameHud(onHud);
  // 頁面載入前就已經有的盤面不再提醒
  for (const b of (currentGameHud()?.boards ?? []) as (BoardResult & { sid?: string })[]) seen.add(boardId(b));
}

/** 打開浮窗時開啟比對；關閉後不再提醒 */
export function setRoomSignalEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY_ON, on ? '1' : '0');
  } catch {
    /* 不保存 */
  }
  set({ enabled: on, today: readToday(), status: on ? (state.roomNo ? 'loading' : 'no-room') : 'off' });
  if (on && state.roomNo) void load(state.roomNo);
  schedule();
}

if (state.enabled && typeof window !== 'undefined') schedule();

/** 只顯示（駐守小卡、完整助手）：載入目前機台的訊號門檻，但不開啟達標提醒 */
export function ensureRoomSignal() {
  if (state.roomNo && !state.symbols && state.status !== 'loading') void load(state.roomNo);
}
