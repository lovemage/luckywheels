// 守護（止盈止損）：會員設定「贏到 +X」「輸到 −Y」兩條線，App 從遊戲畫面讀到的點數變化撞到任一條線就提醒。
// 只提醒、不操作遊戲（不停止自動轉、不下注），停不停手由會員自己決定。
// 狀態放在模組層級：面板收合、小卡卸載時照樣跟著遊戲點數計算；設定與本場起點存在 localStorage，重新載入不會遺失。
// 免遊暫停（2026-11-10 業主）：買免遊會先一次扣掉購買金額，贏分要等免遊結束才入帳，
// 所以從扣款（或遊戲進入免遊）到免遊結束、贏分入帳前都不判斷，避免一買就跳停損。

import { alertNative, currentGameHud, isNativeApp, onGameHud, type GameHud } from '../../native.js';

export type GuardLine = 'profit' | 'loss';

export interface GuardSettings {
  /** 停利：本場贏到 +profit 提醒；0 = 不設 */
  profit: number;
  /** 停損：本場輸到 −loss 提醒；0 = 不設 */
  loss: number;
}

export interface GuardSession {
  /** 開始守護時的點數 */
  start: number;
  startedAt: number;
  /** 本場已提醒過的線（每條線每場只提醒一次） */
  alerted: GuardLine[];
  /** 已提醒、會員還沒按「知道了」的線 */
  pending: GuardLine | null;
}

export interface GuardState {
  settings: GuardSettings;
  session: GuardSession | null;
  /** 目前讀到的點數；不在遊戲畫面時為 null */
  balance: number | null;
  /** 免遊中（含買免遊扣款後、贏分入帳前）：暫停判斷停利停損 */
  freeGame: boolean;
}

export const GUARD_MAX = 100_000_000;
const DEFAULT_SETTINGS: GuardSettings = { profit: 1000, loss: 1000 };
const KEY = 'lw.guard.v1';

/** 遊戲畫面的點數文字（"10,000.00"）→ 數字 */
export function parseBalance(text: string | null | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^\d.-]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
}

/** 本場損益（點數到小數點後兩位，避免浮點誤差） */
export const sessionPnl = (session: GuardSession, balance: number) => Math.round((balance - session.start) * 100) / 100;

/** 這次點數是否撞到還沒提醒過的線（停損優先） */
export function crossedLine(settings: GuardSettings, session: GuardSession, balance: number): GuardLine | null {
  const pnl = sessionPnl(session, balance);
  if (settings.loss > 0 && pnl <= -settings.loss && !session.alerted.includes('loss')) return 'loss';
  if (settings.profit > 0 && pnl >= settings.profit && !session.alerted.includes('profit')) return 'profit';
  return null;
}

const clampLine = (n: unknown) => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? Math.min(GUARD_MAX, Math.max(0, Math.floor(v))) : 0;
};

function load(): Pick<GuardState, 'settings' | 'session'> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    const settings = raw?.settings
      ? { profit: clampLine(raw.settings.profit), loss: clampLine(raw.settings.loss) }
      : DEFAULT_SETTINGS;
    const s = raw?.session;
    const session: GuardSession | null =
      s && Number.isFinite(s.start) && Number.isFinite(s.startedAt)
        ? {
            start: s.start,
            startedAt: s.startedAt,
            alerted: Array.isArray(s.alerted) ? s.alerted.filter((l: unknown) => l === 'profit' || l === 'loss') : [],
            pending: s.pending === 'profit' || s.pending === 'loss' ? s.pending : null,
          }
        : null;
    return { settings, session };
  } catch {
    return { settings: DEFAULT_SETTINGS, session: null };
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ settings: state.settings, session: state.session }));
  } catch {
    /* 無痕模式等：只是不保存 */
  }
}

let state: GuardState = { ...load(), balance: null, freeGame: false };
const listeners = new Set<() => void>();

function set(next: Partial<GuardState>, persist = true) {
  state = { ...state, ...next };
  if (persist) save();
  listeners.forEach((fn) => fn());
}

export const guardState = () => state;

export function subscribeGuard(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const fmtPoints = (n: number) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export function guardMessage(line: GuardLine, settings: GuardSettings, pnl: number) {
  return line === 'profit'
    ? `已達停利 ${fmtPoints(settings.profit)}（本場 ${fmtPoints(pnl)}），建議先停手收好戰果`
    : `已達停損 ${fmtPoints(-settings.loss)}（本場 ${fmtPoints(pnl)}），建議先停手休息`;
}

// 切換機台、遊戲重新載入時畫面會短暫顯示 0.00，當成「讀不到」，避免誤判成大輸觸發停損
const readBalance = (hud: GameHud | null) => {
  const v = parseBalance(hud?.balance);
  return v !== null && v > 0 ? v : null;
};

// ── 免遊暫停 ──────────────────────────
/** 點數一次掉超過押注的這麼多倍＝買免遊（一般一轉只扣 1 倍押注；App 每 2 秒讀一次，連轉也到不了） */
export const BUY_DROP_STAKES = 10;
/** 扣款後多久還沒進免遊就恢復判斷（新版 App 讀得到免遊狀態，沒進＝其實是轉出點數等） */
const WAIT_FG_MS = 30_000;
/** 舊版 App（1.5.1 以前）讀不到免遊狀態：扣款後最多暫停這麼久 */
const WAIT_FG_LEGACY_MS = 180_000;
/** 免遊結束後：贏分入帳、下一轉結束，或最多等這麼久就恢復判斷 */
const AFTER_FG_MS = 60_000;

interface FreeHold {
  since: number;
  /** 已讀到遊戲進入免遊 */
  fgSeen: boolean;
  /** 讀到免遊結束的時間、當下點數與最後一盤 */
  endedAt: number | null;
  endBalance: number | null;
  endBoard: string | null;
}

let hold: FreeHold | null = null;
let holdTimer: ReturnType<typeof setTimeout> | null = null;

const lastBoardKey = (hud: GameHud | null) => {
  const b = hud?.boards?.[hud.boards.length - 1] as ({ sid?: string; seq: number; fg?: boolean } | undefined);
  return b ? `${b.sid ?? ''}:${b.seq}:${b.fg ? 'fg' : ''}` : null;
};

/** 期限到了即使遊戲畫面沒變化也重新判斷一次（會員停手不轉時照樣能提醒） */
function recheckIn(ms: number) {
  if (holdTimer !== null) clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    holdTimer = null;
    onHud(currentGameHud());
  }, ms + 50);
}

function clearHold() {
  hold = null;
  if (holdTimer !== null) clearTimeout(holdTimer);
  holdTimer = null;
}

/** 更新免遊暫停狀態；回傳目前是否暫停判斷 */
export function updateFreeHold(hud: GameHud | null, balance: number | null, prevBalance: number | null, now = Date.now()): boolean {
  if (!state.session) {
    clearHold();
    return false;
  }
  const knowsFg = typeof hud?.fg === 'boolean';
  const board = lastBoardKey(hud);
  if (hud?.fg === true) {
    if (!hold?.fgSeen || hold.endedAt !== null) {
      hold = { since: hold?.since ?? now, fgSeen: true, endedAt: null, endBalance: null, endBoard: null };
      if (holdTimer !== null) clearTimeout(holdTimer);
      holdTimer = null;
    }
    return true;
  }
  if (!hold) {
    const stake = parseBalance(hud?.stake);
    if (prevBalance !== null && balance !== null && stake !== null && stake > 0 && prevBalance - balance >= stake * BUY_DROP_STAKES) {
      hold = { since: now, fgSeen: false, endedAt: null, endBalance: null, endBoard: null };
      recheckIn(knowsFg ? WAIT_FG_MS : WAIT_FG_LEGACY_MS);
      return true;
    }
    return false;
  }
  if (!hold.fgSeen) {
    if (now - hold.since >= (knowsFg ? WAIT_FG_MS : WAIT_FG_LEGACY_MS)) clearHold();
    return hold !== null;
  }
  // 免遊剛結束：記下當時的點數與最後一盤，等贏分入帳
  if (hold.endedAt === null) {
    hold = { ...hold, endedAt: now, endBalance: balance, endBoard: board };
    recheckIn(AFTER_FG_MS);
    return true;
  }
  const credited = balance !== null && hold.endBalance !== null && balance > hold.endBalance;
  const nextSpin = board !== null && board !== hold.endBoard && !board.endsWith(':fg');
  if (credited || nextSpin || now - hold.endedAt >= AFTER_FG_MS) clearHold();
  return hold !== null;
}

function onHud(hud: GameHud | null) {
  const balance = readBalance(hud);
  const freeGame = updateFreeHold(hud, balance, state.balance);
  const { session, settings } = state;
  if (session && balance !== null && !freeGame) {
    const line = crossedLine(settings, session, balance);
    if (line) {
      set({ balance, freeGame, session: { ...session, alerted: [...session.alerted, line], pending: line } });
      alertNative(guardMessage(line, settings, sessionPnl(session, balance)));
      return;
    }
  }
  if (balance !== state.balance || freeGame !== state.freeGame) set({ balance, freeGame }, false);
}

if (isNativeApp && typeof window !== 'undefined') onGameHud(onHud);

/** 以目前點數為起點開始守護；讀不到點數（不在遊戲畫面）時回傳 false */
export function startGuard(): boolean {
  const balance = readBalance(currentGameHud()) ?? state.balance;
  if (balance === null) return false;
  clearHold();
  set({ balance, freeGame: false, session: { start: balance, startedAt: Date.now(), alerted: [], pending: null } });
  return true;
}

export function stopGuard() {
  clearHold();
  set({ session: null, freeGame: false });
}

export function ackGuard() {
  if (state.session?.pending) set({ session: { ...state.session, pending: null } });
}

/** 改線：已提醒過、但新線還沒撞到的，重新開放提醒 */
export function updateGuardSettings(next: GuardSettings) {
  const settings = { profit: clampLine(next.profit), loss: clampLine(next.loss) };
  const s = state.session;
  if (!s) return set({ settings });
  const pnl = state.balance === null ? null : sessionPnl(s, state.balance);
  const stillHit = (l: GuardLine) =>
    pnl !== null && (l === 'profit' ? settings.profit > 0 && pnl >= settings.profit : settings.loss > 0 && pnl <= -settings.loss);
  const alerted = s.alerted.filter(stillHit);
  set({ settings, session: { ...s, alerted, pending: s.pending && alerted.includes(s.pending) ? s.pending : null } });
}
