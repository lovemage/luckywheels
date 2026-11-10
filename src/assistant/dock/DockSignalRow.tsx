import { useEffect, useSyncExternalStore } from 'react';
import { atgSymbol } from '../atgSymbols.js';
import { ensureRoomSignal, meets, roomSignalState, subscribeRoomSignal, symbolMet } from './roomSignal.js';

// 駐守小卡裡的一行房間訊號：每個符號「最近一轉數量／門檻」，全部達到時標示可買免遊。
// 點一下打開完整的訊號浮窗（App 1.4.0+）。舊版 App 讀不到盤面，只顯示門檻。

export function DockSignalRow({ roomNo, onOpen }: { roomNo: string; onOpen?: () => void }) {
  const st = useSyncExternalStore(subscribeRoomSignal, roomSignalState);
  const mine = st.roomNo === roomNo;

  useEffect(() => {
    ensureRoomSignal();
  }, [roomNo, st.roomNo, st.symbols]);

  if (!mine || !st.symbols) {
    if (st.status === 'expired') return null;
    return <p className="aa-dock-note aa-dock-sig-note">{st.status === 'error' ? '訊號暫時無法載入' : '讀取房間訊號中…'}</p>;
  }

  const counts = st.counts;
  const hit = !!counts && meets(st.symbols, counts);
  const body = (
    <>
      <span className="aa-dock-sig-label">訊號</span>
      <span className="aa-dock-sig-list">
        {st.symbols.map((s) => {
          const cur = counts?.[s.symbol];
          const ok = symbolMet(cur, s.count);
          return (
            <span key={s.symbol} className={`aa-dock-sig-item${ok ? ' is-ok' : ''}`}>
              <img src={atgSymbol(s.symbol).img} alt="" width="22" height="22" />
              <b>{counts ? `${cur ?? 0}/${s.count}` : `=${s.count}`}</b>
            </span>
          );
        })}
      </span>
      {hit && <span className="aa-dock-sig-hit">可買免遊</span>}
    </>
  );
  const label = `房間訊號 #${roomNo}：${st.symbols
    .map((s) => `${atgSymbol(s.symbol).name} ${counts ? `${counts[s.symbol] ?? 0}/` : '需要 '}${s.count}`)
    .join('、')}${hit ? '，訊號達標，可買免遊' : ''}`;

  return onOpen ? (
    <button type="button" className={`aa-dock-sig${hit ? ' is-hit' : ''}`} onClick={onOpen} aria-label={`${label}（點開訊號浮窗）`}>
      {body}
    </button>
  ) : (
    <p className={`aa-dock-sig${hit ? ' is-hit' : ''}`} aria-label={label}>
      {body}
    </p>
  );
}
