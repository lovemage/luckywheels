import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchUsers } from '../api/users.js';
import { fetchRedemptions } from '../api/redemptions.js';

export function MemberSearch() {
  const [raw, setRaw] = useState('');
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => setQ(raw.trim()), 250);
    return () => clearTimeout(t);
  }, [raw]);

  const users = useQuery({
    queryKey: ['admin', 'search', 'users', q],
    queryFn: () => fetchUsers({ q, take: 5 }),
    enabled: q.length > 0,
  });
  const redemptions = useQuery({
    queryKey: ['admin', 'search', 'redemptions', q],
    queryFn: () => fetchRedemptions({ code: q, take: 5 }),
    enabled: q.length > 0,
  });

  return (
    <div className="member-search">
      <input
        role="textbox"
        placeholder="搜尋會員 / Redemption（LW-XXXX）"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      {q && (users.data || redemptions.data) && (
        <ul className="member-search-results">
          {users.data?.items.length === 0 && redemptions.data?.items.length === 0 && (
            <li>無結果</li>
          )}
          {users.data?.items.map((u) => (
            <li key={`u-${u.id}`} onClick={() => { setRaw(''); navigate(`/admin/users/${u.id}`); }}>
              <strong>{u.nickname ?? u.displayName}</strong> <small>({u.entertainmentMemberCode ?? '無編號'})</small>
            </li>
          ))}
          {redemptions.data?.items.map((r) => (
            <li key={`r-${r.id}`} onClick={() => { setRaw(''); navigate(`/admin/redemptions/${r.id}`); }}>
              <strong>LW-{r.code}</strong> <small>({r.status})</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
