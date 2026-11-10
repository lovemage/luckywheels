import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client.js';
import { fetchSignal, type SignalResponse } from '../api/assistant.js';
import { atgSymbol, symbolOp } from './atgSymbols.js';
import { fmtClock } from './format.js';

// 曜金訊號：首頁「精選空台 TOP 5」其中一台的房間訊號（2026-11-09 起；不公開是哪一台）。
// 會員從 TOP5 逐台用「房間訊號」查房號，符號對得上的就是那台；未開通看不到 TOP5 房號，當作開通誘因。
// 綁定機台有人入座、開過免遊、RTP 變動、資料逾時、掉出 TOP5 或換日，伺服器在讀取時自動換組。
// 「免遊結束，換一組」按鈕已移到房間訊號（換的是自己正在玩的那台）。
// 首頁停留時每分鐘重抓一次，讓自動換組能及時反映。

const symbolList = (symbols: { symbol: string; count: number }[]) =>
  symbols.map((x) => `${atgSymbol(x.symbol).name} ${symbolOp(x.symbol)} ${x.count}`).join('、');

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: SignalResponse };

export function SignalCard({ onExpired, locked = false }: { onExpired?: () => void; /** 未開通：看不到 TOP5 房號 */ locked?: boolean }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [note, setNote] = useState<string | null>(null);
  const alive = useRef(true);

  const apply = useCallback(
    (data: SignalResponse) => {
      if (!alive.current) return;
      setState({ kind: 'ready', data });
      if (data.replaced) setNote(data.replaced.message);
    },
    [],
  );

  const fail = useCallback(
    (e: unknown) => {
      if (!alive.current) return;
      if (e instanceof ApiError && e.code === 'ASSISTANT_EXPIRED') {
        onExpired?.();
        return;
      }
      setState((s) => (s.kind === 'ready' ? s : { kind: 'error' }));
    },
    [onExpired],
  );

  useEffect(() => {
    alive.current = true;
    const load = () => fetchSignal().then(apply).catch(fail);
    void load();
    const t = window.setInterval(load, 60_000);
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [apply, fail]);

  const data = state.kind === 'ready' ? state.data : null;
  const signal = data?.signal ?? null;

  return (
    <section className="aa-signal" aria-labelledby="aa-signal-title">
      <div className="aa-section-head">
        <h2 id="aa-signal-title" className="aa-display">曜金訊號</h2>
        {signal && <span className="aa-section-note">發出 {fmtClock(signal.issuedAt)}</span>}
      </div>
      <p className="aa-signal-intro">
        {locked
          ? '上方 TOP 5 其中一台的房間訊號，不公開是哪一台。開通後看得到這五台的房號，逐台查房間訊號，對得上的就是那台'
          : '上方 TOP 5 其中一台的房間訊號，不公開是哪一台。逐台用房間訊號查房號，對得上的就是那台'}
      </p>

      {state.kind === 'loading' && (
        <div className="aa-signal-plate is-skeleton" aria-busy="true">
          <ul className="aa-signal-symbols">
            {[0, 1, 2].map((i) => (
              <li key={i} className="aa-signal-cell">
                <span className="aa-skel aa-skel--icon" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="aa-notice" role="alert">
          <p>訊號暫時無法載入，請稍後再試。</p>
        </div>
      )}

      {data && !signal && (
        <div className="aa-notice">
          <p>{data.message ?? '目前沒有符合條件的空台，稍後資料更新再試'}</p>
        </div>
      )}

      {signal && (
        <div className="aa-signal-plate" key={signal.id}>
          <ul className="aa-signal-symbols" data-count={signal.symbols.length}>
            {signal.symbols.map((s, i) => (
              <li key={s.symbol} className="aa-signal-cell" style={{ '--i': i } as React.CSSProperties}>
                <img src={atgSymbol(s.symbol).img} alt="" width="72" height="72" draggable={false} />
                <span className="aa-signal-mult aa-display" aria-label={`${atgSymbol(s.symbol).name} ${symbolOp(s.symbol) === '≥' ? '至少' : '剛好'} ${s.count} 個`}>
                  <span aria-hidden="true"><span className="aa-signal-x">{symbolOp(s.symbol)}</span>{s.count}</span>
                </span>
                <span className="aa-signal-name" aria-hidden="true">{atgSymbol(s.symbol).name}</span>
              </li>
            ))}
          </ul>
          <p className="aa-signal-summary">盤面 {symbolList(signal.symbols)}</p>
          <div className="aa-signal-meter">
            <span className="aa-signal-meter-label">訊號強度</span>
            <span
              className="aa-signal-meter-track"
              role="meter"
              aria-label="訊號強度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={signal.strength}
            >
              <span className="aa-signal-meter-fill" style={{ width: `${signal.strength}%` }} />
            </span>
            <strong className="aa-signal-meter-value">{signal.strength}%</strong>
          </div>
        </div>
      )}

      {note && (
        <p className="aa-signal-note" role="status">
          {note}
        </p>
      )}


      <p className="aa-disclaimer">強度依機台綜合分數換算 · {data?.disclaimer ?? '數據攻略僅供參考'}</p>
    </section>
  );
}
