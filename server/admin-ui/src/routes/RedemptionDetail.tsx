import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchRedemption, setRedemptionStatus } from '../api/redemptions.js';
import { CodeChip } from '../components/CodeChip.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { DoubleConfirmModal } from '../components/DoubleConfirmModal.js';

type ActionKind = 'claim' | 'void' | 'unclaim';

const ACTION_COPY: Record<ActionKind, {
  title: string;
  description: string;
  confirmLabel: string;
  expectedConfirmText: string;
  requireReason: boolean;
}> = {
  claim: {
    title: '標記為已派送',
    description: '確認已將獎金轉入會員的娛樂城帳號後再執行。',
    confirmLabel: '標記為已派送',
    expectedConfirmText: 'CLAIM',
    requireReason: false,
  },
  void: {
    title: '作廢此筆抽獎',
    description: '此操作會將狀態改為「已取消」，且無法回復為已派送。請填寫原因。',
    confirmLabel: '作廢',
    expectedConfirmText: 'VOID',
    requireReason: true,
  },
  unclaim: {
    title: '取消已派送狀態',
    description: '此操作會把狀態回退為「未完成」，請填寫原因。',
    confirmLabel: '取消派送',
    expectedConfirmText: 'UNCLAIM',
    requireReason: true,
  },
};

export function RedemptionDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'redemptions', id],
    queryFn: () => fetchRedemption(id!),
    enabled: Boolean(id),
  });
  const [action, setAction] = useState<ActionKind | null>(null);
  const mut = useMutation({
    mutationFn: (body: { action: ActionKind; reason?: string }) =>
      setRedemptionStatus(id!, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'redemptions', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'redemptions'] });
      setAction(null);
    },
  });

  if (isLoading || !data) return <p>載入中…</p>;
  const copy = action ? ACTION_COPY[action] : null;
  return (
    <section>
      <h1><CodeChip code={data.code} /> <StatusBadge status={data.status} /></h1>
      <dl>
        <dt>會員</dt>
        <dd><Link to={`/admin/users/${data.user.id}`}>{data.user.nickname ?? data.user.displayName}</Link></dd>
        <dt>類型</dt><dd>{data.tier === 'multi' ? '10 連抽' : '單抽'}</dd>
        <dt>中獎總額</dt><dd>{data.totalWinAmount}</dd>
        <dt>建立時間</dt><dd>{new Date(data.createdAt).toLocaleString()}</dd>
        {data.statusChangedAt && (
          <>
            <dt>狀態變更時間</dt>
            <dd>{new Date(data.statusChangedAt).toLocaleString()}（{data.statusChangedByAdminUser?.email ?? '—'}）</dd>
          </>
        )}
        {data.cancelReason && <><dt>作廢原因</dt><dd>{data.cancelReason}</dd></>}
      </dl>
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        {data.status === 'pending' && (
          <>
            <button onClick={() => setAction('claim')}>標記為已派送</button>
            <button onClick={() => setAction('void')}>作廢</button>
          </>
        )}
        {data.status === 'delivered' && (
          <button onClick={() => setAction('unclaim')}>取消派送</button>
        )}
      </div>
      <h2>抽獎明細</h2>
      <ol>
        {data.draws.map((d) => (
          <li key={d.id}>
            #{d.subIndex + 1} → {d.prize.name}　花費 {d.tierCost} 積分　中獎 {d.winningCashAmount}　{new Date(d.createdAt).toLocaleString()}
          </li>
        ))}
      </ol>
      {copy && action && (
        <DoubleConfirmModal
          open
          onClose={() => setAction(null)}
          title={copy.title}
          description={copy.description}
          requireReason={copy.requireReason}
          confirmLabel={copy.confirmLabel}
          expectedConfirmText={copy.expectedConfirmText}
          busy={mut.isPending}
          onConfirm={(reason) => mut.mutate({ action, reason })}
        />
      )}
    </section>
  );
}
