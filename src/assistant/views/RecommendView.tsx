import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../../api/client.js';
import {
  fetchRecommendConfig,
  postRecommend,
  type AssistantMe,
  type RecommendConfig,
  type RecommendResponse,
  type RecommendTier,
} from '../../api/assistant.js';
import { fmtClock, fmtInt, fmtRtp, slotIconFor } from '../format.js';
import type { AssistantView } from '../AssistantApp.js';

// 本金推薦：輸入本金與目標倍數 → 伺服器依級距門檻篩出符合條件的空台（前端只顯示）

const PRESETS = [3000, 5000, 10000, 30000];
const MAX_PRINCIPAL = 100_000_000;

function tierFor(principal: number, tiers: RecommendTier[]): RecommendTier | null {
  if (tiers.length === 0) return null;
  let i = 0;
  while (i + 1 < tiers.length && principal >= tiers[i + 1]!.minPrincipal) i++;
  return tiers[i]!;
}

const ERRORS: Record<string, string> = {
  MULTIPLIER_NOT_ALLOWED: '這個本金級距不能選這麼高的倍數，請降低目標倍數',
  RECOMMEND_INPUT_INVALID: '請輸入正確的本金金額',
  GAME_NOT_FOUND: '目前沒有可推薦的遊戲',
};

export function RecommendView({ me, onNavigate }: { me: AssistantMe | null; onNavigate: (view: AssistantView) => void }) {
  const active = me?.pass.active ?? false;
  const [config, setConfig] = useState<RecommendConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [principalText, setPrincipalText] = useState('');
  const [multiplier, setMultiplier] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let alive = true;
    fetchRecommendConfig()
      .then((c) => alive && setConfig(c))
      .catch(() => alive && setConfigError(true));
    return () => {
      alive = false;
    };
  }, []);

  const principal = Number(principalText.replace(/\D/g, '')) || 0;
  const tier = useMemo(() => (config ? tierFor(principal, config.tiers) : null), [config, principal]);
  const maxMultiplier = tier?.maxMultiplier ?? 1;
  const threshold = tier && config ? tier.minScore + (multiplier - 1) * config.multiplierStepScore : null;

  // 換到較低級距時，倍數自動降到可選範圍內
  useEffect(() => {
    if (multiplier > maxMultiplier) setMultiplier(maxMultiplier);
  }, [maxMultiplier, multiplier]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (principal < 1) {
      setError('請先輸入本金');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await postRecommend(principal, multiplier);
      setResult(r);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ASSISTANT_EXPIRED') setError('使用期限已到期，請先兌換開通');
      else setError(err instanceof ApiError ? ERRORS[err.code] ?? '推薦暫時無法取得，請稍後再試' : '連線失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  if (me && !active) {
    return (
      <div className="aa-page">
        <h1 className="aa-page-title aa-display">本金推薦</h1>
        <div className="aa-locked">
          <p>輸入本金與目標倍數，從即時空台中篩出符合門檻的機台。開通後即可使用。</p>
          <button type="button" className="aa-button" onClick={() => onNavigate('exchange')}>
            用積分開通
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="aa-page">
      <h1 className="aa-page-title aa-display">本金推薦</h1>
      <p className="aa-page-lede">輸入這次準備的本金與目標倍數，從即時空台裡篩出分數達到門檻的機台。</p>

      <form className="aa-form" onSubmit={submit} noValidate>
        <label className="aa-field">
          <span className="aa-field-label">本金</span>
          <span className="aa-money">
            <input
              inputMode="numeric"
              autoComplete="off"
              placeholder="例：5,000"
              value={principalText}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                const n = Math.min(Number(digits) || 0, MAX_PRINCIPAL);
                setPrincipalText(digits ? fmtInt(n) : '');
              }}
              aria-describedby="aa-tier-hint"
            />
            <span className="aa-money-unit">元</span>
          </span>
        </label>
        <div className="aa-presets" role="group" aria-label="常用本金">
          {PRESETS.map((p) => (
            <button key={p} type="button" className={`aa-preset${principal === p ? ' is-active' : ''}`} onClick={() => setPrincipalText(fmtInt(p))}>
              {fmtInt(p)}
            </button>
          ))}
        </div>

        <fieldset className="aa-field">
          <legend className="aa-field-label">目標倍數</legend>
          <div className="aa-multipliers">
            {Array.from({ length: config?.maxMultiplier ?? 5 }, (_, i) => i + 1).map((m) => (
              <button
                key={m}
                type="button"
                className={`aa-multiplier${multiplier === m ? ' is-active' : ''}`}
                aria-pressed={multiplier === m}
                disabled={m > maxMultiplier}
                onClick={() => setMultiplier(m)}
              >
                {m} 倍
              </button>
            ))}
          </div>
        </fieldset>

        <p className="aa-tier-hint" id="aa-tier-hint">
          {configError
            ? '推薦設定載入失敗，請重新整理'
            : !config
              ? ' '
              : principal < 1
                ? '輸入本金後會顯示可選倍數與門檻'
                : `${tier?.label ?? ''} 級距 · 最高 ${maxMultiplier} 倍 · 門檻 ${threshold} 分`}
        </p>

        {error && <p className="aa-error" role="alert">{error}</p>}

        <button type="submit" className="aa-button aa-button--block" disabled={busy || !config}>
          {busy ? '篩選中…' : '查看推薦機台'}
        </button>
        {config && <p className="aa-footnote">{config.minBetAdvice}</p>}
      </form>

      {result && (
        <section className="aa-results" ref={resultRef} aria-labelledby="aa-results-title" aria-live="polite">
          <div className="aa-section-head">
            <h2 id="aa-results-title" className="aa-display">符合條件的機台</h2>
            <span className="aa-section-note">{fmtClock(result.serverTime)} 篩選</span>
          </div>
          <p className="aa-results-context">{result.context}</p>

          {result.items.length === 0 ? (
            <div className="aa-notice">
              <p>目前沒有分數達到 {result.threshold} 分的空台。可以降低目標倍數，或過幾分鐘資料更新後再試。</p>
            </div>
          ) : (
            <ol className="aa-picks">
              {result.items.map((item, i) => (
                <li key={item.room.id} className="aa-pick">
                  <div className="aa-pick-head">
                    <span className="aa-room-rank">{i + 1}</span>
                    <img className="aa-room-icon" src={slotIconFor(item.room.roomNo)} alt="" width="48" height="48" loading="lazy" />
                    <div className="aa-room-main">
                      <p className="aa-room-title">
                        <span className="aa-room-no">#{item.room.roomNo}</span>
                        {i < 2 && <img className="aa-rec-label" src="/assets/assistant/rec-label.webp" alt="推薦" width="52" height="28" />}
                        <span className="aa-chip">空台</span>
                        {item.premium && <span className="aa-chip aa-chip--solid">精品</span>}
                      </p>
                      <p className="aa-room-meta">
                        <span>未開 <b>{fmtInt(item.room.unopenedSpins)}</b></span>
                        <span>RTP <b>{fmtRtp(item.room.todayRtp)}</b></span>
                      </p>
                    </div>
                    <div className="aa-room-score">
                      <span>綜合分數</span>
                      <strong>{item.score}</strong>
                    </div>
                  </div>
                  {item.reasons.length > 0 && (
                    <ul className="aa-reasons" aria-label="推薦理由">
                      {item.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
          <p className="aa-footnote">{result.minBetAdvice}</p>
          <p className="aa-disclaimer">{result.disclaimer} · 數據僅供參考，不保證獲利</p>
        </section>
      )}
    </div>
  );
}
