import { NavLink, Outlet } from 'react-router';

const sidebarLinks = [
  { to: '/admin/', label: '首頁', end: true },
  { to: '/admin/users', label: '會員列表' },
  { to: '/admin/redemptions', label: '中獎紀錄' },
  { to: '/admin/profile', label: '個人設定' },
  { to: '/admin/logs', label: '歷史紀錄' },
];

export function AppShell() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: '100vh' }}>
      <nav style={{ background: '#1f2937', color: '#fff', padding: 16 }}>
        <h2 style={{ fontSize: 16 }}>Lucky Wheels Admin</h2>
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
  );
}
