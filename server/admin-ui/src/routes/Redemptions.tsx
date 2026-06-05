import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { fetchRedemptions, setRedemptionStatus, type RedemptionRow } from '../api/redemptions.js';
import { Table } from '../components/Table.js';
import { CodeChip } from '../components/CodeChip.js';
import { STATUS_LABELS, StatusBadge } from '../components/StatusBadge.js';
import { ConfirmModal } from '../components/ConfirmModal.js';

type StatusFilter = 'pending' | 'delivered' | 'cancelled' | 'all';
type QuickStatusAction = { row: RedemptionRow; action: 'claim' | 'unclaim' } | null;

function nextStatusAction(row: RedemptionRow): QuickStatusAction {
  if (row.status === 'pending') return { row, action: 'claim' };
  if (row.status === 'delivered') return { row, action: 'unclaim' };
  return null;
}

function actionCopy(action: NonNullable<QuickStatusAction>) {
  if (action.action === 'claim') {
    return {
      title: '確認標記為已派送',
      description: `確認將兌換碼 LW-${action.row.code} 的狀態改為「已派送」？`,
      confirmLabel: '確認派送',
    };
  }
  return {
    title: '確認改回未完成',
    description: `確認將兌換碼 LW-${action.row.code} 的狀態改回「未完成」？`,
    confirmLabel: '確認改回',
  };
}

export function Redemptions() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('pending');
  const [code, setCode] = useState('');
  const [quickAction, setQuickAction] = useState<QuickStatusAction>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'redemptions', status, code],
    queryFn: () => fetchRedemptions({ status, code: code || undefined }),
  });
  const mut = useMutation({
    mutationFn: (action: NonNullable<QuickStatusAction>) =>
      setRedemptionStatus(action.row.id, { action: action.action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'redemptions'] });
      setQuickAction(null);
    },
  });

  const copy = quickAction ? actionCopy(quickAction) : null;

  return (
    <section>
      <h1>抽獎兌換碼</h1>
      <div style={{ marginBottom: 16 }}>
        {(['pending', 'delivered', 'cancelled', 'all'] as const).map((s) => (
          <button key={s} disabled={status === s} onClick={() => setStatus(s)}>{STATUS_LABELS[s]}</button>
        ))}
        <input
          placeholder="輸入兌換碼（可帶 LW- 前綴）"
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
            { header: '兌換碼', cell: (r) => <Link to={`/redemptions/${r.id}`}><CodeChip code={r.code} /></Link> },
            { header: '會員', cell: (r) => <Link to={`/users/${r.user.id}`}>{r.user.nickname ?? r.user.displayName}</Link> },
            { header: '類型', cell: (r) => r.tier === 'multi' ? '10 連抽' : '單抽' },
            {
              header: '狀態',
              cell: (r) => {
                const action = nextStatusAction(r);
                if (!action) return <StatusBadge status={r.status} />;
                return (
                  <button
                    type="button"
                    onClick={() => setQuickAction(action)}
                    style={{ border: 0, padding: 0, background: 'transparent', cursor: 'pointer' }}
                    title="點擊調整狀態"
                  >
                    <StatusBadge status={r.status} />
                  </button>
                );
              },
            },
            { header: '中獎金額', cell: (r) => r.totalWinAmount },
            { header: '建立時間', cell: (r) => new Date(r.createdAt).toLocaleString() },
          ]}
        />
      )}
      {quickAction && copy && (
        <ConfirmModal
          open
          onClose={() => setQuickAction(null)}
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.confirmLabel}
          busy={mut.isPending}
          onConfirm={() => mut.mutate(quickAction)}
        />
      )}
    </section>
  );
}
