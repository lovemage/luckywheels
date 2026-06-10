import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSuperadminMe, logout } from '../api/me.js';
import { SiteBadge } from './SiteBadge.js';

export function AppShell() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ['superadmin', 'me'], queryFn: fetchSuperadminMe, retry: false });

  async function onLogout() {
    try { await logout(); } catch { /* ignore */ }
    qc.clear();
    nav('/login', { replace: true });
  }

  return (
    <div className="sa-shell">
      <header className="sa-topbar">
        <Link to="/" className="sa-brand">
          <span className="sa-eyebrow">Superadmin</span>
          <strong>跨站會員審核台</strong>
        </Link>
        <nav className="sa-nav" aria-label="主導覽">
          <NavLink to="/" end className={({ isActive }) => `sa-navlink${isActive ? ' is-active' : ''}`}>會員審核</NavLink>
          <NavLink to="/stats" className={({ isActive }) => `sa-navlink${isActive ? ' is-active' : ''}`}>統計</NavLink>
        </nav>
        <div className="sa-topbar-right">
          <div className="sa-site-legend">
            {me?.sites.map((s) => (
              <SiteBadge key={s.site} site={s.site} label={s.label} />
            ))}
          </div>
          {me && <span className="sa-me">{me.account}</span>}
          <button type="button" className="sa-btn sa-btn--ghost" onClick={onLogout}>登出</button>
        </div>
      </header>
      <main className="sa-content">
        <Outlet />
      </main>
    </div>
  );
}
