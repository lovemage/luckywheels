import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError, api } from '../../api/client.js';
import { fetchAssistantMe, type AssistantMe, type RoomsResponse, type ScoredRoom } from '../../api/assistant.js';
import { BrandMark } from '../BrandMark.js';
import { fmtAgo, fmtInt, fmtRemainingDetail, fmtRtp } from '../format.js';
import { backToGame, reportDockHeight } from '../../native.js';
import '../assistant.css';
import './dock.css';

// App 駐守小卡：疊在遊戲上方，只放「目前機台的數據」與「換一台」。助手只是輔助，不放其他訊息。
// 機台來源：先帶入推薦的第一台空台；會員也可以輸入自己正在玩的房號。
// （之後讀得到遊戲畫面時，改為自動帶入會員所在的房號。）

const ROOM_KEY = 'aa-dock-room';
const CANDIDATES = 20;
const REFRESH_MS = 60_000;

const fetchCandidates = () =>
  api<RoomsResponse>(`/api/assistant/rooms?sort=score&status=idle&pageSize=${CANDIDATES}`);

async function fetchRoomByNo(roomNo: string): Promise<{ room: ScoredRoom | null; game: RoomsResponse['game'] }> {
  const r = await api<RoomsResponse>(`/api/assistant/rooms?q=${encodeURIComponent(roomNo)}&pageSize=20`);
  return { room: r.items.find((i) => i.roomNo === roomNo) ?? null, game: r.game };
}

function storedRoom(): string | null {
  try {
    return sessionStorage.getItem(ROOM_KEY);
  } catch {
    return null;
  }
}
function storeRoom(roomNo: string) {
  try {
    sessionStorage.setItem(ROOM_KEY, roomNo);
  } catch {
    /* 不記住即可 */
  }
}

type RoomState =
  | { kind: 'loading' }
  | { kind: 'ready'; room: ScoredRoom; gameName: string; at: number }
  | { kind: 'missing'; roomNo: string }
  | { kind: 'empty' }
  | { kind: 'error' };

export function AppDock({ onOpenFull }: { onOpenFull: (view?: 'exchange') => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [me, setMe] = useState<AssistantMe | null>(null);
  const [meError, setMeError] = useState(false);
  const [roomNo, setRoomNo] = useState<string | null>(storedRoom);
  const [room, setRoom] = useState<RoomState>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef(new Set<string>());

  // 小卡高度跟著內容走
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const report = () => reportDockHeight(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const pickNext = useCallback(async (exclude: string | null) => {
    const list = await fetchCandidates();
    const pool = list.items.filter((r) => r.roomNo !== exclude);
    if (pool.length === 0) return null;
    // 先挑這次還沒看過的，看完一輪再重來
    let next = pool.find((r) => !seen.current.has(r.roomNo));
    if (!next) {
      seen.current.clear();
      next = pool[0]!;
    }
    seen.current.add(next.roomNo);
    return { room: next, gameName: list.game.name };
  }, []);

  const load = useCallback(
    async (target: string | null) => {
      try {
        if (target) {
          const { room: r, game } = await fetchRoomByNo(target);
          setRoom(r ? { kind: 'ready', room: r, gameName: game.name, at: Date.now() } : { kind: 'missing', roomNo: target });
          return;
        }
        const next = await pickNext(null);
        if (!next) {
          setRoom({ kind: 'empty' });
          return;
        }
        setRoomNo(next.room.roomNo);
        storeRoom(next.room.roomNo);
        setRoom({ kind: 'ready', room: next.room, gameName: next.gameName, at: Date.now() });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'ASSISTANT_EXPIRED') loadMe();
        else setRoom({ kind: 'error' });
      }
    },
    [pickNext, loadMe],
  );

  // 開通中才抓機台；每分鐘更新一次數據
  useEffect(() => {
    if (!active) return;
    if (roomNo) seen.current.add(roomNo);
    void load(roomNo);
    const t = window.setInterval(() => void load(roomNo), REFRESH_MS);
    return () => window.clearInterval(t);
    // 換一台／輸入房號會改 roomNo，這裡重新載入並重設每分鐘更新
  }, [active, roomNo, load]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  async function changeRoom() {
    if (busy) return;
    setBusy(true);
    try {
      const next = await pickNext(roomNo);
      if (!next) setRoom({ kind: 'empty' });
      else {
        storeRoom(next.room.roomNo);
        setRoomNo(next.room.roomNo);
      }
    } catch {
      setRoom({ kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function submitRoom(e: React.FormEvent) {
    e.preventDefault();
    const v = draft.replace(/\D/g, '');
    if (!v) return;
    setEditing(false);
    setDraft('');
    storeRoom(v);
    setRoom({ kind: 'loading' });
    setRoomNo(v);
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
          {room.kind === 'ready' ? (
            <>
              <span className="aa-dock-room">#{room.room.roomNo}</span>
              <span className="aa-dock-game">{room.gameName}</span>
            </>
          ) : (
            <span className="aa-dock-game">駐守助手</span>
          )}
        </p>
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

      {me && !active && (
        <div className="aa-dock-row">
          <p className="aa-dock-note">{me.pass.expiresAt ? '使用期限已到期' : '尚未開通數據助手'}</p>
          <button type="button" className="aa-dock-btn aa-dock-btn--solid" onClick={() => onOpenFull('exchange')}>
            用積分開通
          </button>
        </div>
      )}

      {me && active && (
        <>
          {room.kind === 'loading' && <p className="aa-dock-note">讀取機台數據…</p>}
          {room.kind === 'empty' && <p className="aa-dock-note">目前沒有可推薦的空台</p>}
          {room.kind === 'error' && <p className="aa-dock-note">數據暫時無法載入</p>}
          {room.kind === 'missing' && <p className="aa-dock-note">找不到房號 #{room.roomNo} 的數據</p>}
          {room.kind === 'ready' && <RoomStats room={room.room} now={now} />}

          {editing ? (
            <form className="aa-dock-form" onSubmit={submitRoom}>
              <input
                inputMode="numeric"
                autoFocus
                placeholder="輸入房號"
                aria-label="正在玩的房號"
                value={draft}
                maxLength={6}
                onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
              />
              <button type="submit" className="aa-dock-btn aa-dock-btn--solid">
                查看
              </button>
              <button type="button" className="aa-dock-btn" onClick={() => setEditing(false)}>
                取消
              </button>
            </form>
          ) : (
            <div className="aa-dock-actions">
              <button type="button" className="aa-dock-btn aa-dock-btn--solid" onClick={changeRoom} disabled={busy} aria-busy={busy}>
                {busy ? '挑選中…' : '換一台'}
              </button>
              <button type="button" className="aa-dock-btn" onClick={() => setEditing(true)}>
                輸入房號
              </button>
              <button type="button" className="aa-dock-btn" onClick={() => onOpenFull()}>
                完整助手
              </button>
            </div>
          )}

          <p className="aa-dock-foot">
            剩 {fmtRemainingDetail(remaining)} · 數據攻略僅供參考
          </p>
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
