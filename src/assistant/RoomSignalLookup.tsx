import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api, ApiError } from '../api/client.js';
import { currentGameHud, isNativeApp, onGameHud } from '../native.js';
import { atgSymbol, symbolOp } from './atgSymbols.js';
import { meets, roomSignalState, subscribeRoomSignal, symbolMet } from './dock/roomSignal.js';
import { currentSetIndex, saveSetIndex, setsOf, subscribeSetIndex, type RoomSignalResponse } from './roomSignalSets.js';

// 房間訊號（完整助手首頁）：
// - 網頁版（iPhone）讀不到遊戲盤面，由會員輸入目前坐的房號，顯示該房的訊號門檻，每轉結束後自己對照
// - Android App 內：自動帶入目前坐的機台、自動查詢，並顯示最近一轉的數量（現有／門檻）
// 與 App 訊號浮窗用同一組訊號（訊號綁房間）。
// 每台每天依序 5 組：會員買完免遊按「免遊結束，換一組」接下一組（2026-11-09；按鈕由曜金訊號移來）。
// 第幾組記在本機，與 App 浮窗共用。

/** App 內目前坐的機台號（App 從遊戲畫面讀出；網頁版為 null） */
function useGameRoom(): string | null {
  return useSyncExternalStore(
    (fn) => (isNativeApp ? onGameHud(() => fn()) : () => {}),
    () => (isNativeApp ? currentGameHud()?.room ?? null : null),
  );
}

const KEY = 'lw.roomSignal.lastRoom';
const readLast = () => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; data: RoomSignalResponse };

export function RoomSignalLookup({
  onExpired,
  onlyIfRoom = false,
}: {
  onExpired?: () => void;
  /** 本金推薦頁用：會員還沒輸入過房號（App 內也還沒坐上機台）時整塊不顯示 */
  onlyIfRoom?: boolean;
}) {
  const gameRoom = useGameRoom();
  // 首頁輸入過的房號記在本機，推薦頁打開時直接沿用、自動查詢（與首頁同步）
  const [hasRoom] = useState(() => readLast() !== '');
  const [roomNo, setRoomNo] = useState(() => gameRoom ?? readLast());
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [note, setNote] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  /** 目前顯示的房號（切回分頁時重抓用） */
  const latest = useRef<string | null>(null);
  // 換組（本機或 App 另一個畫面）時重新渲染
  useSyncExternalStore(subscribeSetIndex, () => (state.kind === 'ready' ? currentSetIndex(state.data) : -1));
  // 最近一轉的各符號數量（App 讀盤面；只在顯示的房間＝目前機台時採用）
  const board = useSyncExternalStore(subscribeRoomSignal, roomSignalState);
  const sets = state.kind === 'ready' ? setsOf(state.data) : [];
  const setIndex = state.kind === 'ready' ? currentSetIndex(state.data) : 0;
  const symbols = sets[setIndex]?.symbols ?? [];
  const live = isNativeApp && gameRoom !== null && state.kind === 'ready' && state.data.roomNo === gameRoom;
  const counts = live ? board.counts : null;

  // 網頁版（iPhone 在 Safari 與遊戲之間來回切換）：記得上次的房號，打開就直接顯示，不用每次重查；
  // 切回這個分頁時安靜地重抓一次（隔天或伺服器偵測到自然開出免遊時，整串訊號會換新）
  useEffect(() => {
    if (isNativeApp) return;
    const last = readLast();
    if (last) void lookup(last);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const no = latest.current;
      if (no) void lookup(no, true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // App 內：坐上（或換了）機台就自動查詢
  useEffect(() => {
    if (!gameRoom) return;
    setRoomNo(gameRoom);
    void lookup(gameRoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameRoom]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await lookup(roomNo.trim());
  }

  /** 買完免遊：換這台的下一組；step＝-1 是按錯時退回上一組 */
  function move(step: 1 | -1) {
    if (state.kind !== 'ready') return;
    const to = setIndex + step;
    if (to >= sets.length) {
      setNote(`今天這台的 ${sets.length} 組都用過了，隔天會換新`);
      return;
    }
    if (to < 0) return;
    saveSetIndex(state.data, to);
    setNote(step === 1 ? `已換到第 ${to + 1} 組` : `已回到第 ${to + 1} 組`);
  }

  /** quiet＝切回分頁時重抓：不清掉畫面，訊號換新了才提示 */
  async function lookup(no: string, quiet = false): Promise<RoomSignalResponse | null> {
    if (!quiet) setNote(null);
    if (!/^\d{1,6}$/.test(no)) {
      setState({ kind: 'error', message: '請輸入房號（數字）' });
      return null;
    }
    const prev = stateRef.current.kind === 'ready' ? stateRef.current.data : null;
    if (!quiet) setState({ kind: 'loading' });
    try {
      const data = await api<RoomSignalResponse>(`/api/assistant/room-signal?roomNo=${encodeURIComponent(no)}`);
      try {
        localStorage.setItem(KEY, no);
      } catch {
        /* 不保存 */
      }
      latest.current = no;
      setState({ kind: 'ready', data });
      if (quiet && prev && prev.roomNo === data.roomNo && prev.key !== data.key) setNote('這台的訊號已換新，回到第 1 組');
      return data;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ASSISTANT_EXPIRED') {
        onExpired?.();
        return null;
      }
      if (quiet) return null; // 背景重抓失敗：保留畫面上的訊號
      setState({
        kind: 'error',
        message: err instanceof ApiError && err.code === 'ROOM_NOT_FOUND' ? `找不到 ${no} 號機台，請確認房號` : '訊號暫時無法載入，請稍後再試',
      });
      return null;
    }
  }

  if (onlyIfRoom && !hasRoom && !gameRoom) return null;

  return (
    <section className="aa-signal aa-roomsig" aria-labelledby="aa-roomsig-title">
      <div className="aa-section-head">
        <h2 id="aa-roomsig-title" className="aa-display">房間訊號</h2>
        <span className="aa-section-note">{gameRoom ? `目前機台 #${gameRoom} · 自動` : '輸入目前所在房號'}</span>
      </div>
      <form className="aa-roomsig-form" onSubmit={submit} noValidate>
        <label className="aa-money">
          <span className="aa-money-unit">#</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            placeholder="例：459"
            aria-label="目前所在房號"
            value={roomNo}
            onChange={(e) => setRoomNo(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </label>
        <button type="submit" className="aa-button" disabled={state.kind === 'loading'} aria-busy={state.kind === 'loading'}>
          {state.kind === 'loading' ? '讀取中…' : '看訊號'}
        </button>
      </form>

      {state.kind === 'error' && (
        <p className="aa-error" role="alert">
          {state.message}
        </p>
      )}

      {state.kind === 'ready' && (
        <div className="aa-signal-plate" key={sets[setIndex]?.key}>
          <ul className="aa-signal-symbols" data-count={symbols.length}>
            {symbols.map((s, i) => {
              const cur = counts?.[s.symbol];
              const ok = symbolMet(s.symbol, cur, s.count);
              return (
                <li key={s.symbol} className={`aa-signal-cell${ok ? ' is-ok' : ''}`} style={{ '--i': i } as React.CSSProperties}>
                  <img src={atgSymbol(s.symbol).img} alt="" width="72" height="72" draggable={false} />
                  <span
                    className="aa-signal-mult aa-display"
                    aria-label={`${atgSymbol(s.symbol).name} 需要${symbolOp(s.symbol) === '≥' ? '至少' : '剛好'} ${s.count} 個${counts ? `，最近一轉 ${cur ?? 0} 個${ok ? '，已達標' : ''}` : ''}`}
                  >
                    <span aria-hidden="true">
                      {counts ? (
                        <>
                          {cur ?? 0}
                          <span className="aa-signal-x">/</span>
                          {s.count}
                        </>
                      ) : (
                        <>
                          <span className="aa-signal-x">{symbolOp(s.symbol)}</span>
                          {s.count}
                        </>
                      )}
                    </span>
                  </span>
                  <span className="aa-signal-name" aria-hidden="true">
                    {atgSymbol(s.symbol).name}
                  </span>
                </li>
              );
            })}
          </ul>
          {counts && meets(symbols, counts) ? (
            <p className="aa-roomsig-hit" role="status">
              訊號達標！可買免遊
            </p>
          ) : (
            <p className="aa-signal-summary">
              {counts
                ? `#${state.data.roomNo}：最近一轉的數量／門檻，大圖剛好相等、寶石達到以上，就是訊號達標，可買免遊`
                : `#${state.data.roomNo}：每轉結束時，盤面上的大圖數量剛好相等（=）、寶石達到以上（≥），就是訊號達標，可買免遊`}
            </p>
          )}
        </div>
      )}
      {state.kind === 'ready' && (
        <div className="aa-roomsig-sets">
          <div className="aa-roomsig-progress">
            <span>
              第 <b>{setIndex + 1}</b> / {sets.length} 組
            </span>
            <span className="aa-roomsig-dots" aria-hidden="true">
              {sets.map((x, i) => (
                <i key={x.key} className={i < setIndex ? 'is-used' : i === setIndex ? 'is-current' : undefined} />
              ))}
            </span>
            {setIndex > 0 && (
              <button type="button" className="aa-roomsig-back" onClick={() => move(-1)}>
                回上一組
              </button>
            )}
          </div>
          <button
            type="button"
            className="aa-button aa-button--block"
            disabled={setIndex + 1 >= sets.length}
            onClick={() => move(1)}
          >
            {setIndex + 1 >= sets.length ? '今天這台的訊號已用完' : '免遊結束，換下一組'}
          </button>
        </div>
      )}
      {note && (
        <p className="aa-signal-note" role="status">
          {note}
        </p>
      )}
      <p className="aa-disclaimer">連續多日分析，每天更新前七天單一房間數據 · 每台每天 {sets.length || 5} 組 · 不代表遊戲結果</p>
    </section>
  );
}
