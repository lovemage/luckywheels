import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { approveUser, fetchUsers, type AdminUserRow } from '../api/users.js';
import { Table } from '../components/Table.js';
import { AccountTypeBadge } from '../components/AccountTypeBadge.js';

export function Members() {
  const [tab, setTab] = useState<'verified' | 'test' | 'pending'>('verified');
  const [q, setQ] = useState('');
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', tab, q],
    queryFn: () => fetchUsers({ tab, q: q || undefined }),
  });
  const approve = useMutation({
    mutationFn: approveUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  return (
    <section>
      <h1>會員列表</h1>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setTab('verified')} disabled={tab === 'verified'}>正式會員</button>
        <button onClick={() => setTab('pending')} disabled={tab === 'pending'}>審核中</button>
        <button onClick={() => setTab('test')} disabled={tab === 'test'}>測試會員</button>
        <input
          placeholder="搜尋暱稱 / LINE 名 / lineUserId / 娛樂城編號 / Redemption code"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ marginLeft: 16, minWidth: 320 }}
        />
      </div>
      {isLoading && <p>載入中…</p>}
      {data && (
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
              cell: (u) =>
                u.accountType === 'pending' ? (
                  <button onClick={() => approve.mutate(u.id)} disabled={approve.isPending}>
                    允許會員
                  </button>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      )}
    </section>
  );
}
