// 房間訊號（App 1.4.0+ 遊戲內浮窗）：會員目前坐的機台有一組符號門檻（GET /api/assistant/room-signal），
// App 從遊戲頁讀出每一轉結束時的盤面，這裡比對各符號數量：大圖（高分符號、甲蟲、彩甲）剛好等於門檻、寶石大於等於門檻，
// 全部成立就提醒可買免遊（2026-11-10 業主）。
// 只提醒，不替會員按任何按鈕。狀態放在模組層級：浮窗收起來時照樣比對。
// 每台每天依序 5 組訊號；目前第幾組記在 roomSignalSets（與網頁版查房號共用），會員買完免遊按「換一組」往下。
// 免遊中轉出來的盤面不比對、不提醒（App 1.5.2+ 讀得到免遊狀態；2026-11-10 業主）。
// 自訂訊號（2026-11-11 業主）：會員自己設定各符號目標（0＝不看），一律「大於等於」目標；存在本機，不分機台。
// 兩種模式共用盤面、提醒與今日次數，同時只比對其中一種。

import { api, ApiError } from '../../api/client.js';
import type { SignalSymbol } from '../../api/assistant.js';
import { currentGameHud, isNativeApp, onGameHud, signalHitNative, type BoardResult, type GameHud } from '../../native.js';
import { ATG_SYMBOLS, atgSymbol, isGemSymbol, isScatterSymbol } from '../atgSymbols.js';
import { currentSetIndex, saveSetIndex, setsOf, subscribeSetIndex, type RoomSignalResponse } from '../roomSignalSets.js';

export interface RoomSignalSymbol {
  symbol: SignalSymbol;
  count: number;
}

export type SignalMode = 'room' | 'custom';
export type CustomTargets = Partial<Record<SignalSymbol, number>>;

/** 自訂訊號每個符號的目標上限（盤面 30 格） */
export const CUSTOM_MAX = 30;
/** 自訂訊號可設定的符號（照 ATG_SYMBOLS 的順序：大圖、甲蟲／彩甲、寶石） */
export const CUSTOM_SYMBOLS = Object.keys(ATG_SYMBOLS) as SignalSymbol[];

export type RoomSignalStatus = 'off' | 'no-room' | 'loading' | 'ready' | 'expired' | 'error';

export interface RoomSignalState {
  enabled: boolean;
  status: RoomSignalStatus;
  roomNo: string | null;
  symbols: RoomSignalSymbol[] | null;
  /** 目前第幾組（0 起算）／共幾組 */
  setIndex: number;
  setTotal: number;
  /** 最近一轉結束時的各符號數量 */
  counts: Record<string, number> | null;
  /** 最近一轉是否達標 */
  hit: boolean;
  /** 今天（本機日期）達標次數 */
  today: number;
  /** 遊戲正在免遊中（暫停比對） */
  freeGame: boolean;
  /** 目前比對房間訊號或自訂訊號 */
  mode: SignalMode;
  /** 自訂訊號各符號目標（0 或沒有＝不看） */
  custom: CustomTargets;
}

const KEY_ON = 'lw.roomSignal.on';
const KEY_TODAY = 'lw.roomSignal.today';
const KEY_MODE = 'lw.roomSignal.mode';
const KEY_CUSTOM = 'lw.roomSignal.custom';
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

function readMode(): SignalMode {
  try {
    return localStorage.getItem(KEY_MODE) === 'custom' ? 'custom' : 'room';
  } catch {
    return 'room';
  }
}

function readCustom(): CustomTargets {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_CUSTOM) ?? 'null');
    const out: CustomTargets = {};
    for (const k of CUSTOM_SYMBOLS) {
      const v = raw?.[k];
      if (Number.isInteger(v) && v > 0 && v <= CUSTOM_MAX) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

const initiallyOn = readOn();
let state: RoomSignalState = {
  enabled: initiallyOn,
  status: initiallyOn ? 'no-room' : 'off',
  roomNo: null,
  symbols: null,
  setIndex: 0,
  setTotal: 0,
  counts: null,
  hit: false,
  today: readToday(),
  freeGame: false,
  mode: readMode(),
  custom: readCustom(),
};
let lastResponse: RoomSignalResponse | null = null;
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

/** 自訂訊號已設定（目標大於 0）的符號 */
export const customSymbols = (custom: CustomTargets): RoomSignalSymbol[] =>
  CUSTOM_SYMBOLS.filter((k) => (custom[k] ?? 0) > 0).map((k) => ({ symbol: k, count: custom[k]! }));

/** 目前模式要比對的符號：房間訊號（還沒載入時 null）或自訂訊號 */
export const activeSymbols = (st: RoomSignalState): RoomSignalSymbol[] | null =>
  st.mode === 'custom' ? customSymbols(st.custom) : st.symbols;

/** 門檻比較方式：自訂訊號一律大於等於；房間訊號寶石大於等於、大圖剛好等於 */
export const opOf = (symbol: string, mode: SignalMode = 'room'): '≥' | '=' =>
  mode === 'custom' || isGemSymbol(symbol) ? '≥' : '=';

/** 單一符號達標（看每轉結束當下的盤面） */
export const symbolMet = (symbol: string, cur: number | undefined, need: number, mode: SignalMode = 'room') =>
  cur !== undefined && (opOf(symbol, mode) === '≥' ? cur >= need : cur === need);

/** 各符號都達標 */
export const meets = (symbols: RoomSignalSymbol[], counts: Record<string, number>, mode: SignalMode = 'room') =>
  symbols.length > 0 && symbols.every((s) => symbolMet(s.symbol, counts[s.symbol] ?? 0, s.count, mode));

/** 舊版 App（1.5.0 以前）的盤面沒有 Scatter 數量：這組含甲蟲／彩甲時無法自動比對 */
export const needsScatterUpdate = (symbols: RoomSignalSymbol[], counts: Record<string, number> | null) =>
  !!counts && !('scarab' in counts) && symbols.some((s) => isScatterSymbol(s.symbol));

/** 「訊號達標！眼睛 4/3、鐮刀 2/2 可買免遊」（現有／門檻） */
export const hitMessage = (symbols: RoomSignalSymbol[], counts: Record<string, number>, mode: SignalMode = 'room') =>
  `${mode === 'custom' ? '自訂訊號' : '訊號'}達標！${symbols.map((s) => `${atgSymbol(s.symbol).name} ${counts[s.symbol] ?? 0}/${mode === 'custom' ? '≥' : ''}${s.count}`).join('、')} 可買免遊`;

let fetchSeq = 0;
let timer: number | null = null;

async function load(roomNo: string) {
  const mine = ++fetchSeq;
  if (state.roomNo !== roomNo || !state.symbols) set({ status: 'loading', symbols: null });
  try {
    const r = await api<RoomSignalResponse>(`/api/assistant/room-signal?roomNo=${encodeURIComponent(roomNo)}`);
    if (mine !== fetchSeq) return;
    lastResponse = r;
    applySet(r);
    set({ status: 'ready' });
  } catch (e) {
    if (mine !== fetchSeq) return;
    set({ status: e instanceof ApiError && e.code === 'ASSISTANT_EXPIRED' ? 'expired' : 'error' });
  }
}

/** 依目前組數套用符號；換了組就重新判斷達標 */
function applySet(r: RoomSignalResponse) {
  const sets = setsOf(r);
  const setIndex = currentSetIndex(r);
  const symbols = sets[setIndex]!.symbols;
  const changed = setIndex !== state.setIndex || JSON.stringify(symbols) !== JSON.stringify(state.symbols);
  set({ symbols, setIndex, setTotal: sets.length });
  if (changed) recheck();
}

/** 換了模式、組數或自訂目標：用最近一轉重新判斷達標（不再發提醒） */
function recheck() {
  const syms = activeSymbols(state);
  set({ hit: !!syms && !!state.counts && meets(syms, state.counts, state.mode) });
}

/** 切換房間訊號／自訂訊號 */
export function setSignalMode(mode: SignalMode) {
  try {
    localStorage.setItem(KEY_MODE, mode);
  } catch {
    /* 不保存 */
  }
  set({ mode });
  recheck();
}

/** 設定自訂訊號某個符號的目標（0＝不看） */
export function setCustomTarget(symbol: SignalSymbol, count: number) {
  const n = Math.max(0, Math.min(CUSTOM_MAX, Math.round(count)));
  const custom = { ...state.custom };
  if (n > 0) custom[symbol] = n;
  else delete custom[symbol];
  try {
    localStorage.setItem(KEY_CUSTOM, JSON.stringify(custom));
  } catch {
    /* 不保存 */
  }
  set({ custom });
  recheck();
}

/** 清除全部自訂目標 */
export function clearCustomTargets() {
  try {
    localStorage.removeItem(KEY_CUSTOM);
  } catch {
    /* 不保存 */
  }
  set({ custom: {} });
  recheck();
}

subscribeSetIndex(() => {
  if (lastResponse && lastResponse.roomNo === state.roomNo) applySet(lastResponse);
});

/** 買完免遊：目前機台換下一組訊號（最後一組時不動，回傳 false） */
export function nextRoomSignalSet(): boolean {
  const r = lastResponse;
  if (!r || r.roomNo !== state.roomNo) return false;
  const next = currentSetIndex(r) + 1;
  if (next >= setsOf(r).length) return false;
  saveSetIndex(r, next);
  return true;
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
    lastResponse = null;
    set({ roomNo, symbols: null, setIndex: 0, setTotal: 0, counts: null, hit: false, status: state.enabled ? (roomNo ? 'loading' : 'no-room') : 'off' });
    if (state.enabled && roomNo) void load(roomNo);
  }
  const freeGame = hud?.fg === true;
  // 進入免遊：清掉免遊前那一盤的數量，免遊結束後等下一轉再比對
  if (freeGame !== state.freeGame) set({ freeGame, ...(freeGame ? { counts: null, hit: false } : {}) });
  const boards = (hud?.boards ?? []) as (BoardResult & { sid?: string })[];
  for (const b of boards) {
    const id = boardId(b);
    if (seen.has(id)) continue;
    seen.add(id);
    if (seen.size > 200) seen.delete(seen.values().next().value!);
    if (b.fg) continue;
    const syms = activeSymbols(state);
    const hit = !!syms && meets(syms, b.counts, state.mode);
    set({ counts: b.counts, hit });
    if (hit && state.enabled && syms) {
      const today = readToday() + 1;
      saveToday(today);
      set({ today });
      signalHitNative(hitMessage(syms, b.counts, state.mode));
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
