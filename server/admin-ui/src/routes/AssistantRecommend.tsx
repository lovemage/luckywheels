import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAssistantSettings,
  fetchSignals,
  updateAssistantSettings,
  type AssistantSettings,
  type ScoreMetric,
  type SignalEndReason,
} from '../api/assistant-settings.js';
import { ApiError } from '../api/client.js';

// 數據助手：綜合分數、本金推薦、資料逾時與訊號參數。一次儲存整份設定（會員端立即套用）。

const SETTINGS_KEY = ['admin', 'assistant', 'settings'] as const;
const SIGNALS_KEY = ['admin', 'assistant', 'signals'] as const;
const MAX_MULTIPLIER = 5;

const METRICS: { key: ScoreMetric; label: string; hint: string }[] = [
  { key: 'unopened', label: '未開轉數', hint: '越多分數越高' },
  { key: 'todayRtp', label: '今日 RTP', hint: '越低分數越高' },
  { key: 'thirtyDayRtp', label: '近 30 天 RTP', hint: '越高分數越高' },
  { key: 'todayBet', label: '今日下注（熱度）', hint: '越高分數越高' },
];

const END_REASONS: Record<SignalEndReason, string> = {
  member_refresh: '會員換組',
  bonus_detected: '已開免遊',
  rtp_changed: 'RTP 變動',
  room_unavailable: '有人入座',
  data_stale: '資料逾時',
};

const SYMBOL_LABELS: Record<string, string> = {
  yellow_gem: '黃寶石',
  red_gem: '紅寶石',
  blue_gem: '藍寶石',
  green_gem: '綠寶石',
  purple_gem: '紫寶石',
  scarab: '聖甲蟲',
};

const TIME_FORMAT = new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const fmtTime = (iso: string | null) => (iso ? TIME_FORMAT.format(new Date(iso)) : '—');
const fmtMoney = (n: number) => n.toLocaleString('en-US');

// 表單一律存字串，送出時再轉數字（避免輸入途中被強制改值）
type Str<T> = { [K in keyof T]: T[K] extends number ? string : T[K] extends object ? Str<T[K]> : T[K] };
type TierForm = { minPrincipal: string; minScore: string; maxMultiplier: string };
interface Form {
  weights: Record<ScoreMetric, string>;
  tiers: TierForm[];
  multiplierStepScore: string;
  count: string;
  minBetAdvice: string;
  premiumPercent: string;
  listMaxAgeMinutes: string;
  detailMaxAgeMinutes: string;
  signal: Str<AssistantSettings['signal']>;
}

function toForm(s: AssistantSettings): Form {
  const str = (n: number) => String(n);
  return {
    weights: Object.fromEntries(METRICS.map((m) => [m.key, str(s.recommend.weights[m.key])])) as Record<ScoreMetric, string>,
    tiers: s.recommend.tiers.map((t) => ({ minPrincipal: str(t.minPrincipal), minScore: str(t.minScore), maxMultiplier: str(t.maxMultiplier) })),
    multiplierStepScore: str(s.recommend.multiplierStepScore),
    count: str(s.recommend.count),
    minBetAdvice: str(s.recommend.minBetAdvice),
    premiumPercent: str(s.recommend.premiumPercent),
    listMaxAgeMinutes: str(Math.round(s.freshness.listMaxAgeSeconds / 60)),
    detailMaxAgeMinutes: str(Math.round(s.freshness.detailMaxAgeSeconds / 60)),
    signal: {
      minScore: str(s.signal.minScore),
      rtpChangePoints: str(s.signal.rtpChangePoints),
      maxPerRoom: str(s.signal.maxPerRoom),
      refreshCooldownSeconds: str(s.signal.refreshCooldownSeconds),
      strengthMin: str(s.signal.strengthMin),
      strengthMax: str(s.signal.strengthMax),
    },
  };
}

function fromForm(f: Form): AssistantSettings {
  const n = Number;
  return {
    recommend: {
      weights: Object.fromEntries(METRICS.map((m) => [m.key, n(f.weights[m.key])])) as Record<ScoreMetric, number>,
      tiers: f.tiers
        .map((t) => ({ minPrincipal: n(t.minPrincipal), minScore: n(t.minScore), maxMultiplier: n(t.maxMultiplier) }))
        .sort((a, b) => a.minPrincipal - b.minPrincipal),
      multiplierStepScore: n(f.multiplierStepScore),
      count: n(f.count),
      minBetAdvice: n(f.minBetAdvice),
      premiumPercent: n(f.premiumPercent),
    },
    freshness: { listMaxAgeSeconds: n(f.listMaxAgeMinutes) * 60, detailMaxAgeSeconds: n(f.detailMaxAgeMinutes) * 60 },
    signal: {
      minScore: n(f.signal.minScore),
      rtpChangePoints: n(f.signal.rtpChangePoints),
      maxPerRoom: n(f.signal.maxPerRoom),
      refreshCooldownSeconds: n(f.signal.refreshCooldownSeconds),
      strengthMin: n(f.signal.strengthMin),
      strengthMax: n(f.signal.strengthMax),
    },
  };
}

/** 本機先擋明顯錯誤；完整規則由伺服器驗證 */
function validate(s: AssistantSettings): string | null {
  const isInt = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;
  const w = Object.values(s.recommend.weights);
  if (w.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) return '權重需為 0–100';
  if (!w.some((v) => v > 0)) return '至少一個權重要大於 0';
  const t = s.recommend.tiers;
  if (t.length === 0) return '至少需要一個本金級距';
  if (t[0]!.minPrincipal !== 0) return '第一個級距的起始本金必須是 0';
  if (new Set(t.map((x) => x.minPrincipal)).size !== t.length) return '級距的起始本金不可重複';
  for (const x of t) {
    if (!isInt(x.minPrincipal, 0, 100_000_000)) return '起始本金需為 0 以上的整數';
    if (!isInt(x.minScore, 0, 100)) return '分數門檻需為 0–100 的整數';
    if (!isInt(x.maxMultiplier, 1, MAX_MULTIPLIER)) return `最高倍數需為 1–${MAX_MULTIPLIER}`;
  }
  if (!isInt(s.recommend.multiplierStepScore, 0, 20)) return '每倍加分需為 0–20 的整數';
  if (!isInt(s.recommend.count, 1, 20)) return '推薦間數需為 1–20';
  if (!isInt(s.recommend.minBetAdvice, 1, 100_000)) return '建議單注需為 1 以上的整數';
  if (!isInt(s.recommend.premiumPercent, 0, 100)) return '精品比例需為 0–100';
  if (!isInt(s.freshness.listMaxAgeSeconds / 60, 1, 1440)) return '列表逾時需為 1–1440 分鐘';
  if (!isInt(s.freshness.detailMaxAgeSeconds / 60, 1, 4320)) return '細項逾時需為 1–4320 分鐘';
  const g = s.signal;
  if (!isInt(g.minScore, 0, 100)) return '訊號最低分數需為 0–100';
  if (!Number.isFinite(g.rtpChangePoints) || g.rtpChangePoints < 0.5 || g.rtpChangePoints > 100) return 'RTP 變動門檻需為 0.5–100';
  if (!isInt(g.maxPerRoom, 1, 50)) return '每間房訊號上限需為 1–50';
  if (!isInt(g.refreshCooldownSeconds, 0, 3600)) return '換組冷卻需為 0–3600 秒';
  if (!isInt(g.strengthMin, 1, 99) || !isInt(g.strengthMax, 1, 99)) return '訊號強度需為 1–99';
  if (g.strengthMin > g.strengthMax) return '強度下限不可大於上限';
  return null;
}

function tierLabel(tiers: { minPrincipal: number }[], i: number) {
  const next = tiers[i + 1];
  if (tiers.length === 1) return '不限金額';
  if (i === 0) return `${fmtMoney(next!.minPrincipal)} 以下`;
  if (!next) return `${fmtMoney(tiers[i]!.minPrincipal)} 以上`;
  return `${fmtMoney(tiers[i]!.minPrincipal)}–${fmtMoney(next.minPrincipal - 1)}`;
}

function NumberField({ label, value, onChange, hint, step, suffix }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  step?: string;
  suffix?: string;
}) {
  return (
    <label>
      <span>{label}{suffix ? `（${suffix}）` : ''}</span>
      <input type="number" inputMode="decimal" step={step ?? '1'} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function AssistantRecommend() {
  const settings = useQuery({ queryKey: SETTINGS_KEY, queryFn: fetchAssistantSettings });
  const signals = useQuery({ queryKey: SIGNALS_KEY, queryFn: () => fetchSignals(50), refetchInterval: 60_000 });

  return (
    <section className="member-detail-page assistant-settings-page">
      <header className="member-detail-hero">
        <div>
          <h1>推薦與訊號設定</h1>
          <p>綜合分數、本金推薦、資料逾時與訊號的參數。儲存後會員端立即套用；對會員只顯示「排序參考」，不顯示公式。</p>
        </div>
      </header>

      {settings.isLoading ? (
        <p>載入中…</p>
      ) : settings.data ? (
        <SettingsForm initial={settings.data} />
      ) : (
        <p className="member-detail-error" role="alert">無法載入設定</p>
      )}

      <section className="member-detail-card">
        <h2>近期訊號（最近 50 則）</h2>
        <p className="admin-muted-text">綁定房間只在後台顯示，會員端看不到房號。</p>
        {signals.isLoading ? (
          <p>載入中…</p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-prize-table collector-table">
              <thead>
                <tr>
                  <th>發出時間</th>
                  <th>會員</th>
                  <th>綁定房號</th>
                  <th>符號</th>
                  <th className="is-numeric">分數</th>
                  <th className="is-numeric">強度</th>
                  <th className="is-numeric">發出時 RTP</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                {(signals.data?.items ?? []).map((s) => (
                  <tr key={s.id}>
                    <td>{fmtTime(s.issuedAt)}</td>
                    <td>{s.userName ?? s.userId}</td>
                    <td className="is-numeric">{s.roomNo}</td>
                    <td className="is-wrap">{s.symbols.map((x) => `${SYMBOL_LABELS[x.symbol] ?? x.symbol} ×${x.multiplier}`).join('、')}</td>
                    <td className="is-numeric">{s.scoreAtIssue}</td>
                    <td className="is-numeric">{s.strength}%</td>
                    <td className="is-numeric">{s.rtpAtIssue}%</td>
                    <td>
                      {s.endedAt ? (
                        <span className="admin-status-badge admin-status-badge--cancelled">
                          {END_REASONS[s.endReason!] ?? s.endReason}・{fmtTime(s.endedAt)}
                        </span>
                      ) : (
                        <span className="admin-status-badge admin-status-badge--delivered">有效</span>
                      )}
                    </td>
                  </tr>
                ))}
                {signals.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={8}>尚無訊號</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function SettingsForm({ initial }: { initial: AssistantSettings }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(() => toForm(initial));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setForm(toForm(initial)), [initial]);

  const mut = useMutation({
    mutationFn: updateAssistantSettings,
    onSuccess: (saved) => {
      setMessage('設定已儲存，會員端立即套用');
      setError(null);
      qc.setQueryData(SETTINGS_KEY, saved);
    },
    onError: (e) => {
      setMessage(null);
      setError(e instanceof ApiError ? (e.code === 'ASSISTANT_SETTINGS_INVALID' ? e.message : `儲存失敗（${e.code}）`) : '儲存失敗');
    },
  });

  const weightTotal = METRICS.reduce((sum, m) => sum + Math.max(0, Number(form.weights[m.key]) || 0), 0);
  const share = (k: ScoreMetric) => (weightTotal > 0 ? Math.round(((Number(form.weights[k]) || 0) / weightTotal) * 100) : 0);

  // 門檻預覽：門檻 = 級距分數 +（倍數 − 1）× 每倍加分
  const preview = useMemo(() => {
    const step = Number(form.multiplierStepScore) || 0;
    const tiers = form.tiers
      .map((t) => ({ minPrincipal: Number(t.minPrincipal), minScore: Number(t.minScore), maxMultiplier: Number(t.maxMultiplier) }))
      .filter((t) => Number.isFinite(t.minPrincipal))
      .sort((a, b) => a.minPrincipal - b.minPrincipal);
    return tiers.map((t, i) => ({
      label: tierLabel(tiers, i),
      cells: Array.from({ length: MAX_MULTIPLIER }, (_, k) => (k + 1 <= t.maxMultiplier ? t.minScore + k * step : null)),
    }));
  }, [form.tiers, form.multiplierStepScore]);

  const setTier = (i: number, patch: Partial<TierForm>) =>
    setForm({ ...form, tiers: form.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const setSignal = (patch: Partial<Form['signal']>) => setForm({ ...form, signal: { ...form.signal, ...patch } });

  function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const body = fromForm(form);
    const problem = validate(body);
    if (problem) {
      setError(problem);
      return;
    }
    mut.mutate(body);
  }

  return (
    <form className="assistant-settings-form" onSubmit={submit}>
      <section className="member-detail-card">
        <h2>綜合分數權重</h2>
        <p className="admin-muted-text">每個指標先換成「同遊戲房間中的排名」再加權，分數 0–100。權重會自動換算成佔比。</p>
        <div className="admin-form-grid assistant-settings-grid">
          {METRICS.map((m) => (
            <NumberField
              key={m.key}
              label={m.label}
              value={form.weights[m.key]}
              onChange={(v) => setForm({ ...form, weights: { ...form.weights, [m.key]: v } })}
              hint={`${m.hint}・實際佔比 ${share(m.key)}%`}
            />
          ))}
        </div>
      </section>

      <section className="member-detail-card">
        <h2>本金推薦</h2>
        <p className="admin-muted-text">會員輸入本金與今日目標倍數；本金決定級距，門檻 = 級距分數 +（倍數 − 1）× 每倍加分。</p>
        <div className="admin-table-scroll">
          <table className="admin-prize-table assistant-tier-table">
            <thead>
              <tr>
                <th>起始本金</th>
                <th>分數門檻</th>
                <th>最高倍數</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {form.tiers.map((t, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="number"
                      aria-label={`第 ${i + 1} 級起始本金`}
                      value={t.minPrincipal}
                      disabled={i === 0}
                      onChange={(e) => setTier(i, { minPrincipal: e.target.value })}
                    />
                  </td>
                  <td>
                    <input type="number" aria-label={`第 ${i + 1} 級分數門檻`} value={t.minScore} onChange={(e) => setTier(i, { minScore: e.target.value })} />
                  </td>
                  <td>
                    <select aria-label={`第 ${i + 1} 級最高倍數`} value={t.maxMultiplier} onChange={(e) => setTier(i, { maxMultiplier: e.target.value })}>
                      {Array.from({ length: MAX_MULTIPLIER }, (_, k) => (
                        <option key={k} value={k + 1}>{k + 1} 倍</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {i > 0 && (
                      <button type="button" className="danger" onClick={() => setForm({ ...form, tiers: form.tiers.filter((_, j) => j !== i) })}>
                        刪除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="member-detail-actions">
          <button
            type="button"
            disabled={form.tiers.length >= 10}
            onClick={() => {
              const last = form.tiers[form.tiers.length - 1];
              const nextMin = last ? Number(last.minPrincipal) + 10_000 : 0;
              setForm({ ...form, tiers: [...form.tiers, { minPrincipal: String(nextMin), minScore: last?.minScore ?? '60', maxMultiplier: last?.maxMultiplier ?? '2' }] });
            }}
          >
            新增級距
          </button>
        </div>

        <div className="admin-form-grid assistant-settings-grid">
          <NumberField label="每倍加分" suffix="分" value={form.multiplierStepScore} onChange={(v) => setForm({ ...form, multiplierStepScore: v })} hint="以 1 倍為基準，每多 1 倍加的分數" />
          <NumberField label="推薦間數" suffix="間" value={form.count} onChange={(v) => setForm({ ...form, count: v })} hint="符合條件的空台依分數取前幾間" />
          <NumberField label="建議單注" suffix="元以上" value={form.minBetAdvice} onChange={(v) => setForm({ ...form, minBetAdvice: v })} />
          <NumberField label="精品比例" suffix="%" value={form.premiumPercent} onChange={(v) => setForm({ ...form, premiumPercent: v })} hint="未逾時空台中分數前幾 % 標為精品；0 為不標示" />
        </div>

        <h3>門檻預覽</h3>
        <div className="admin-table-scroll">
          <table className="admin-prize-table collector-table">
            <thead>
              <tr>
                <th>本金</th>
                {Array.from({ length: MAX_MULTIPLIER }, (_, k) => (
                  <th key={k} className="is-numeric">{k + 1} 倍</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {row.cells.map((c, k) => (
                    <td key={k} className="is-numeric">{c === null ? '—' : c > 100 ? `${c}（無法達到）` : c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="member-detail-card">
        <h2>資料逾時</h2>
        <p className="admin-muted-text">超過門檻的房間不顯示空台／使用中狀態、不參與推薦與訊號。細項是輪流抓取，本來就比較舊。</p>
        <div className="admin-form-grid assistant-settings-grid">
          <NumberField label="列表層逾時" suffix="分鐘" value={form.listMaxAgeMinutes} onChange={(v) => setForm({ ...form, listMaxAgeMinutes: v })} hint="狀態與今日 RTP；建議為採集間隔的 1.5 倍以上" />
          <NumberField label="細項層逾時" suffix="分鐘" value={form.detailMaxAgeMinutes} onChange={(v) => setForm({ ...form, detailMaxAgeMinutes: v })} hint="未開轉數、下注額等；逾時的細項不計分，前台標示「資料較舊」" />
        </div>
      </section>

      <section className="member-detail-card">
        <h2>訊號</h2>
        <p className="admin-muted-text">符號組合隨機，每則綁定一間發出當下符合條件的真實空台。綁定房間有人入座、開過免遊、今日 RTP 變動或資料逾時就自動換組。</p>
        <div className="admin-form-grid assistant-settings-grid">
          <NumberField label="綁定房間最低分數" suffix="分" value={form.signal.minScore} onChange={(v) => setSignal({ minScore: v })} />
          <NumberField label="今日 RTP 變動換組" suffix="百分點" step="0.5" value={form.signal.rtpChangePoints} onChange={(v) => setSignal({ rtpChangePoints: v })} hint="與發出時相差達此數值即換組" />
          <NumberField label="每間房同時有效訊號" suffix="則" value={form.signal.maxPerRoom} onChange={(v) => setSignal({ maxPerRoom: v })} hint="避免把太多會員導到同一台" />
          <NumberField label="會員換組冷卻" suffix="秒" value={form.signal.refreshCooldownSeconds} onChange={(v) => setSignal({ refreshCooldownSeconds: v })} hint="「免遊結束，換一組」兩次之間的最短間隔" />
          <NumberField label="強度下限" suffix="%" value={form.signal.strengthMin} onChange={(v) => setSignal({ strengthMin: v })} hint="綁定房間 0 分時顯示的強度" />
          <NumberField label="強度上限" suffix="%" value={form.signal.strengthMax} onChange={(v) => setSignal({ strengthMax: v })} hint="綁定房間 100 分時顯示的強度" />
        </div>
      </section>

      <div className="member-detail-actions assistant-settings-save">
        <button type="submit" disabled={mut.isPending}>{mut.isPending ? '儲存中…' : '儲存全部設定'}</button>
        <button type="button" disabled={mut.isPending} onClick={() => { setForm(toForm(initial)); setError(null); setMessage(null); }}>
          還原
        </button>
      </div>
      {message && <p className="admin-success-text" role="status">{message}</p>}
      {error && <p className="member-detail-error" role="alert">{error}</p>}
    </form>
  );
}
