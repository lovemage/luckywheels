import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adjustMemberPass, fetchExchangeRecords, fetchMemberPass } from '../api/assistant-settings.js';
import { fetchAdminMe } from '../api/me.js';
import { ApiError } from '../api/client.js';

// 會員詳細頁：數據助手使用期限與人工加時／扣時（需 exchange 權限且旗標開啟；否則不顯示）

const TIME_FORMAT = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const fmtTime = (iso: string | null) => (iso ? TIME_FORMAT.format(new Date(iso)) : '—');

function remaining(seconds: number) {
  if (seconds <= 0) return '已到期';
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d} 天`, h && `${h} 小時`, `${m} 分`].filter(Boolean).join(' ');
}

const ERRORS: Record<string, string> = {
  ASSISTANT_PASS_NOT_ACTIVE: '會員目前沒有使用期限，無法扣時',
  ADMIN_NAV_FORBIDDEN: '沒有兌換管理權限',
};

export function AssistantPassCard({ userId }: { userId: string }) {
  const me = useQuery({ queryKey: ['admin', 'me'], queryFn: fetchAdminMe });
  const allowed = Boolean(me.data?.features?.dataAssistant && (me.data.isMain || me.data.allowedNavs.includes('exchange')));
  if (!allowed) return null;
  return <PassCard userId={userId} />;
}

function PassCard({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const passKey = ['admin', 'assistant', 'pass', userId] as const;
  const recordsKey = ['admin', 'assistant', 'exchange', 'records', userId] as const;
  const pass = useQuery({ queryKey: passKey, queryFn: () => fetchMemberPass(userId) });
  const records = useQuery({ queryKey: recordsKey, queryFn: () => fetchExchangeRecords({ userId, take: 10 }) });
  const [mode, setMode] = useState<'add' | 'deduct'>('add');
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (body: { hours: number; note?: string }) => adjustMemberPass(userId, body),
    onSuccess: (r, body) => {
      setMessage(`已${body.hours > 0 ? '加時' : '扣時'} ${Math.abs(body.hours)} 小時，到期時間 ${fmtTime(r.pass.expiresAt)}`);
      setError(null);
      setHours('');
      setNote('');
      qc.setQueryData(passKey, { pass: r.pass });
      qc.invalidateQueries({ queryKey: ['admin', 'assistant', 'exchange', 'records'] });
    },
    onError: (e) => {
      setMessage(null);
      setError(e instanceof ApiError ? ERRORS[e.code] ?? `操作失敗（${e.code}）` : '操作失敗');
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const n = Number(hours);
    if (!Number.isInteger(n) || n < 1 || n > 8760) {
      setError('時數需為 1–8,760 的整數');
      return;
    }
    mut.mutate({ hours: mode === 'add' ? n : -n, note: note.trim() || undefined });
  }

  const p = pass.data?.pass;

  return (
    <section className="member-detail-card member-detail-card--wide">
      <h2>數據助手使用期限</h2>
      {pass.isLoading ? (
        <p>載入中…</p>
      ) : p ? (
        <div className="member-detail-metrics assistant-pass-metrics">
          <article>
            <span>狀態</span>
            <strong>{p.active ? '使用中' : p.expiresAt ? '已到期' : '未開通'}</strong>
          </article>
          <article>
            <span>到期時間</span>
            <strong>{fmtTime(p.expiresAt)}</strong>
          </article>
          <article>
            <span>剩餘</span>
            <strong>{p.active ? remaining(p.remainingSeconds) : '—'}</strong>
          </article>
        </div>
      ) : (
        <p className="member-detail-error" role="alert">無法載入使用期限</p>
      )}

      <form className="admin-inline-fields assistant-pass-form" onSubmit={submit}>
        <label>
          <span>調整方式</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as 'add' | 'deduct')}>
            <option value="add">加時</option>
            <option value="deduct">扣時</option>
          </select>
        </label>
        <label>
          <span>時數（小時）</span>
          <input type="number" min={1} max={8760} value={hours} onChange={(e) => setHours(e.target.value)} />
        </label>
        <label className="assistant-pass-note">
          <span>備註</span>
          <input type="text" maxLength={200} value={note} placeholder="例：活動補償" onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="submit" disabled={mut.isPending || !hours}>{mode === 'add' ? '確認加時' : '確認扣時'}</button>
      </form>
      <p className="admin-muted-text">加時從目前到期時間往後加（已到期則從現在起算）；扣時最多扣到立即到期。每次調整都會寫入操作紀錄。</p>
      {message && <p className="admin-success-text" role="status">{message}</p>}
      {error && <p className="member-detail-error" role="alert">{error}</p>}

      {records.data && records.data.items.length > 0 && (
        <div className="admin-table-scroll">
          <table className="admin-prize-table collector-table">
            <thead>
              <tr>
                <th>時間</th>
                <th>類型</th>
                <th className="is-numeric">時數</th>
                <th>到期時間</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>
              {records.data.items.map((r) => (
                <tr key={r.id}>
                  <td>{fmtTime(r.createdAt)}</td>
                  <td>{r.kind === 'points_to_time' ? `兌換（−${r.pointsSpent} 積分）` : `人工（${r.adminAccount ?? '—'}）`}</td>
                  <td className="is-numeric">{r.hours > 0 ? `+${r.hours}` : r.hours}</td>
                  <td>{fmtTime(r.expiresAfter)}</td>
                  <td className="is-wrap">{r.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
