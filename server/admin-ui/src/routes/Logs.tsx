import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchLogs, type ActionLogRow } from '../api/logs.js';
import { Table } from '../components/Table.js';

export function Logs() {
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [targetId, setTargetId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'action-logs', action, targetType, targetId, from, to, cursor],
    queryFn: () => fetchLogs({
      action: action || undefined,
      targetType: targetType || undefined,
      targetId: targetId || undefined,
      from: from || undefined,
      to: to || undefined,
      take: 25,
      cursor,
    }),
  });

  return (
    <section>
      <h1>歷史紀錄（Action Logs）</h1>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input placeholder="action（e.g. redemption.claim）" value={action} onChange={(e) => { setAction(e.target.value); setCursor(undefined); }} />
        <input placeholder="targetType" value={targetType} onChange={(e) => { setTargetType(e.target.value); setCursor(undefined); }} />
        <input placeholder="targetId" value={targetId} onChange={(e) => { setTargetId(e.target.value); setCursor(undefined); }} />
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setCursor(undefined); }} />
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setCursor(undefined); }} />
      </div>
      {isLoading && <p>載入中…</p>}
      {data && (
        <>
          <Table<ActionLogRow>
            rows={data.items}
            rowKey={(r) => r.id}
            columns={[
              { header: '時間', cell: (r) => new Date(r.createdAt).toLocaleString() },
              { header: 'Admin', cell: (r) => r.adminUser?.email ?? '—' },
              { header: 'Action', cell: (r) => r.action },
              { header: 'Target', cell: (r) => r.targetType ? `${r.targetType}:${r.targetId ?? ''}` : '—' },
              { header: 'IP', cell: (r) => r.ip ?? '—' },
              { header: 'Payload', cell: (r) => <details><summary>view</summary><pre>{JSON.stringify(r.payload, null, 2)}</pre></details> },
            ]}
          />
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button disabled={!cursor} onClick={() => setCursor(undefined)}>回到第一頁</button>
            <button disabled={!data.nextCursor} onClick={() => setCursor(data.nextCursor ?? undefined)}>下一頁</button>
          </div>
        </>
      )}
    </section>
  );
}
