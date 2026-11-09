import { useState } from 'react';
import { api, ApiError } from '../api/client.js';
import type { SignalSymbol } from '../api/assistant.js';
import { atgSymbol } from './atgSymbols.js';

// 房間訊號（網頁版，iPhone 會員用）：網頁讀不到遊戲盤面，所以由會員輸入目前坐的房號，
// 顯示該房的訊號門檻，每轉結束後自己對照盤面。與 Android App 浮窗用同一組訊號（訊號綁房間）。

interface RoomSignalResponse {
  roomNo: string;
  symbols: { symbol: SignalSymbol; count: number }[];
  disclaimer: string;
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

export function RoomSignalLookup({ onExpired }: { onExpired?: () => void }) {
  const [roomNo, setRoomNo] = useState(readLast);
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const no = roomNo.trim();
    if (!/^\d{1,6}$/.test(no)) {
      setState({ kind: 'error', message: '請輸入房號（數字）' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const data = await api<RoomSignalResponse>(`/api/assistant/room-signal?roomNo=${encodeURIComponent(no)}`);
      try {
        localStorage.setItem(KEY, no);
      } catch {
        /* 不保存 */
      }
      setState({ kind: 'ready', data });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ASSISTANT_EXPIRED') {
        onExpired?.();
        return;
      }
      setState({
        kind: 'error',
        message: err instanceof ApiError && err.code === 'ROOM_NOT_FOUND' ? `找不到 ${no} 號機台，請確認房號` : '訊號暫時無法載入，請稍後再試',
      });
    }
  }

  return (
    <section className="aa-signal aa-roomsig" aria-labelledby="aa-roomsig-title">
      <div className="aa-section-head">
        <h2 id="aa-roomsig-title" className="aa-display">房間訊號</h2>
        <span className="aa-section-note">輸入目前所在房號</span>
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
        <div className="aa-signal-plate">
          <ul className="aa-signal-symbols" data-count={state.data.symbols.length}>
            {state.data.symbols.map((s, i) => (
              <li key={s.symbol} className="aa-signal-cell" style={{ '--i': i } as React.CSSProperties}>
                <img src={atgSymbol(s.symbol).img} alt="" width="72" height="72" draggable={false} />
                <span className="aa-signal-mult aa-display" aria-label={`${atgSymbol(s.symbol).name} 需要 ${s.count} 個`}>
                  <span aria-hidden="true">
                    <span className="aa-signal-x">≥</span>
                    {s.count}
                  </span>
                </span>
                <span className="aa-signal-name" aria-hidden="true">
                  {atgSymbol(s.symbol).name}
                </span>
              </li>
            ))}
          </ul>
          <p className="aa-signal-summary">
            #{state.data.roomNo}：每轉結束時，盤面上以上符號都達到數量，就是訊號達標，可買免遊
          </p>
        </div>
      )}
      <p className="aa-disclaimer">訊號每間房一組，開過免遊或隔天會換新 · 不代表遊戲結果</p>
    </section>
  );
}
