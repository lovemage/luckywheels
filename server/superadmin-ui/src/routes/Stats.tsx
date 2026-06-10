import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchStats, type Metric, type StatsResponse } from '../api/stats.js';

const PERIODS = [
  { key: 'week', label: '週統計' },
  { key: 'month', label: '月統計' },
] as const;

function num(n: number): string { return n.toLocaleString('zh-TW'); }

export function Stats() {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['superadmin', 'stats', period],
    queryFn: () => fetchStats(period),
  });

  const labels = data?.sites ?? [];
  const labA = labels.find((s) => s.site === 'A')?.label ?? '一站';
  const labB = labels.find((s) => s.site === 'B')?.label ?? '二站';

  function Cell({ m, money }: { m: Metric; money?: boolean }) {
    return (
      <div className="sa-stat-cell">
        <strong>{money ? `$${num(m.total)}` : num(m.total)}</strong>
        <span className="sa-sub">{labA} {money ? `$${num(m.A)}` : num(m.A)}　{labB} {money ? `$${num(m.B)}` : num(m.B)}</span>
      </div>
    );
  }

  return (
    <section className="sa-page">
      <div className="sa-page-head">
        <h2>統計</h2>
        <div className="sa-segment" role="group" aria-label="統計區間">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`sa-seg${period === p.key ? ' is-active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="sa-loading">載入中…</p>}
      {isError && <p className="sa-error">讀取失敗，請重新整理。</p>}

      {!isLoading && !isError && data && (
        <>
          <SummaryCards data={data} labA={labA} labB={labB} />
          <div className="sa-table-wrap">
            <table className="sa-table sa-stats-table">
              <thead>
                <tr>
                  <th>期間</th>
                  <th className="sa-num">抽獎次數（合計）</th>
                  <th className="sa-num">中獎金額・已派送（合計）</th>
                  <th className="sa-num">新增會員（合計）</th>
                </tr>
              </thead>
              <tbody>
                {data.buckets.map((b, i) => (
                  <tr key={b.key}>
                    <td className="sa-nowrap">{b.label}{i === 0 && <span className="sa-pill">本期</span>}</td>
                    <td className="sa-num"><Cell m={b.draws} /></td>
                    <td className="sa-num"><Cell m={b.delivered} money /></td>
                    <td className="sa-num"><Cell m={b.newMembers} /></td>
                  </tr>
                ))}
                {data.buckets.length === 0 && (
                  <tr><td colSpan={4} className="sa-empty">沒有資料</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="sa-sub sa-stats-note">
            抽獎次數以每一次轉動計（10 連抽算 10 次）。中獎金額僅計入狀態為「已派送」的中獎。時區為台灣 (UTC+8)。
          </p>
        </>
      )}
    </section>
  );
}

function SummaryCards({ data, labA, labB }: { data: StatsResponse; labA: string; labB: string }) {
  const m = data.totals.members;
  // current-period (newest bucket) quick totals
  const cur = data.buckets[0];
  return (
    <div className="sa-summary">
      <div className="sa-summary-card">
        <span className="sa-summary-label">目前總會員數</span>
        <strong className="sa-summary-num">{num(m.total)}</strong>
        <span className="sa-sub">{labA} {num(m.A)}　{labB} {num(m.B)}</span>
      </div>
      {cur && (
        <>
          <div className="sa-summary-card">
            <span className="sa-summary-label">本期抽獎次數</span>
            <strong className="sa-summary-num">{num(cur.draws.total)}</strong>
            <span className="sa-sub">{labA} {num(cur.draws.A)}　{labB} {num(cur.draws.B)}</span>
          </div>
          <div className="sa-summary-card">
            <span className="sa-summary-label">本期已派送金額</span>
            <strong className="sa-summary-num">${num(cur.delivered.total)}</strong>
            <span className="sa-sub">{labA} ${num(cur.delivered.A)}　{labB} ${num(cur.delivered.B)}</span>
          </div>
        </>
      )}
    </div>
  );
}
