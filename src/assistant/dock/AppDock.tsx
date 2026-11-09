import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError, api } from '../../api/client.js';
import { fetchAssistantMe, type AssistantMe, type RoomsResponse, type ScoredRoom } from '../../api/assistant.js';
import { BrandMark } from '../BrandMark.js';
import { fmtAgo, fmtInt, fmtRemainingDetail, fmtRtp } from '../format.js';
import {
  backToGame,
  currentGameHud,
  hasRoomSwitch,
  hasSignalFloat,
  requestDockMode,
  onGameHud,
  reportDockHeight,
  switchGameRoom,
  type GameHud,
} from '../../native.js';
import '../assistant.css';
import './dock.css';
import { exchangeClosedMessage, exchangeOpen } from '../OpenPassButton.js';
import { GuardBar } from './GuardBar.js';

// App 駐守小卡：疊在遊戲上方。助手只是輔助，只放三件事：
//   1. 守護（止盈止損）：本場損益與兩條線，撞線提醒（見 guard.ts）
//   2. 會員目前所在機台的數據（App 從遊戲畫面讀出機台號）
//   3. 兩台推薦空台（綜合榜／精品榜），點一下由 App 在遊戲裡切換過去（只切換、不下注）；「換一組」換下兩台

type Board = 'score' | 'premium';
const BOARDS: { id: Board; label: string }[] = [
  { id: 'score', label: '綜合' },
  { id: 'premium', label: '精品' },
];
/** 綜合榜從分數前 20 台輪流挑；精品榜（分數前 5%）從前 100 台裡篩 */
const CANDIDATES: Record<Board, number> = { score: 20, premium: 100 };
const PICKS = 2;
const REFRESH_MS = 60_000;

// 小卡預設精簡（三行：標題、守護、兩台推薦），盡量少遮遊戲畫面；「更多」展開機台數據、榜單與設定
const COMPACT_KEY = 'lw.dock.compact';
function readCompact() {
  try {
    return localStorage.getItem(COMPACT_KEY) !== '0';
  } catch {
    return true;
  }
}
function saveCompact(v: boolean) {
  try {
    localStorage.setItem(COMPACT_KEY, v ? '1' : '0');
  } catch {
    /* 無痕模式：只是不記住 */
  }
}

async function fetchCandidates(board: Board) {
  const r = await api<RoomsResponse>(`/api/assistant/rooms?sort=score&status=idle&pageSize=${CANDIDATES[board]}`);
  return board === 'premium' ? { ...r, items: r.items.filter((i) => i.premium) } : r;
}

async function fetchRoomByNo(roomNo: string): Promise<ScoredRoom | null> {
  const r = await api<RoomsResponse>(`/api/assistant/rooms?q=${encodeURIComponent(roomNo)}&pageSize=20`);
  return r.items.find((i) => i.roomNo === roomNo) ?? null;
}

function useDockHeight() {
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const report = () => reportDockHeight(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return rootRef;
}

export function AppDock({ onOpenFull }: { onOpenFull: (view?: 'exchange') => void }) {
  const rootRef = useDockHeight();
  const [me, setMe] = useState<AssistantMe | null>(null);
  const [meError, setMeError] = useState(false);
  const [hud, setHud] = useState<GameHud | null>(currentGameHud);
  const [current, setCurrent] = useState<ScoredRoom | null>(null);
  const [gameName, setGameName] = useState('');
  const [picks, setPicks] = useState<ScoredRoom[] | null>(null);
  const [picksError, setPicksError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [board, setBoard] = useState<Board>('score');
  const [compact, setCompact] = useState(readCompact);
  const toggleCompact = () =>
    setCompact((v) => {
      saveCompact(!v);
      return !v;
    });
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef(new Set<string>());
  // 最近一次抓到的候選空台（依分數排序），切換時當備選：推薦的那台被坐走就自動換下一台
  const pool = useRef<string[]>([]);

  useEffect(() => onGameHud(setHud), []);

  const loadMe = useCallback(() => {
    fetchAssistantMe()
      .then((m) => {
        setMe({ ...m, receivedAt: Date.now() });
        setMeError(false);
      })
      .catch(() => setMeError(true));
  }, []);
  useEffect(loadMe, [loadMe]);

  const active = me?.pass.active ?? false;
  const roomNo = hud?.room ?? null;

  // 挑兩台：排除目前所在機台，先挑這次還沒看過的，看完一輪再重來
  const pickTwo = useCallback(async () => {
    const list = await fetchCandidates(board);
    setGameName(list.game.name);
    const candidates = list.items.filter((r) => r.roomNo !== roomNo);
    pool.current = candidates.map((r) => r.roomNo);
    let fresh = candidates.filter((r) => !seen.current.has(r.roomNo));
    if (fresh.length < PICKS) {
      seen.current.clear();
      fresh = candidates;
    }
    const next = fresh.slice(0, PICKS);
    next.forEach((r) => seen.current.add(r.roomNo));
    return next;
  }, [roomNo, board]);

  const refreshPicks = useCallback(async () => {
    try {
      setPicks(await pickTwo());
      setPicksError(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ASSISTANT_EXPIRED') loadMe();
      else setPicksError(true);
    }
  }, [pickTwo, loadMe]);

  // 開通後自動挑一組；之後由「換一組」換（refreshPicks 只在所在機台改變時更新）
  const autoPicked = useRef(false);
  useEffect(() => {
    if (!active || autoPicked.current) return;
    autoPicked.current = true;
    void refreshPicks();
  }, [active, refreshPicks]);

  // 目前所在機台的數據：機台號變了就重抓，之後每分鐘更新
  useEffect(() => {
    if (!active || !roomNo) {
      setCurrent(null);
      return;
    }
    let alive = true;
    const load = () =>
      fetchRoomByNo(roomNo)
        .then((r) => alive && setCurrent(r))
        .catch(() => alive && setCurrent(null));
    void load();
    const t = window.setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [active, roomNo]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  async function changeBoard(next: Board) {
    if (busy || next === board) return;
    seen.current.clear();
    setPicks(null);
    setBoard(next);
  }

  // 切換榜單後重挑（第一次由上面的 autoPicked 處理）
  const lastBoard = useRef(board);
  useEffect(() => {
    if (lastBoard.current === board) return;
    lastBoard.current = board;
    void refreshPicks();
  }, [board, refreshPicks]);

  async function nextPair() {
    if (busy) return;
    setBusy(true);
    await refreshPicks();
    setBusy(false);
  }

  const remaining = me?.pass.expiresAt
    ? Math.max(0, Math.floor((new Date(me.pass.expiresAt).getTime() - (now - ((me.receivedAt ?? now) - new Date(me.serverTime).getTime()))) / 1000))
    : 0;

  return (
    <div className="aa-dock" ref={rootRef}>
      <header className="aa-dock-head">
        <span className="aa-dock-brand" aria-hidden="true">
          <BrandMark />
        </span>
        <p className="aa-dock-title">
          {roomNo ? (
            <>
              <span className="aa-dock-label">目前</span>
              <span className="aa-dock-room">#{roomNo}</span>
              {current?.score != null && <span className="aa-dock-score">{current.score} 分</span>}
              {!compact && gameName && <span className="aa-dock-game">{gameName}</span>}
            </>
          ) : (
            <span className="aa-dock-game">駐守助手</span>
          )}
        </p>
        {me && (
          <button type="button" className="aa-dock-more" aria-expanded={!compact} onClick={toggleCompact}>
            {compact ? '更多' : '精簡'}
          </button>
        )}
        <button type="button" className="aa-dock-close" onClick={backToGame}>
          收合
        </button>
      </header>

      {!me && !meError && <p className="aa-dock-note">載入中…</p>}
      {!me && meError && (
        <div className="aa-dock-row">
          <p className="aa-dock-note">無法連線，請稍後再試</p>
          <button type="button" className="aa-dock-btn" onClick={loadMe}>
            重試
          </button>
        </div>
      )}

      {me && <GuardBar compact={compact} />}

      {me && !active && (
        <div className="aa-dock-row">
          <p className="aa-dock-note">{!exchangeOpen(me) ? exchangeClosedMessage(me) : me.pass.expiresAt ? '使用期限已到期' : '尚未開通數據助手'}</p>
          <button type="button" className="aa-dock-btn aa-dock-btn--solid" disabled={!exchangeOpen(me)} onClick={() => onOpenFull('exchange')}>
            用積分開通
          </button>
        </div>
      )}

      {me && active && (
        <>
          {!compact && roomNo && current && <RoomStats room={current} now={now} />}

          {!compact && <div className="aa-dock-section aa-dock-boards">
            <span>推薦機台</span>
            <div className="aa-dock-tabs" role="tablist" aria-label="推薦榜單">
              {BOARDS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="tab"
                  aria-selected={board === b.id}
                  className={`aa-dock-tab${board === b.id ? ' is-on' : ''}`}
                  onClick={() => changeBoard(b.id)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>}
          {picksError && <p className="aa-dock-note">推薦暫時無法載入</p>}
          {!picksError && picks === null && <p className="aa-dock-note">挑選中…</p>}
          {!picksError && picks?.length === 0 && (
            <p className="aa-dock-note">{board === 'premium' ? '目前沒有精品空台，可切回綜合榜' : '目前沒有可推薦的空台'}</p>
          )}
          {compact && picks && picks.length > 0 && (
            <div className="aa-dock-chips">
              <span className="aa-dock-chips-label">推薦</span>
              {picks.map((r) => (
                <button
                  key={r.roomNo}
                  type="button"
                  className="aa-dock-chip"
                  disabled={!hasRoomSwitch}
                  onClick={() => switchGameRoom(r.roomNo, [...(picks ?? []).map((p) => p.roomNo), ...pool.current])}
                  aria-label={`切換到 ${r.roomNo} 號機台`}
                >
                  <span className="aa-dock-pick-no">#{r.roomNo}</span>
                  {r.score !== null && <span className="aa-dock-pick-score">{r.score}</span>}
                </button>
              ))}
              <button type="button" className="aa-dock-chip aa-dock-chip--ghost" onClick={nextPair} disabled={busy} aria-busy={busy} aria-label="換一組推薦">
                {busy ? '…' : '換'}
              </button>
            </div>
          )}
          {hasSignalFloat && roomNo && (
            <button type="button" className="aa-dock-btn aa-dock-btn--solid aa-dock-signal" onClick={() => requestDockMode('signal')}>
              房間訊號 #{roomNo}
            </button>
          )}
          {!compact && picks && picks.length > 0 && (
            <ul className="aa-dock-picks">
              {picks.map((r) => (
                <li key={r.roomNo}>
                  <button
                    type="button"
                    className="aa-dock-pick"
                    disabled={!hasRoomSwitch}
                    onClick={() => switchGameRoom(r.roomNo, [...(picks ?? []).map((p) => p.roomNo), ...pool.current])}
                    aria-label={`切換到 ${r.roomNo} 號機台`}
                  >
                    <span className="aa-dock-pick-no">#{r.roomNo}</span>
                    <span className="aa-dock-pick-meta">
                      未開 <b>{fmtInt(r.unopenedSpins)}</b> · RTP <b>{fmtRtp(r.todayRtp)}</b>
                    </span>
                    {r.score !== null && <span className="aa-dock-pick-score">{r.score}</span>}
                    {hasRoomSwitch && <span className="aa-dock-pick-go">前往</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!compact && (
            <>
              <div className="aa-dock-actions">
                <button type="button" className="aa-dock-btn" onClick={nextPair} disabled={busy} aria-busy={busy}>
                  {busy ? '挑選中…' : '換一組'}
                </button>
                <button type="button" className="aa-dock-btn" onClick={() => onOpenFull()}>
                  完整助手
                </button>
              </div>

              <p className="aa-dock-foot">
                剩 {fmtRemainingDetail(remaining)} · 數據攻略僅供參考
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function RoomStats({ room, now }: { room: ScoredRoom; now: number }) {
  const status = room.stale ? '資料逾時' : room.status === 'idle' ? '空台' : room.status === 'busy' ? '使用中' : room.status === 'locked' ? '已預約' : '—';
  return (
    <>
      <dl className="aa-dock-stats">
        <div>
          <dt>未開轉數</dt>
          <dd>{room.stale ? '—' : fmtInt(room.unopenedSpins)}</dd>
        </div>
        <div>
          <dt>今日 RTP</dt>
          <dd>{room.stale ? '—' : fmtRtp(room.todayRtp)}</dd>
        </div>
        <div>
          <dt>今日下注</dt>
          <dd>{room.stale ? '—' : fmtInt(room.todayBet)}</dd>
        </div>
      </dl>
      <p className="aa-dock-meta">
        <span className={`aa-dock-status${room.status === 'idle' && !room.stale ? ' is-idle' : ''}`}>{status}</span>
        {room.score !== null && <span>綜合分數 {room.score}</span>}
        <span>{room.listCapturedAt ? `更新 ${fmtAgo(room.listCapturedAt, now)}` : ''}</span>
      </p>
    </>
  );
}

/** 駐守小卡的簡單狀態（載入中、未登入、暫停服務），版面與小卡一致 */
export function DockMessage({ note, action }: { note: string; action?: { label: string; onClick: () => void } }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const report = () => reportDockHeight(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="aa-dock" ref={rootRef}>
      <header className="aa-dock-head">
        <span className="aa-dock-brand" aria-hidden="true">
          <BrandMark />
        </span>
        <p className="aa-dock-title">
          <span className="aa-dock-game">駐守助手</span>
        </p>
        <button type="button" className="aa-dock-close" onClick={backToGame}>
          收合
        </button>
      </header>
      <div className="aa-dock-row">
        <p className="aa-dock-note">{note}</p>
        {action && (
          <button type="button" className="aa-dock-btn aa-dock-btn--solid" onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
