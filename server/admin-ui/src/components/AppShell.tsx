import { NavLink, Outlet } from 'react-router';
import { MemberSearch } from './MemberSearch.js';

const sidebarLinks = [
  { to: '/admin/', label: '首頁', end: true },
  { to: '/admin/users', label: '會員列表' },
  { to: '/admin/redemptions', label: '中獎紀錄' },
  { to: '/admin/profile', label: '個人設定' },
  { to: '/admin/logs', label: '歷史紀錄' },
];

export function AppShell() {
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: '100vh' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', borderBottom: '1px solid #ddd' }}>
        <h1 style={{ margin: 0, fontSize: 16 }}>Lucky Wheels 管理後台</h1>
        <div style={{ marginLeft: 'auto' }}><MemberSearch /></div>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr' }}>
        <nav style={{ background: '#1f2937', color: '#fff', padding: 16 }}>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {sidebarLinks.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  end={l.end}
                  style={({ isActive }) => ({
                    display: 'block',
                    padding: '8px 12px',
                    color: '#fff',
                    background: isActive ? '#374151' : 'transparent',
                    textDecoration: 'none',
                    borderRadius: 4,
                  })}
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main style={{ padding: 24 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
