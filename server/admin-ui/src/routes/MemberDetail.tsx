import { useState } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchUser, adjustPoints } from '../api/users.js';
import { AccountTypeBadge } from '../components/AccountTypeBadge.js';
import { ConfirmModal } from '../components/ConfirmModal.js';

export function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: () => fetchUser(id!),
    enabled: Boolean(id),
  });
  const [pointsModal, setPointsModal] = useState<null | { delta: number }>(null);
  const qc = useQueryClient();
  const adjust = useMutation({
    mutationFn: ({ delta, reason }: { delta: number; reason: string }) =>
      adjustPoints(id!, { delta, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users', id] });
      setPointsModal(null);
    },
  });
  if (isLoading || !data) return <p>載入中…</p>;
  return (
    <section>
      <h1>{data.nickname ?? '(未填暱稱)'}　<AccountTypeBadge type={data.accountType} /></h1>
      <dl>
        <dt>LINE 名</dt><dd>{data.displayName}</dd>
        <dt>lineUserId</dt><dd>{data.lineUserId}</dd>
        <dt>娛樂城會員編號</dt><dd>{data.entertainmentMemberCode ?? '—'}</dd>
        <dt>積分</dt><dd>{data.points}</dd>
        <dt>累計抽獎</dt><dd>{data.lifetimeDrawCount}</dd>
      </dl>
      <div style={{ marginTop: 16 }}>
        <button onClick={() => setPointsModal({ delta: 6 })}>+6 積分</button>
        <button onClick={() => setPointsModal({ delta: -1 })}>-1 積分</button>
        <button onClick={() => {
          const raw = window.prompt('輸入自訂積分變動（如 +5 或 -3）');
          const n = raw ? Number(raw) : NaN;
          if (Number.isInteger(n) && n !== 0) setPointsModal({ delta: n });
        }}>其他</button>
      </div>
      <ConfirmModal
        open={pointsModal !== null}
        onClose={() => setPointsModal(null)}
        title={`調整積分（${(pointsModal?.delta ?? 0) > 0 ? '+' : ''}${pointsModal?.delta ?? 0}）`}
        description={`目前餘額：${data.points}`}
        requireReason
        busy={adjust.isPending}
        onConfirm={(reason) =>
          adjust.mutate({ delta: pointsModal!.delta, reason: reason! })
        }
      />
      {data.accountType === 'test' && (
        <section>
          <h2>測試帳號設定</h2>
          <p>testSkipCost：{String(data.testSkipCost)}</p>
          <p>testForcePrizeId：{data.testForcePrizeId ?? '—'}</p>
        </section>
      )}
    </section>
  );
}
