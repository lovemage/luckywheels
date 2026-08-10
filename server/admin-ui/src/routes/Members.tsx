import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { adjustPoints, approveUser, fetchUsers, type AdminUserRow } from '../api/users.js';
import { Modal } from '../components/Modal.js';
import { Table } from '../components/Table.js';
import { AccountTypeBadge } from '../components/AccountTypeBadge.js';
import { CursorPagination } from '../components/CursorPagination.js';
import { useCursorPagination } from '../hooks/useCursorPagination.js';

function PointsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M6.111 11.89A5.5 5.5 0 1 1 15.501 8A.75.75 0 0 0 17 8a7 7 0 1 0-11.95 4.95a.75.75 0 0 0 1.06-1.06" />
      <path d="M8.232 6.232a2.5 2.5 0 0 0 0 3.536a.75.75 0 1 1-1.06 1.06A4 4 0 1 1 14 8a.75.75 0 0 1-1.5 0a2.5 2.5 0 0 0-4.268-1.768" />
      <path d="M10.766 7.51a.75.75 0 0 0-1.37.365l-.492 6.861a.75.75 0 0 0 1.204.65l1.043-.799l.985 3.678a.75.75 0 0 0 1.45-.388l-.978-3.646l1.292.204a.75.75 0 0 0 .74-1.16z" />
    </svg>
  );
}

function PointsAdjustModal({ user, onClose }: { user: AdminUserRow; onClose: () => void }) {
  const [sign, setSign] = useState<'+' | '-'>('+');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (delta: number) => adjustPoints(user.id, { delta }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'users', user.id] });
      qc.invalidateQueries({ queryKey: ['admin', 'users', user.id, 'points-history'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      setError('請輸入正整數');
      return;
    }
    const delta = sign === '+' ? n : -n;
    mut.mutate(delta);
  }

  const title = `調整積分：${user.nickname ?? user.displayName}`;

  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={submit}>
        <p className="admin-muted-text">
          目前積分：<strong>{user.points}</strong>
        </p>
        <div className="admin-points-adjust-row">
          <div className="admin-sign-toggle" role="group" aria-label="增減方向">
            <button
              type="button"
              className={sign === '+' ? 'is-active' : ''}
              onClick={() => setSign('+')}
              aria-pressed={sign === '+'}
            >
              ＋
            </button>
            <button
              type="button"
              className={sign === '-' ? 'is-active' : ''}
              onClick={() => setSign('-')}
              aria-pressed={sign === '-'}
            >
              －
            </button>
          </div>
          <input
            type="number"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="輸入數量"
            autoFocus
          />
        </div>
        {error && <p className="member-detail-error">{error}</p>}
        <div className="member-detail-actions admin-modal-actions">
          <button type="button" onClick={onClose} disabled={mut.isPending}>
            取消
          </button>
          <button type="submit" disabled={mut.isPending}>
            {mut.isPending ? '處理中…' : '確認'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Members() {
  const [tab, setTab] = useState<'verified' | 'test' | 'pending'>('verified');
  const [q, setQ] = useState('');
  const [pointsModalUser, setPointsModalUser] = useState<AdminUserRow | null>(null);
  const pagination = useCursorPagination();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', tab, q, pagination.cursor],
    queryFn: () => fetchUsers({ tab, q: q || undefined, take: 25, cursor: pagination.cursor }),
  });
  const approve = useMutation({
    mutationFn: approveUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  return (
    <section className="member-detail-page">
      <header className="member-detail-hero">
        <div>
          <p className="admin-eyebrow">Members</p>
          <h1>會員列表</h1>
          <p>管理會員狀態、審核申請與快速搜尋會員資料。</p>
        </div>
      </header>
      <div className="member-detail-actions admin-toolbar">
        <button onClick={() => { setTab('verified'); pagination.reset(); }} disabled={tab === 'verified'}>正式會員</button>
        <button onClick={() => { setTab('pending'); pagination.reset(); }} disabled={tab === 'pending'}>審核中</button>
        <button onClick={() => { setTab('test'); pagination.reset(); }} disabled={tab === 'test'}>測試會員</button>
        <input
          placeholder="搜尋暱稱 / LINE 名 / lineUserId / 娛樂城編號 / Redemption code"
          value={q}
          onChange={(e) => { setQ(e.target.value); pagination.reset(); }}
          className="admin-toolbar-search"
        />
      </div>
      {isLoading && <p>載入中…</p>}
      {data && (
        <>
          <section className="member-detail-card member-detail-card--wide admin-table-card">
            <Table<AdminUserRow>
            rows={data.items}
            rowKey={(u) => u.id}
            columns={[
              { header: '暱稱', cell: (u) => <Link to={`/users/${u.id}`}>{u.nickname ?? '(未填)'}</Link> },
              { header: 'LINE 名', cell: (u) => u.displayName },
              { header: '娛樂城編號', cell: (u) => u.entertainmentMemberCode ?? '—' },
              { header: '帳號類型', cell: (u) => <AccountTypeBadge type={u.accountType} /> },
              { header: '積分', cell: (u) => u.points },
              { header: '累計抽獎', cell: (u) => u.lifetimeDrawCount },
              {
                header: '操作',
                cell: (u) => (
                  <div className="admin-row-actions">
                    {u.accountType === 'pending' && (
                      <button onClick={() => approve.mutate(u.id)} disabled={approve.isPending}>
                        允許會員
                      </button>
                    )}
                    <button
                      type="button"
                      className="admin-icon-button"
                      title="調整積分"
                      aria-label={`調整 ${u.nickname ?? u.displayName} 的積分`}
                      onClick={() => setPointsModalUser(u)}
                    >
                      <PointsIcon />
                    </button>
                  </div>
                ),
              },
            ]}
            />
          </section>
          <CursorPagination
            page={pagination.page}
            canPrevious={pagination.canPrevious}
            canNext={Boolean(data.nextCursor)}
            onPrevious={pagination.previous}
            onNext={() => pagination.next(data.nextCursor)}
          />
        </>
      )}
      {pointsModalUser && (
        <PointsAdjustModal
          user={pointsModalUser}
          onClose={() => setPointsModalUser(null)}
        />
      )}
    </section>
  );
}
