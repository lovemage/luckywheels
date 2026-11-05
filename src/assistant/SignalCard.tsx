import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client.js';
import { fetchSignal, refreshSignal, type SignalResponse, type SignalSymbol } from '../api/assistant.js';
import { fmtClock } from './format.js';

// 曜金訊號：2–3 種金屬（銀／黃金／白金／曜金）×倍數＋強度。
// 符號組合隨機，但每則都綁一間發出當下符合條件的真實空台（會員看不到是哪一台）；
// 綁定機台有人入座、開過免遊、RTP 變動或資料逾時，伺服器在讀取時自動換組。
// 首頁停留時每分鐘重抓一次，讓自動換組能及時反映。

const METALS: Record<SignalSymbol, string> = {
  silver: '銀',
  gold: '黃金',
  platinum: '白金',
  obsidian: '曜金',
};

const metalName = (s: string) => METALS[s as SignalSymbol] ?? '黃金';
const metalSrc = (s: string) => `/assets/assistant/metal/${s in METALS ? s : 'gold'}.webp`;

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: SignalResponse };

export function SignalCard({ onExpired }: { onExpired?: () => void }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const onRefresh = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      apply(await refreshSignal());
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SIGNAL_REFRESH_COOLDOWN') {
        const sec = Number(/(\d+)/.exec(e.message)?.[1]);
        setError(sec ? `剛換過，請 ${sec} 秒後再換` : '剛換過，請稍後再換');
      } else if (e instanceof ApiError && e.code === 'ASSISTANT_EXPIRED') {
        onExpired?.();
      } else {
        setError('換組失敗，請稍後再試');
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const data = state.kind === 'ready' ? state.data : null;
  const signal = data?.signal ?? null;

  return (
    <section className="aa-signal" aria-labelledby="aa-signal-title">
      <div className="aa-section-head">
        <h2 id="aa-signal-title" className="aa-display">曜金訊號</h2>
        {signal && <span className="aa-section-note">發出 {fmtClock(signal.issuedAt)}</span>}
      </div>

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
                <img src={metalSrc(s.symbol)} alt="" width="72" height="72" draggable={false} />
                <span className="aa-signal-mult aa-display" aria-label={`${metalName(s.symbol)} ${s.multiplier} 倍`}>
                  <span aria-hidden="true"><span className="aa-signal-x">×</span>{s.multiplier}</span>
                </span>
                <span className="aa-signal-name" aria-hidden="true">{metalName(s.symbol)}</span>
              </li>
            ))}
          </ul>
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

      {data && (
        <button type="button" className="aa-button aa-button--ghost aa-button--block" disabled={busy} onClick={onRefresh}>
          {busy ? '換組中…' : '免遊結束，換一組'}
        </button>
      )}
      {error && (
        <p className="aa-error" role="alert">
          {error}
        </p>
      )}

      <p className="aa-disclaimer">強度依機台綜合分數換算 · {data?.disclaimer ?? '數據攻略僅供參考'}</p>
    </section>
  );
}
