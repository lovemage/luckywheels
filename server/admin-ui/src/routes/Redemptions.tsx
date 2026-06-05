import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { fetchRedemptions, type RedemptionRow } from '../api/redemptions.js';
import { Table } from '../components/Table.js';
import { CodeChip } from '../components/CodeChip.js';
import { StatusBadge } from '../components/StatusBadge.js';

export function Redemptions() {
  const [status, setStatus] = useState<'pending' | 'delivered' | 'cancelled' | 'all'>('pending');
  const [code, setCode] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'redemptions', status, code],
    queryFn: () => fetchRedemptions({ status, code: code || undefined }),
  });

  return (
    <section>
      <h1>抽獎序號（Redemption）</h1>
      <div style={{ marginBottom: 16 }}>
        {(['pending', 'delivered', 'cancelled', 'all'] as const).map((s) => (
          <button key={s} disabled={status === s} onClick={() => setStatus(s)}>{s}</button>
        ))}
        <input
          placeholder="輸入 code（可帶 LW- 前綴）"
          value={code}
          onChange={(e) => setCode(e.target.value.trim().toUpperCase())}
          style={{ marginLeft: 16, minWidth: 200 }}
        />
      </div>
      {isLoading && <p>載入中…</p>}
      {data && (
        <Table<RedemptionRow>
          rows={data.items}
          rowKey={(r) => r.id}
          columns={[
            { header: 'Code', cell: (r) => <Link to={`/admin/redemptions/${r.id}`}><CodeChip code={r.code} /></Link> },
            { header: '會員', cell: (r) => <Link to={`/admin/users/${r.user.id}`}>{r.user.nickname ?? r.user.displayName}</Link> },
            { header: '類型', cell: (r) => r.tier === 'multi' ? '10 連抽' : '單抽' },
            { header: '狀態', cell: (r) => <StatusBadge status={r.status} /> },
            { header: '中獎金額', cell: (r) => r.totalWinAmount },
            { header: '建立時間', cell: (r) => new Date(r.createdAt).toLocaleString() },
          ]}
        />
      )}
    </section>
  );
}
