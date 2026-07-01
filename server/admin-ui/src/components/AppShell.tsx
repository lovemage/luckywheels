import { NavLink, Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminMe, type AdminNavKey } from '../api/me.js';
import { MemberSearch } from './MemberSearch.js';

type SidebarLink = {
  to: string;
  label: string;
  shortLabel: string;
  nav: AdminNavKey;
  end?: boolean;
};

const sidebarLinks: SidebarLink[] = [
  { to: '/users', label: '會員列表', shortLabel: '會員', nav: 'users' },
  { to: '/redemptions', label: '中獎紀錄', shortLabel: '中獎', nav: 'redemptions' },
  { to: '/prizes', label: '獎品設定', shortLabel: '獎品', nav: 'prizes' },
  { to: '/system', label: '系統設定', shortLabel: '設定', nav: 'system' },
];

export function AppShell() {
  const me = useQuery({ queryKey: ['admin', 'me'], queryFn: fetchAdminMe });
  const visibleLinks = sidebarLinks.filter((l) => me.data?.isMain || me.data?.allowedNavs.includes(l.nav));

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p className="admin-eyebrow">Admin Console</p>
          <h1>Lucky Wheels 管理後台</h1>
        </div>
        <div className="admin-search">
          <MemberSearch />
        </div>
      </header>
      <div className="admin-layout">
        <nav className="admin-nav" aria-label="管理後台導覽">
          <ul>
            {visibleLinks.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) => `admin-nav-link${isActive ? ' is-active' : ''}`}
                  data-short-label={l.shortLabel}
                >
                  <span className="admin-nav-dot" aria-hidden="true" />
                  <span className="admin-nav-label">{l.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
