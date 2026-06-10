import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchUsers, approveUser, type UsersListQuery, type SuperUserRow } from '../api/users.js';
import { fetchSuperadminMe, type Site } from '../api/me.js';
import { SiteBadge, AccountBadge } from '../components/SiteBadge.js';

const TABS = [
  { key: 'pending', label: '審核中' },
  { key: 'verified', label: '正式 / 黑名單' },
  { key: 'test', label: '測試' },
] as const;

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function Members() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'pending' | 'verified' | 'test'>('pending');
  const [site, setSite] = useState<'' | Site>('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');

  const { data: me } = useQuery({ queryKey: ['superadmin', 'me'], queryFn: fetchSuperadminMe, retry: false });

  const query: UsersListQuery = { tab, q: q || undefined, take: 50, site: site || undefined };
  const { data, isLoading, isError } = useQuery({
    queryKey: ['superadmin', 'users', tab, q, site],
    queryFn: () => fetchUsers(query),
  });

  const approve = useMutation({
    mutationFn: (row: SuperUserRow) => approveUser(row.site, row.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['superadmin', 'users'] }),
  });

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setQ(qInput.trim());
  }

  const items = data?.items ?? [];
  const siteOptions: { value: '' | Site; label: string }[] = [
    { value: '', label: '全部' },
    ...(me?.sites ?? []).map((s) => ({ value: s.site, label: s.label })),
  ];

  return (
    <section className="sa-page">
      <div className="sa-page-head">
        <h2>會員審核</h2>
        <div className="sa-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`sa-tab${tab === t.key ? ' is-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sa-filters">
        <div className="sa-segment" role="group" aria-label="站別篩選">
          {siteOptions.map((o) => (
            <button
              key={o.value || 'all'}
              type="button"
              className={`sa-seg${site === o.value ? ' is-active' : ''}`}
              onClick={() => setSite(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <form className="sa-search" onSubmit={onSearch}>
          <input
            type="search"
            placeholder="搜尋暱稱 / LINE 名稱 / lineUserId / 娛樂城編號"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
          <button type="submit" className="sa-btn sa-btn--ghost">搜尋</button>
          {q && (
            <button type="button" className="sa-btn sa-btn--ghost" onClick={() => { setQInput(''); setQ(''); }}>清除</button>
          )}
        </form>
      </div>

      {isLoading && <p className="sa-loading">載入中…</p>}
      {isError && <p className="sa-error">讀取失敗，請重新整理。</p>}

      {!isLoading && !isError && (
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>會員</th>
                <th>站別</th>
                <th>狀態</th>
                <th>娛樂城編號</th>
                <th className="sa-num">積分</th>
                <th className="sa-num">抽獎</th>
                <th>註冊時間</th>
                <th className="sa-col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={`${u.site}:${u.id}`}>
                  <td>
                    <div className="sa-user-cell">
                      {u.pictureUrl
                        ? <img src={u.pictureUrl} alt="" className="sa-avatar" referrerPolicy="no-referrer" />
                        : <span className="sa-avatar sa-avatar--blank" aria-hidden="true" />}
                      <div className="sa-user-meta">
                        <strong>{u.nickname || u.displayName}</strong>
                        <span className="sa-sub">{u.displayName}</span>
                      </div>
                    </div>
                  </td>
                  <td><SiteBadge site={u.site} label={u.siteLabel} /></td>
                  <td><AccountBadge accountType={u.accountType} /></td>
                  <td className="sa-nowrap">{u.entertainmentMemberCode ?? '—'}</td>
                  <td className="sa-num">{u.points}</td>
                  <td className="sa-num">{u.lifetimeDrawCount}</td>
                  <td className="sa-sub sa-nowrap">{fmt(u.createdAt)}</td>
                  <td className="sa-col-actions">
                    <div className="sa-actions">
                      {u.accountType === 'pending' && (
                        <button
                          type="button"
                          className="sa-btn sa-btn--sm"
                          disabled={approve.isPending}
                          onClick={() => approve.mutate(u)}
                        >
                          允許
                        </button>
                      )}
                      <Link className="sa-btn sa-btn--sm sa-btn--ghost" to={`/users/${u.site}/${u.id}`}>操作</Link>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={8} className="sa-empty">沒有符合條件的會員</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
