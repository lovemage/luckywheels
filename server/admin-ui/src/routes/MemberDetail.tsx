import { useState, type ReactNode } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchUser,
  adjustPoints,
  setAccountType,
  updateTestSettings,
  setBlacklist,
  setEntertainmentCode,
  deleteUser,
  fetchDrawHistory,
  fetchPointsHistory,
  approveUser,
  type DrawHistoryItem,
  type PointsHistoryItem,
} from '../api/users.js';
import { AccountTypeBadge } from '../components/AccountTypeBadge.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { DoubleConfirmModal } from '../components/DoubleConfirmModal.js';
import { Table } from '../components/Table.js';
import { StatusBadge } from '../components/StatusBadge.js';

function formatDateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : '—';
}

function InfoItem({ label, value, action }: { label: string; value: ReactNode; action?: ReactNode }) {
  return (
    <div className="member-detail-info-item">
      <dt>{label}</dt>
      <dd>
        <span>{value ?? '—'}</span>
        {action}
      </dd>
    </div>
  );
}

export function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: () => fetchUser(id!),
    enabled: Boolean(id),
  });
  const [pointsDelta, setPointsDelta] = useState('');
  const [pointsError, setPointsError] = useState<string | null>(null);
  const [pointsSuccess, setPointsSuccess] = useState<string | null>(null);
  const [blacklistModal, setBlacklistModal] = useState<null | { mode: 'set' | 'clear' }>(null);
  const [codeModal, setCodeModal] = useState<null | { next: string | null }>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [memberTab, setMemberTab] = useState<'overview' | 'history'>('overview');
  const qc = useQueryClient();
  const adjust = useMutation({
    mutationFn: (delta: number) => adjustPoints(id!, { delta }),
    onSuccess: (_res, delta) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'users', id, 'points-history'] });
      setPointsDelta('');
      setPointsError(null);
      setPointsSuccess(delta > 0 ? '新增積分成功' : '扣除積分成功');
    },
    onError: (e: Error) => {
      setPointsSuccess(null);
      setPointsError(e.message);
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
  const approveMut = useMutation({
    mutationFn: () => approveUser(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
  const deleteMut = useMutation({
    mutationFn: () => deleteUser(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      navigate('/users');
    },
  });
  const history = useQuery({
    queryKey: ['admin', 'users', id, 'history'],
    queryFn: () => fetchDrawHistory(id!),
    enabled: memberTab === 'history' && Boolean(id),
  });
  const pointsHistory = useQuery({
    queryKey: ['admin', 'users', id, 'points-history'],
    queryFn: () => fetchPointsHistory(id!),
    enabled: Boolean(id),
  });
  if (isLoading || !data) return <p>載入中…</p>;
  return (
    <section className="member-detail-page">
      <header className="member-detail-hero">
        <div>
          <Link to="/users" className="member-detail-back">會員列表</Link>
          <h1>{data.nickname ?? '(未填暱稱)'}</h1>
          <p>{data.displayName}</p>
        </div>
        <AccountTypeBadge type={data.accountType} />
      </header>

      <div className="member-detail-actions">
        {data.accountType === 'pending' && (
          <button onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>
            {approveMut.isPending ? '處理中…' : '允許會員'}
          </button>
        )}
        {data.accountType !== 'blacklisted' && data.accountType !== 'pending' && (
          <button
            onClick={() => {
              const next = data.accountType === 'test' ? 'verified' : 'test';
              if (window.confirm(`切換為「${next === 'test' ? '測試' : '正式'}」會員？`)) {
                setAccountType(id!, next).then(() =>
                  qc.invalidateQueries({ queryKey: ['admin', 'users', id] }),
                );
              }
            }}
          >
            測試會員
          </button>
        )}
        {data.accountType === 'blacklisted' ? (
          <button onClick={() => setBlacklistModal({ mode: 'clear' })}>解除黑名單</button>
        ) : (
          <button onClick={() => setBlacklistModal({ mode: 'set' })}>黑名單</button>
        )}
        <button className="danger" onClick={() => setDeleteModalOpen(true)}>刪除</button>
      </div>

      <nav className="member-detail-tabs">
        <button disabled={memberTab === 'overview'} onClick={() => setMemberTab('overview')}>
          會員資訊
        </button>
        <button disabled={memberTab === 'history'} onClick={() => setMemberTab('history')}>
          抽獎歷史
        </button>
      </nav>
      {memberTab === 'overview' && (
        <div className="member-detail-grid">
          <section className="member-detail-card member-detail-card--wide">
            <h2>基本資料</h2>
            <dl className="member-detail-info-grid">
              <InfoItem label="LINE 名" value={data.displayName} />
              <InfoItem label="lineUserId" value={data.lineUserId} />
              <InfoItem
                label="娛樂城會員編號"
                value={data.entertainmentMemberCode ?? '—'}
                action={
                  <button
                    className="text-button"
                    onClick={() => {
                      const v = window.prompt('新編號（清空＝解除綁定）', data.entertainmentMemberCode ?? '');
                      if (v === null) return;
                      setCodeModal({ next: v.trim() === '' ? null : v.trim() });
                    }}
                  >
                    變更
                  </button>
                }
              />
              <InfoItem label="建立時間" value={formatDateTime(data.createdAt)} />
              <InfoItem label="綁定時間" value={formatDateTime(data.entertainmentCodeBoundAt)} />
              <InfoItem label="帳號狀態" value={<AccountTypeBadge type={data.accountType} />} />
            </dl>
          </section>

          <section className="member-detail-card">
            <h2>活動數據</h2>
            <div className="member-detail-metrics">
              <article>
                <span>目前積分</span>
                <strong>{data.points.toLocaleString()}</strong>
              </article>
              <article>
                <span>累計抽獎</span>
                <strong>{data.lifetimeDrawCount.toLocaleString()}</strong>
              </article>
            </div>
          </section>

          <section className="member-detail-card">
            <h2>積分調整</h2>
            <div className="member-detail-points-tool">
              <input
                type="number"
                value={pointsDelta}
                onChange={(e) => {
                  setPointsDelta(e.target.value);
                  setPointsError(null);
                  setPointsSuccess(null);
                }}
                placeholder="輸入正數或負數"
              />
              <button
                onClick={() => {
                  const n = Number(pointsDelta);
                  if (!Number.isInteger(n) || n === 0) {
                    setPointsError('請輸入非零整數');
                    return;
                  }
                  adjust.mutate(n);
                }}
                disabled={adjust.isPending || pointsDelta.trim() === ''}
              >
                {adjust.isPending ? '處理中…' : pointsDelta.trim() && Number(pointsDelta) < 0 ? '扣除積分' : '新增積分'}
              </button>
            </div>
            {pointsSuccess && <p className="admin-success-text">{pointsSuccess}</p>}
            {pointsError && <p className="member-detail-error">{pointsError}</p>}
          </section>

          <section className="member-detail-card member-detail-card--wide">
            <h2>新增積分紀錄</h2>
            {pointsHistory.isLoading && <p>載入中…</p>}
            {pointsHistory.data && pointsHistory.data.items.length === 0 && (
              <p className="admin-muted-text">尚無積分調整紀錄</p>
            )}
            {pointsHistory.data && pointsHistory.data.items.length > 0 && (
              <Table<PointsHistoryItem>
                rows={pointsHistory.data.items}
                rowKey={(row) => row.id}
                columns={[
                  {
                    header: '調整',
                    cell: (row) => (
                      <span className={row.delta > 0 ? 'points-delta-positive' : 'points-delta-negative'}>
                        {row.delta > 0 ? `+${row.delta}` : row.delta}
                      </span>
                    ),
                  },
                  {
                    header: '調整前',
                    cell: (row) => row.before?.toLocaleString() ?? '—',
                  },
                  {
                    header: '調整後',
                    cell: (row) => row.after?.toLocaleString() ?? '—',
                  },
                  {
                    header: '管理員',
                    cell: (row) => row.adminUser?.email ?? '—',
                  },
                  {
                    header: '時間',
                    cell: (row) => new Date(row.createdAt).toLocaleString(),
                  },
                ]}
              />
            )}
          </section>

          {data.accountType === 'test' && (
            <section className="member-detail-card member-detail-card--wide">
              <h2>測試帳號設定</h2>
              <label className="member-detail-check">
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
              <label className="member-detail-field">
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
                />
              </label>
            </section>
          )}
        </div>
      )}
      {memberTab === 'history' && history.data && (
        <Table<DrawHistoryItem>
          rows={history.data.items}
          rowKey={(row) => row.redemption.id}
          columns={[
            {
              header: 'Code',
              cell: (r) => (
                <Link to={`/redemptions/${r.redemption.id}`}>{r.redemption.code}</Link>
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
      <DoubleConfirmModal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="刪除會員"
        description={`此操作會刪除「${data.nickname ?? data.displayName}」與其抽獎/兌換紀錄，無法復原。`}
        confirmLabel="刪除"
        expectedConfirmText="刪除會員"
        busy={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate()}
      />
    </section>
  );
}
