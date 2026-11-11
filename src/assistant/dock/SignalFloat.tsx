import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { backToGame, reportDockHeight, requestDockMode } from '../../native.js';
import { atgSymbol, isScatterSymbol } from '../atgSymbols.js';
import {
  activeSymbols,
  clearCustomTargets,
  CUSTOM_MAX,
  CUSTOM_SYMBOLS,
  customSymbols,
  needsScatterUpdate,
  nextRoomSignalSet,
  opOf,
  roomSignalState,
  setCustomTarget,
  setRoomSignalEnabled,
  setSignalMode,
  subscribeRoomSignal,
  symbolMet,
  type RoomSignalState,
  type RoomSignalSymbol,
} from './roomSignal.js';
import '../assistant.css';
import './dock.css';

// 房間訊號浮窗（App 1.4.0+）：只顯示目前機台的訊號——每種符號「最近一轉的數量／門檻」，
// 全部達標時顯示「訊號達標，可買免遊」。窄版，疊在遊戲一角，不擋操作。
// 每台每天依序 5 組：買完免遊按「換下一組」（組數與完整助手的房間訊號共用）。
// 自訂訊號（2026-11-11 業主）：會員自己設定每個符號的目標（0＝不看），全部達到（≥）就提醒。

export function SignalFloat() {
  const rootRef = useRef<HTMLDivElement>(null);
  const st = useSyncExternalStore(subscribeRoomSignal, roomSignalState);
  const custom = st.mode === 'custom';
  const customList = customSymbols(st.custom);
  // 還沒設定任何目標時直接進入設定
  const [editing, setEditing] = useState(() => customSymbols(roomSignalState().custom).length === 0);
  const symbols = activeSymbols(st);
  const showEditor = custom && (editing || customList.length === 0);

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
    <div className={`aa-dock aa-sigfloat${st.hit && !showEditor ? ' is-hit' : ''}`} ref={rootRef}>
      <header className="aa-sigfloat-head">
        <p>
          {st.roomNo ? <span className="aa-dock-room">#{st.roomNo}</span> : null}
          <span className="aa-sigfloat-title">{custom ? '自訂訊號' : '房間訊號'}</span>
          {!custom && st.symbols && st.setTotal > 1 && (
            <span className="aa-sigfloat-set">
              {st.setIndex + 1}/{st.setTotal} 組
            </span>
          )}
        </p>
        <button type="button" className="aa-dock-close" onClick={backToGame} aria-label="收合訊號浮窗">
          收合
        </button>
      </header>

      <div className="aa-sigfloat-modes" role="group" aria-label="訊號來源">
        <button type="button" aria-pressed={!custom} onClick={() => setSignalMode('room')}>
          房間訊號
        </button>
        <button type="button" aria-pressed={custom} onClick={() => setSignalMode('custom')}>
          自訂訊號
        </button>
      </div>

      {st.hit && !showEditor && (
        <p className="aa-sigfloat-hit" role="alert">
          {custom ? '自訂訊號達標！' : '訊號達標！'}可買免遊
        </p>
      )}

      {st.freeGame && symbols && symbols.length > 0 && <p className="aa-dock-note">免遊中，暫停比對；免遊結束後從下一轉開始</p>}
      {!custom && st.status === 'no-room' && <p className="aa-dock-note">進入遊戲、坐上機台後顯示訊號</p>}
      {!custom && st.status === 'loading' && <p className="aa-dock-note">讀取訊號中…</p>}
      {!custom && st.status === 'expired' && <p className="aa-dock-note">使用期限已到期，請先用積分開通</p>}
      {!custom && st.status === 'error' && <p className="aa-dock-note">訊號暫時無法載入</p>}

      {showEditor ? (
        <CustomEditor st={st} />
      ) : (
        symbols &&
        symbols.length > 0 && <SignalRows st={st} symbols={symbols} />
      )}

      {showEditor && <p className="aa-dock-note aa-sigfloat-hint">每轉結束時，設定的符號全部達到目標就提醒</p>}
      {custom && (
        <div className="aa-sigfloat-actions">
          {showEditor && customList.length > 0 && (
            <button type="button" className="aa-dock-btn" onClick={clearCustomTargets}>
              全部清除
            </button>
          )}
          <button
            type="button"
            className={`aa-dock-btn${showEditor ? ' aa-dock-btn--solid' : ''}`}
            disabled={showEditor && customList.length === 0}
            onClick={() => setEditing(!showEditor)}
          >
            {showEditor ? (customList.length === 0 ? '先設定至少一個符號' : '完成，開始比對') : '修改目標'}
          </button>
        </div>
      )}

      {symbols && needsScatterUpdate(symbols, st.counts) && (
        <p className="aa-dock-note">這組含甲蟲／彩甲，請更新 App 至 1.5.1 才能自動比對</p>
      )}
      <p className="aa-sigfloat-foot">今日達標 {st.today} 次 · 不代表遊戲結果</p>
      {!custom && st.symbols && st.setTotal > 1 && (
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

/** 比對結果：每個符號「最近一轉數量／門檻」 */
function SignalRows({ st, symbols }: { st: RoomSignalState; symbols: RoomSignalSymbol[] }) {
  return (
    <ul className="aa-sigfloat-rows" aria-label="訊號符號：最近一轉數量／門檻">
      {symbols.map((s) => {
        const unknown = needsScatterUpdate(symbols, st.counts) && isScatterSymbol(s.symbol);
        const cur = unknown ? undefined : st.counts?.[s.symbol] ?? (st.counts ? 0 : undefined);
        const ok = symbolMet(s.symbol, cur, s.count, st.mode);
        const op = opOf(s.symbol, st.mode);
        const name = atgSymbol(s.symbol).name;
        return (
          <li key={s.symbol} className={ok ? 'is-ok' : undefined}>
            <img src={atgSymbol(s.symbol).img} alt="" width="34" height="34" />
            <span className="aa-sigfloat-name">{name}</span>
            <span
              className="aa-sigfloat-count"
              aria-label={`${name} 最近一轉 ${cur ?? '未讀取'} 個，需要${op === '≥' ? '至少' : '剛好'} ${s.count} 個${ok ? '，已達標' : ''}`}
            >
              <b>{cur ?? '–'}</b>/{op === '≥' ? `≥${s.count}` : s.count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** 自訂訊號設定：每個符號一行「目前 N」＋目標 −／＋ */
function CustomEditor({ st }: { st: RoomSignalState }) {
  return (
    <ul className="aa-sigfloat-rows aa-sigfloat-edit" aria-label="自訂訊號目標">
      {CUSTOM_SYMBOLS.map((k) => {
        const need = st.custom[k] ?? 0;
        const cur = st.counts ? (st.counts[k] ?? (isScatterSymbol(k) && !('scarab' in st.counts) ? undefined : 0)) : undefined;
        const name = atgSymbol(k).name;
        return (
          <li key={k} className={need > 0 ? 'is-set' : undefined}>
            <img src={atgSymbol(k).img} alt="" width="30" height="30" />
            <span className="aa-sigfloat-edit-info">
              <span className="aa-sigfloat-name">{name}</span>
              <small>目前 {cur ?? '–'}</small>
            </span>
            <span className="aa-sigfloat-step">
              <button type="button" disabled={need <= 0} onClick={() => setCustomTarget(k, need - 1)} aria-label={`${name}目標減一`}>
                −
              </button>
              <output aria-label={`${name}目標`}>{need > 0 ? `≥${need}` : '不看'}</output>
              <button type="button" disabled={need >= CUSTOM_MAX} onClick={() => setCustomTarget(k, need + 1)} aria-label={`${name}目標加一`}>
                ＋
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
