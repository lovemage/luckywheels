import { useState } from 'react';
import { useParams, Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchUser,
  adjustPoints,
  setAccountType,
  updateTestSettings,
  setBlacklist,
  setEntertainmentCode,
  fetchDrawHistory,
  type DrawHistoryItem,
} from '../api/users.js';
import { AccountTypeBadge } from '../components/AccountTypeBadge.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { Table } from '../components/Table.js';
import { StatusBadge } from '../components/StatusBadge.js';

export function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: () => fetchUser(id!),
    enabled: Boolean(id),
  });
  const [pointsModal, setPointsModal] = useState<null | { delta: number }>(null);
  const [blacklistModal, setBlacklistModal] = useState<null | { mode: 'set' | 'clear' }>(null);
  const [codeModal, setCodeModal] = useState<null | { next: string | null }>(null);
  const [memberTab, setMemberTab] = useState<'overview' | 'history'>('overview');
  const qc = useQueryClient();
  const adjust = useMutation({
    mutationFn: ({ delta, reason }: { delta: number; reason: string }) =>
      adjustPoints(id!, { delta, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users', id] });
      setPointsModal(null);
    },
  });
  const blacklistMut = useMutation({
    mutationFn: (body: { blacklist: boolean; reason?: string }) => setBlacklist(id!, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users', id] });
      setBlacklistModal(null);
    },
  });
  const codeMut = useMutation({
    mutationFn: (body: { code: string | null; reason: string }) => setEntertainmentCode(id!, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users', id] });
      setCodeModal(null);
    },
  });
  const history = useQuery({
    queryKey: ['admin', 'users', id, 'history'],
    queryFn: () => fetchDrawHistory(id!),
    enabled: memberTab === 'history' && Boolean(id),
  });
  if (isLoading || !data) return <p>載入中…</p>;
  return (
    <section>
      <h1>
        {data.nickname ?? '(未填暱稱)'}　<AccountTypeBadge type={data.accountType} />
        {data.accountType !== 'blacklisted' && (
          <button
            style={{ marginLeft: 12 }}
            onClick={() => {
              const next = data.accountType === 'test' ? 'verified' : 'test';
              if (window.confirm(`切換為「${next === 'test' ? '測試' : '正式'}」會員？`)) {
                setAccountType(id!, next).then(() =>
                  qc.invalidateQueries({ queryKey: ['admin', 'users', id] }),
                );
              }
            }}
          >
            切換為{data.accountType === 'test' ? '正式' : '測試'}會員
          </button>
        )}
        {data.accountType === 'blacklisted' ? (
          <button style={{ marginLeft: 8 }} onClick={() => setBlacklistModal({ mode: 'clear' })}>
            解除黑名單
          </button>
        ) : (
          <button style={{ marginLeft: 8 }} onClick={() => setBlacklistModal({ mode: 'set' })}>
            加入黑名單
          </button>
        )}
      </h1>
      <nav style={{ marginBottom: 12 }}>
        <button disabled={memberTab === 'overview'} onClick={() => setMemberTab('overview')}>
          會員資訊
        </button>
        <button disabled={memberTab === 'history'} onClick={() => setMemberTab('history')}>
          抽獎歷史
        </button>
      </nav>
      {memberTab === 'overview' && (
        <>
          <dl>
            <dt>LINE 名</dt><dd>{data.displayName}</dd>
            <dt>lineUserId</dt><dd>{data.lineUserId}</dd>
            <dt>娛樂城會員編號</dt>
            <dd>
              {data.entertainmentMemberCode ?? '—'}
              <button
                style={{ marginLeft: 8 }}
                onClick={() => {
                  const v = window.prompt('新編號（清空＝解除綁定）', data.entertainmentMemberCode ?? '');
                  if (v === null) return;
                  setCodeModal({ next: v.trim() === '' ? null : v.trim() });
                }}
              >
                變更
              </button>
            </dd>
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
          {data.accountType === 'test' && (
            <section style={{ marginTop: 24, padding: 12, border: '1px solid #ddd' }}>
              <h2>測試帳號設定</h2>
              <label style={{ display: 'block', marginBottom: 8 }}>
                <input
                  type="checkbox"
                  defaultChecked={data.testSkipCost}
                  onChange={(e) =>
                    updateTestSettings(id!, { testSkipCost: e.target.checked }).then(() =>
                      qc.invalidateQueries({ queryKey: ['admin', 'users', id] }),
                    )
                  }
                />
                不扣積分（測試專用）
              </label>
              <label style={{ display: 'block' }}>
                強制中獎 Prize ID（空白＝關閉）
                <input
                  type="text"
                  defaultValue={data.testForcePrizeId ?? ''}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    updateTestSettings(id!, { testForcePrizeId: v === '' ? null : v }).then(() =>
                      qc.invalidateQueries({ queryKey: ['admin', 'users', id] }),
                    );
                  }}
                  style={{ width: '100%', marginTop: 4 }}
                />
              </label>
            </section>
          )}
        </>
      )}
      {memberTab === 'history' && history.data && (
        <Table<DrawHistoryItem>
          rows={history.data.items}
          rowKey={(row) => row.redemption.id}
          columns={[
            {
              header: 'Code',
              cell: (r) => (
                <Link to={`/admin/redemptions/${r.redemption.id}`}>{r.redemption.code}</Link>
              ),
            },
            { header: '類型', cell: (r) => (r.redemption.tier === 'multi' ? '10 連抽' : '單抽') },
            { header: '狀態', cell: (r) => <StatusBadge status={r.redemption.status} /> },
            { header: '中獎', cell: (r) => r.draws.map((d) => d.prize.name).join('、') },
            { header: '建立時間', cell: (r) => new Date(r.redemption.createdAt).toLocaleString() },
          ]}
        />
      )}
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
      <ConfirmModal
        open={blacklistModal !== null}
        onClose={() => setBlacklistModal(null)}
        title={blacklistModal?.mode === 'set' ? '加入黑名單' : '解除黑名單'}
        description={blacklistModal?.mode === 'set' ? '請填寫原因（會記錄在 action log）' : undefined}
        requireReason={blacklistModal?.mode === 'set'}
        confirmLabel={blacklistModal?.mode === 'set' ? '加入' : '解除'}
        busy={blacklistMut.isPending}
        onConfirm={(reason) =>
          blacklistMut.mutate({ blacklist: blacklistModal!.mode === 'set', reason })
        }
      />
      <ConfirmModal
        open={codeModal !== null}
        onClose={() => setCodeModal(null)}
        title="變更娛樂城會員編號"
        description={`即將改為：${codeModal?.next ?? '（解除綁定）'}`}
        requireReason
        busy={codeMut.isPending}
        onConfirm={(reason) => codeMut.mutate({ code: codeModal!.next, reason: reason! })}
      />
    </section>
  );
}
