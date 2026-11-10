import { useEffect, useSyncExternalStore } from 'react';
import { atgSymbol, isScatterSymbol, symbolOp } from '../atgSymbols.js';
import { ensureRoomSignal, meets, needsScatterUpdate, nextRoomSignalSet, roomSignalState, subscribeRoomSignal, symbolMet } from './roomSignal.js';

// 駐守小卡裡的一行房間訊號：每個符號「最近一轉數量／門檻」，全部達到時標示可買免遊。
// 點一下打開完整的訊號浮窗（App 1.4.0+）。舊版 App 讀不到盤面，只顯示門檻（大圖「=」、寶石「≥」）。
// 右側「換」＝免遊結束換下一組（每台每天 5 組，與網頁版查房號共用組數；2026-11-10 業主）。

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

  const symbols = st.symbols;
  const counts = st.counts;
  const noScatter = needsScatterUpdate(symbols, counts);
  const curOf = (symbol: string) => (!counts || (noScatter && isScatterSymbol(symbol)) ? undefined : (counts[symbol] ?? 0));
  const hit = !!counts && meets(symbols, counts);
  const body = (
    <>
      <span className="aa-dock-sig-label">訊號</span>
      <span className="aa-dock-sig-list">
        {symbols.map((s) => {
          const cur = curOf(s.symbol);
          const ok = symbolMet(s.symbol, cur, s.count);
          const op = symbolOp(s.symbol);
          return (
            <span key={s.symbol} className={`aa-dock-sig-item${ok ? ' is-ok' : ''}`}>
              <img src={atgSymbol(s.symbol).img} alt="" width="22" height="22" />
              <b>{counts ? `${cur ?? '–'}/${op === '≥' ? '≥' : ''}${s.count}` : `${op}${s.count}`}</b>
            </span>
          );
        })}
      </span>
      {hit && <span className="aa-dock-sig-hit">可買免遊</span>}
    </>
  );
  const label = `房間訊號 #${roomNo} 第 ${st.setIndex + 1} 組：${symbols
    .map((s) => {
      const cur = curOf(s.symbol);
      return `${atgSymbol(s.symbol).name} ${cur !== undefined ? `${cur}／` : ''}${symbolOp(s.symbol) === '≥' ? '至少' : '剛好'} ${s.count}`;
    })
    .join('、')}${hit ? '，訊號達標，可買免遊' : ''}`;

  const last = st.setIndex + 1 >= st.setTotal;
  return (
    <div className="aa-dock-sigline">
      {onOpen ? (
        <button type="button" className={`aa-dock-sig${hit ? ' is-hit' : ''}`} onClick={onOpen} aria-label={`${label}（點開訊號浮窗）`}>
          {body}
        </button>
      ) : (
        <p className={`aa-dock-sig${hit ? ' is-hit' : ''}`} aria-label={label}>
          {body}
        </p>
      )}
      {st.setTotal > 1 && (
        <button
          type="button"
          className="aa-dock-chip aa-dock-chip--ghost aa-dock-sig-next"
          disabled={last}
          onClick={() => nextRoomSignalSet()}
          aria-label={last ? '今天這台的訊號已用完' : `免遊結束，換下一組訊號（目前第 ${st.setIndex + 1}／${st.setTotal} 組）`}
        >
          <span>換</span>
          <small>
            {st.setIndex + 1}/{st.setTotal}
          </small>
        </button>
      )}
    </div>
  );
}
