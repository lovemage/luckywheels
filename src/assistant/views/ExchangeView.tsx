import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client.js';
import { fetchExchanges, postExchange, type AssistantMe, type ExchangeRecord, type TimePlan } from '../../api/assistant.js';
import { fmtInt, fmtRemaining, fmtStamp } from '../format.js';
import { InkTitle } from '../InkTitle.js';
import { exchangeClosedMessage, exchangeOpen } from '../OpenPassButton.js';

// 積分兌換：會員用輪盤系統的積分直接換使用時間。方案與文案都由後台設定（/api/assistant/me 的 plans）。

const ERRORS: Record<string, string> = {
  INSUFFICIENT_POINTS: '積分不足，無法兌換這個方案',
  EXCHANGE_PLAN_CHANGED: '方案剛剛更新了，請確認新的時數後再兌換',
  EXCHANGE_PLAN_NOT_FOUND: '這個方案已下架，請改選其他方案',
};

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function ExchangeView({ me, onChanged }: { me: AssistantMe | null; onChanged: () => Promise<void> }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [history, setHistory] = useState<ExchangeRecord[] | null>(null);
  // 同一次兌換重試沿用同一把 key（網路中斷重送不會重複扣點）；成功或換方案後才換新的
  const keyRef = useRef<string>(newKey());

  const loadHistory = () =>
    fetchExchanges()
      .then((r) => setHistory(r.items))
      .catch(() => setHistory([]));

  useEffect(() => {
    void loadHistory();
  }, []);

  if (!me) {
    return (
      <div className="aa-page">
        <InkTitle as="h1" className="aa-page-title aa-display" text="積分兌換" height={40} />
        <p className="aa-page-lede">載入中…</p>
      </div>
    );
  }

  const open = exchangeOpen(me);
  const plan: TimePlan | undefined = open ? me.plans.find((p) => p.points === selected) : undefined;
  const pass = me.pass;

  async function exchange() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await postExchange(plan, keyRef.current);
      keyRef.current = newKey();
      setSelected(null);
      setSuccess(`已兌換 ${plan.hours} 小時，可使用到 ${fmtStamp(r.pass.expiresAt)}`);
      await Promise.all([onChanged(), loadHistory()]);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      // 畫面停留期間後台關閉兌換：顯示後台設定的提示文字
      setError(code === 'EXCHANGE_DISABLED' ? (err as ApiError).message : (ERRORS[code] ?? '兌換失敗，請稍後再試；若已扣點，重新整理後會看到結果'));
      if (code === 'EXCHANGE_PLAN_CHANGED' || code === 'EXCHANGE_PLAN_NOT_FOUND' || code === 'EXCHANGE_DISABLED') {
        keyRef.current = newKey();
        setSelected(null);
        await onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="aa-page">
      <InkTitle as="h1" className="aa-page-title aa-display" text="積分兌換" height={40} />
      <p className="aa-page-lede">用輪盤的積分直接換數據助手的使用時間；使用中再兌換，會從原本的到期時間往後延長。</p>

      <dl className="aa-status">
        <div>
          <dt>目前積分</dt>
          <dd>{fmtInt(me.points)}</dd>
        </div>
        <div>
          <dt>{pass.active ? '剩餘時間' : '狀態'}</dt>
          <dd>{pass.active ? fmtRemaining(pass.remainingSeconds) : pass.expiresAt ? '已到期' : '未開通'}</dd>
        </div>
        {pass.active && (
          <div className="aa-status-wide">
            <dt>到期時間</dt>
            <dd>{fmtStamp(pass.expiresAt)}</dd>
          </div>
        )}
      </dl>

      <section aria-labelledby="aa-plans-title">
        <InkTitle id="aa-plans-title" className="aa-subhead aa-display" text="選擇方案" height={30} />
        {me.plans.length === 0 ? (
          <div className="aa-notice">
            <p>目前沒有開放兌換的方案。</p>
          </div>
        ) : (
          <div className="aa-plans" role="radiogroup" aria-label="兌換方案">
            {me.plans.map((p) => {
              const short = me.points < p.points;
              const on = selected === p.points;
              return (
                <button
                  key={p.points}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`aa-plan${on ? ' is-active' : ''}`}
                  disabled={!open || short || busy}
                  onClick={() => {
                    if (selected !== p.points) keyRef.current = newKey();
                    setSelected(p.points);
                    setError(null);
                    setSuccess(null);
                  }}
                >
                  <span className="aa-plan-hours">
                    <strong>{p.hours >= 24 && p.hours % 24 === 0 ? p.hours / 24 : p.hours}</strong>
                    {p.hours >= 24 && p.hours % 24 === 0 ? ' 天' : ' 小時'}
                  </span>
                  {p.hours === 3 && (
                    <img className="aa-rec-label aa-plan-rec" src="/assets/assistant/rec-label.webp" alt="推薦" width="52" height="28" />
                  )}
                  <span className="aa-plan-cost">{p.points} 積分</span>
                  <span className="aa-plan-label">{short ? `積分不足（差 ${p.points - me.points}）` : p.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="aa-error" role="alert">{error}</p>}
        {success && <p className="aa-success" role="status">{success}</p>}

        <button type="button" className="aa-button aa-button--block" disabled={!plan || busy} onClick={() => void exchange()}>
          {!open ? exchangeClosedMessage(me) : busy ? '兌換中…' : plan ? `確認兌換：扣 ${plan.points} 積分，增加 ${plan.hours} 小時` : '請先選擇方案'}
        </button>
        <p className="aa-footnote">兌換後立即生效，積分不退回。方案由營運調整，以兌換當下顯示為準。</p>
      </section>

      <section className="aa-history" id="aa-history" aria-labelledby="aa-history-title">
        <InkTitle id="aa-history-title" className="aa-subhead aa-display" text="兌換紀錄" height={30} />
        {history === null ? (
          <p className="aa-footnote">載入中…</p>
        ) : history.length === 0 ? (
          <p className="aa-footnote">還沒有兌換紀錄。</p>
        ) : (
          <ol className="aa-records">
            {history.map((r) => (
              <li key={r.id}>
                <div>
                  <p className="aa-record-title">
                    {r.kind === 'points_to_time' ? `兌換 ${r.hours} 小時` : r.hours > 0 ? `客服加時 ${r.hours} 小時` : `客服扣時 ${-r.hours} 小時`}
                  </p>
                  <p className="aa-record-meta">{fmtStamp(r.createdAt)} · 到期 {fmtStamp(r.expiresAfter)}</p>
                </div>
                <span className="aa-record-points">{r.kind === 'points_to_time' ? `−${r.pointsSpent}` : '—'}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
