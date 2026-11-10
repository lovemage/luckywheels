import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { backToGame, reportDockHeight, requestDockMode } from '../../native.js';
import { atgSymbol, isScatterSymbol, symbolOp } from '../atgSymbols.js';
import { needsScatterUpdate, nextRoomSignalSet, roomSignalState, setRoomSignalEnabled, subscribeRoomSignal, symbolMet } from './roomSignal.js';
import '../assistant.css';
import './dock.css';

// 房間訊號浮窗（App 1.4.0+）：只顯示目前機台的訊號——每種符號「最近一轉的數量／門檻」，
// 全部達標時顯示「訊號達標，可買免遊」。窄版，疊在遊戲一角，不擋操作。
// 每台每天依序 5 組：買完免遊按「換下一組」（組數與完整助手的房間訊號共用）。

export function SignalFloat() {
  const rootRef = useRef<HTMLDivElement>(null);
  const st = useSyncExternalStore(subscribeRoomSignal, roomSignalState);

  // 打開浮窗＝開啟比對
  useEffect(() => {
    if (!roomSignalState().enabled) setRoomSignalEnabled(true);
  }, []);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const report = () => reportDockHeight(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const off = () => {
    setRoomSignalEnabled(false);
    backToGame();
  };

  return (
    <div className={`aa-dock aa-sigfloat${st.hit ? ' is-hit' : ''}`} ref={rootRef}>
      <header className="aa-sigfloat-head">
        <p>
          {st.roomNo ? <span className="aa-dock-room">#{st.roomNo}</span> : null}
          <span className="aa-sigfloat-title">房間訊號</span>
          {st.symbols && st.setTotal > 1 && (
            <span className="aa-sigfloat-set">
              {st.setIndex + 1}/{st.setTotal} 組
            </span>
          )}
        </p>
        <button type="button" className="aa-dock-close" onClick={backToGame} aria-label="收合訊號浮窗">
          收合
        </button>
      </header>

      {st.hit && (
        <p className="aa-sigfloat-hit" role="alert">
          訊號達標！可買免遊
        </p>
      )}

      {st.status === 'no-room' && <p className="aa-dock-note">進入遊戲、坐上機台後顯示訊號</p>}
      {st.status === 'loading' && <p className="aa-dock-note">讀取訊號中…</p>}
      {st.status === 'expired' && <p className="aa-dock-note">使用期限已到期，請先用積分開通</p>}
      {st.status === 'error' && <p className="aa-dock-note">訊號暫時無法載入</p>}

      {st.symbols && (
        <ul className="aa-sigfloat-rows" aria-label="訊號符號：最近一轉數量／門檻">
          {st.symbols.map((s) => {
            const unknown = needsScatterUpdate(st.symbols!, st.counts) && isScatterSymbol(s.symbol);
            const cur = unknown ? undefined : st.counts?.[s.symbol] ?? (st.counts ? 0 : undefined);
            const ok = symbolMet(s.symbol, cur, s.count);
            const need = symbolOp(s.symbol) === '≥' ? `≥${s.count}` : s.count;
            return (
              <li key={s.symbol} className={ok ? 'is-ok' : undefined}>
                <img src={atgSymbol(s.symbol).img} alt="" width="34" height="34" />
                <span className="aa-sigfloat-name">{atgSymbol(s.symbol).name}</span>
                <span className="aa-sigfloat-count" aria-label={`${atgSymbol(s.symbol).name} 最近一轉 ${cur ?? '未讀取'} 個，需要${symbolOp(s.symbol) === '≥' ? '至少' : '剛好'} ${s.count} 個${ok ? '，已達標' : ''}`}>
                  <b>{cur ?? '–'}</b>/{need}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {st.symbols && needsScatterUpdate(st.symbols, st.counts) && (
        <p className="aa-dock-note">這組含甲蟲／彩甲，請更新 App 至 1.5.1 才能自動比對</p>
      )}
      <p className="aa-sigfloat-foot">今日達標 {st.today} 次 · 不代表遊戲結果</p>
      {st.symbols && st.setTotal > 1 && (
        <button
          type="button"
          className="aa-dock-btn aa-sigfloat-next"
          disabled={st.setIndex + 1 >= st.setTotal}
          onClick={() => nextRoomSignalSet()}
        >
          {st.setIndex + 1 >= st.setTotal ? '今天這台的訊號已用完' : '免遊結束，換下一組'}
        </button>
      )}
      <div className="aa-sigfloat-actions">
        <button type="button" className="aa-dock-btn" onClick={() => requestDockMode('dock')}>
          小卡
        </button>
        <button type="button" className="aa-dock-btn" onClick={off}>
          關閉訊號
        </button>
      </div>
    </div>
  );
}
