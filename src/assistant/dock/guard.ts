// 守護（止盈止損）：會員設定「贏到 +X」「輸到 −Y」兩條線，App 從遊戲畫面讀到的點數變化撞到任一條線就提醒。
// 只提醒、不操作遊戲（不停止自動轉、不下注），停不停手由會員自己決定。
// 狀態放在模組層級：面板收合、小卡卸載時照樣跟著遊戲點數計算；設定與本場起點存在 localStorage，重新載入不會遺失。

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

let state: GuardState = { ...load(), balance: null };
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

function onHud(hud: GameHud | null) {
  const balance = readBalance(hud);
  const { session, settings } = state;
  if (session && balance !== null) {
    const line = crossedLine(settings, session, balance);
    if (line) {
      set({ balance, session: { ...session, alerted: [...session.alerted, line], pending: line } });
      alertNative(guardMessage(line, settings, sessionPnl(session, balance)));
      return;
    }
  }
  if (balance !== state.balance) set({ balance }, false);
}

if (isNativeApp && typeof window !== 'undefined') onGameHud(onHud);

/** 以目前點數為起點開始守護；讀不到點數（不在遊戲畫面）時回傳 false */
export function startGuard(): boolean {
  const balance = readBalance(currentGameHud()) ?? state.balance;
  if (balance === null) return false;
  set({ balance, session: { start: balance, startedAt: Date.now(), alerted: [], pending: null } });
  return true;
}

export const stopGuard = () => set({ session: null });

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
