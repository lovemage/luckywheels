import { NavLink, Outlet } from 'react-router';
import { MemberSearch } from './MemberSearch.js';

const sidebarLinks = [
  { to: '/', label: '首頁', shortLabel: '首頁', end: true },
  { to: '/users', label: '會員列表', shortLabel: '會員' },
  { to: '/redemptions', label: '中獎紀錄', shortLabel: '中獎' },
  { to: '/prizes', label: '獎品設定', shortLabel: '獎品' },
  { to: '/home', label: '首頁設定', shortLabel: '首頁' },
  { to: '/settings', label: '遊戲規則', shortLabel: '規則' },
  { to: '/profile', label: '個人設定', shortLabel: '個人' },
  { to: '/logs', label: '歷史紀錄', shortLabel: '紀錄' },
];

export function AppShell() {
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
            {sidebarLinks.map((l) => (
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
