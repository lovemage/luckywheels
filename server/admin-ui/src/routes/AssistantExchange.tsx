import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchExchangeRecords, fetchTimePlans, updateTimePlans, type TimePlan } from '../api/assistant-settings.js';
import { ApiError } from '../api/client.js';

// 數據助手：積分 → 使用時長方案、兌換紀錄。積分與輪盤共用（User.points）。
// 方案文案（例「3 點積分兌換 24 小時（1 天）」）由伺服器依方案產生，前台介紹頁與兌換頁直接顯示。

const PLANS_KEY = ['admin', 'assistant', 'exchange', 'plans'] as const;
const RECORDS_KEY = ['admin', 'assistant', 'exchange', 'records'] as const;

const TIME_FORMAT = new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const fmtTime = (iso: string | null) => (iso ? TIME_FORMAT.format(new Date(iso)) : '—');

/** 與伺服器 planLabel 相同的規則，只用於編輯中的即時預覽 */
function previewLabel(points: number, hours: number) {
  if (!Number.isInteger(points) || !Number.isInteger(hours) || points < 1 || hours < 1) return '—';
  const days = hours >= 24 && hours % 24 === 0 ? `（${hours / 24} 天）` : '';
  return `${points} 點積分兌換 ${hours} 小時${days}`;
}

type PlanRow = { points: string; hours: string };
const toRows = (plans: TimePlan[]): PlanRow[] => plans.map((p) => ({ points: String(p.points), hours: String(p.hours) }));

export function AssistantExchange() {
  const plans = useQuery({ queryKey: PLANS_KEY, queryFn: fetchTimePlans });
  const records = useQuery({ queryKey: RECORDS_KEY, queryFn: () => fetchExchangeRecords({ take: 100 }), refetchInterval: 60_000 });

  return (
    <section className="member-detail-page assistant-settings-page">
      <header className="member-detail-hero">
        <div>
          <h1>兌換管理</h1>
          <p>會員以積分兌換數據助手使用時長，積分與輪盤共用。續兌從原到期時間往後加；人工加時／扣時請到會員詳細頁。</p>
        </div>
      </header>

      {plans.isLoading ? <p>載入中…</p> : plans.data ? <PlansForm initial={plans.data.plans} /> : <p className="member-detail-error" role="alert">無法載入方案</p>}

      <section className="member-detail-card">
        <h2>兌換紀錄（最近 100 筆）</h2>
        {records.isLoading ? (
          <p>載入中…</p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-prize-table collector-table">
              <thead>
                <tr>
                  <th>時間</th>
                  <th>會員</th>
                  <th>類型</th>
                  <th className="is-numeric">積分</th>
                  <th className="is-numeric">時數</th>
                  <th>到期時間</th>
                  <th>備註</th>
                </tr>
              </thead>
              <tbody>
                {(records.data?.items ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>{fmtTime(r.createdAt)}</td>
                    <td><Link to={`/users/${r.userId}`}>{r.userName ?? r.userId}</Link></td>
                    <td>{r.kind === 'points_to_time' ? '會員兌換' : `人工調整（${r.adminAccount ?? '—'}）`}</td>
                    <td className="is-numeric">{r.kind === 'points_to_time' ? `−${r.pointsSpent}（剩 ${r.pointsAfter}）` : '—'}</td>
                    <td className="is-numeric">{r.hours > 0 ? `+${r.hours}` : r.hours} 小時</td>
                    <td>{fmtTime(r.expiresBefore)} → {fmtTime(r.expiresAfter)}</td>
                    <td className="is-wrap">{r.note ?? '—'}</td>
                  </tr>
                ))}
                {records.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={7}>尚無兌換紀錄</td>
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

function PlansForm({ initial }: { initial: TimePlan[] }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<PlanRow[]>(() => toRows(initial));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setRows(toRows(initial)), [initial]);

  const mut = useMutation({
    mutationFn: updateTimePlans,
    onSuccess: (saved) => {
      setMessage('方案已儲存，前台文案已同步更新');
      setError(null);
      qc.setQueryData(PLANS_KEY, saved);
    },
    onError: (e) => {
      setMessage(null);
      setError(e instanceof ApiError ? (e.code === 'ASSISTANT_SETTINGS_INVALID' ? e.message : `儲存失敗（${e.code}）`) : '儲存失敗');
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const plans = rows.map((r) => ({ points: Number(r.points), hours: Number(r.hours) }));
    if (plans.length === 0) return setError('至少需要一個方案');
    if (plans.some((p) => !Number.isInteger(p.points) || p.points < 1 || p.points > 10_000)) return setError('積分需為 1–10,000 的整數');
    if (plans.some((p) => !Number.isInteger(p.hours) || p.hours < 1 || p.hours > 8760)) return setError('時數需為 1–8,760 的整數');
    if (new Set(plans.map((p) => p.points)).size !== plans.length) return setError('每個方案的積分數不可重複');
    mut.mutate(plans);
  }

  const set = (i: number, patch: Partial<PlanRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <section className="member-detail-card">
      <h2>兌換方案</h2>
      <p className="admin-muted-text">會員端依積分數由少到多顯示。已送出的兌換不受影響；會員畫面停留期間方案若被修改，兌換時會提示重新整理。</p>
      <form onSubmit={submit}>
        <div className="admin-table-scroll">
          <table className="admin-prize-table assistant-tier-table">
            <thead>
              <tr>
                <th>積分</th>
                <th>時數（小時）</th>
                <th>前台顯示文案</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td><input type="number" min={1} aria-label={`方案 ${i + 1} 積分`} value={r.points} onChange={(e) => set(i, { points: e.target.value })} /></td>
                  <td><input type="number" min={1} aria-label={`方案 ${i + 1} 時數`} value={r.hours} onChange={(e) => set(i, { hours: e.target.value })} /></td>
                  <td>{previewLabel(Number(r.points), Number(r.hours))}</td>
                  <td>
                    {rows.length > 1 && (
                      <button type="button" className="danger" onClick={() => setRows(rows.filter((_, j) => j !== i))}>刪除</button>
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
            disabled={rows.length >= 10}
            onClick={() => {
              const maxPoints = rows.reduce((m, r) => Math.max(m, Number(r.points) || 0), 0);
              setRows([...rows, { points: String(maxPoints + 1), hours: '24' }]);
            }}
          >
            新增方案
          </button>
          <button type="submit" disabled={mut.isPending}>{mut.isPending ? '儲存中…' : '儲存方案'}</button>
        </div>
      </form>
      {message && <p className="admin-success-text" role="status">{message}</p>}
      {error && <p className="member-detail-error" role="alert">{error}</p>}
    </section>
  );
}
