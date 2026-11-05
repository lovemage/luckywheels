import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminMe, type AdminNavKey } from '../api/me.js';
import { fetchUsers } from '../api/users.js';
import { MemberSearch } from './MemberSearch.js';

type SidebarLink = {
  to: string;
  label: string;
  shortLabel: string;
  nav: AdminNavKey;
  end?: boolean;
};

const L = {
  users: { to: '/users', label: '會員列表', shortLabel: '會員', nav: 'users' },
  redemptions: { to: '/redemptions', label: '中獎紀錄', shortLabel: '中獎', nav: 'redemptions' },
  prizes: { to: '/prizes', label: '獎品設定', shortLabel: '獎品', nav: 'prizes' },
  home: { to: '/home', label: '首頁設定', shortLabel: '首頁', nav: 'system' },
  ads: { to: '/ads', label: '廣告設定', shortLabel: '廣告', nav: 'system' },
  system: { to: '/system', label: '系統設定', shortLabel: '設定', nav: 'system' },
  collector: { to: '/assistant/collector', label: '數據採集', shortLabel: '採集', nav: 'assistant' },
  recommend: { to: '/assistant/recommend', label: '推薦與訊號', shortLabel: '推薦', nav: 'assistant' },
  exchange: { to: '/assistant/exchange', label: '兌換管理', shortLabel: '兌換', nav: 'exchange' },
} satisfies Record<string, SidebarLink>;

/** 桌機側欄：輪盤與數據助手分成兩區 */
const SECTIONS: { title: string; links: SidebarLink[] }[] = [
  { title: '輪盤', links: [L.users, L.redemptions, L.prizes, L.home, L.ads, L.system] },
  { title: '數據助手', links: [L.collector, L.recommend, L.exchange] },
];

/** 手機底部導航：最多 5 個，其餘收進子選單 */
type MobileItem =
  | { kind: 'link'; link: SidebarLink }
  | { kind: 'group'; key: string; label: string; links: SidebarLink[] };

const MOBILE: MobileItem[] = [
  { kind: 'link', link: L.users },
  { kind: 'link', link: L.redemptions },
  { kind: 'link', link: L.prizes },
  { kind: 'group', key: 'wheel', label: '設定', links: [L.home, L.ads, L.system] },
  { kind: 'group', key: 'assistant', label: '助手', links: [L.collector, L.recommend, L.exchange] },
];

export function AppShell() {
  const me = useQuery({ queryKey: ['admin', 'me'], queryFn: fetchAdminMe });
  const canSeeUsers = Boolean(me.data && (me.data.isMain || me.data.allowedNavs.includes('users')));
  const userAlerts = useQuery({
    queryKey: ['admin', 'users', 'alerts'],
    queryFn: () => fetchUsers({ take: 1 }),
    enabled: canSeeUsers,
    refetchInterval: 30_000,
  });

  const visible = (l: SidebarLink) =>
    Boolean(me.data?.isMain || me.data?.allowedNavs.includes(l.nav)) &&
    ((l.nav !== 'assistant' && l.nav !== 'exchange') || Boolean(me.data?.features?.dataAssistant));

  function alertCount(nav: AdminNavKey): number {
    if (nav === 'users') {
      if (!userAlerts.data?.pendingApprovalAlertEnabled) return 0;
      return userAlerts.data?.alerts.pendingApprovalCount ?? 0;
    }
    if (nav === 'redemptions') return userAlerts.data?.alerts.pendingRedemptionCount ?? 0;
    return 0;
  }

  const sections = SECTIONS.map((s) => ({ ...s, links: s.links.filter(visible) })).filter((s) => s.links.length > 0);

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-brand">
          <p className="admin-eyebrow">Admin Console</p>
          <h1>Lucky Wheels 管理後台</h1>
        </div>
        <div className="admin-search">
          <MemberSearch />
        </div>
      </header>
      <div className="admin-layout">
        <nav className="admin-nav" aria-label="管理後台導覽">
          {sections.map((s) => (
            <div key={s.title} className="admin-nav-section">
              <p className="admin-nav-section-title">{s.title}</p>
              <ul>
                {s.links.map((l) => (
                  <li key={l.to}>
                    <SideLink link={l} count={alertCount(l.nav)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
      <MobileNav visible={visible} alertCount={alertCount} />
    </div>
  );
}

function alertLabelFor(nav: AdminNavKey, count: number) {
  return nav === 'users' ? `${count} 位會員待審核` : `${count} 筆中獎待確認`;
}

function SideLink({ link, count }: { link: SidebarLink; count: number }) {
  return (
    <NavLink to={link.to} end={link.end} className={({ isActive }) => `admin-nav-link${isActive ? ' is-active' : ''}`}>
      <span className="admin-nav-dot" aria-hidden="true" />
      <span className="admin-nav-label">{link.label}</span>
      {count > 0 && (
        <span className="admin-nav-alert-count" aria-label={alertLabelFor(link.nav, count)} title={alertLabelFor(link.nav, count)}>
          {count}
        </span>
      )}
    </NavLink>
  );
}

function MobileNav({ visible, alertCount }: { visible: (l: SidebarLink) => boolean; alertCount: (nav: AdminNavKey) => number }) {
  const location = useLocation();
  const [open, setOpen] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  // 換頁時收起子選單
  useEffect(() => setOpen(null), [location.pathname]);

  // 點子選單外面、按 Esc 收起
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 依權限過濾；子選單只剩一項時直接當成一般按鈕，沒有可見項目就隱藏
  const items = MOBILE.flatMap((item): MobileItem[] => {
    if (item.kind === 'link') return visible(item.link) ? [item] : [];
    const links = item.links.filter(visible);
    if (links.length === 0) return [];
    if (links.length === 1) return [{ kind: 'link', link: links[0]! }];
    return [{ ...item, links }];
  });

  const activeGroup = (links: SidebarLink[]) => links.some((l) => location.pathname.startsWith(l.to));

  return (
    <nav className="admin-mnav" ref={navRef} aria-label="管理後台導覽">
      <ul>
        {items.map((item) => {
          if (item.kind === 'link') {
            const count = alertCount(item.link.nav);
            return (
              <li key={item.link.to}>
                <NavLink to={item.link.to} className={({ isActive }) => `admin-mnav-item${isActive ? ' is-active' : ''}`}>
                  <span>{item.link.shortLabel}</span>
                  {count > 0 && (
                    <span className="admin-nav-alert-count" aria-label={alertLabelFor(item.link.nav, count)}>
                      {count}
                    </span>
                  )}
                </NavLink>
              </li>
            );
          }
          const isOpen = open === item.key;
          return (
            <li key={item.key} className="admin-mnav-group">
              <button
                type="button"
                className={`admin-mnav-item${activeGroup(item.links) ? ' is-active' : ''}${isOpen ? ' is-open' : ''}`}
                aria-expanded={isOpen}
                aria-haspopup="menu"
                onClick={() => setOpen(isOpen ? null : item.key)}
              >
                <span>{item.label}</span>
                <span className="admin-mnav-caret" aria-hidden="true">▴</span>
              </button>
              {isOpen && (
                <div className="admin-mnav-menu" role="menu" aria-label={item.label}>
                  {item.links.map((l) => (
                    <NavLink
                      key={l.to}
                      to={l.to}
                      role="menuitem"
                      className={({ isActive }) => `admin-mnav-menu-link${isActive ? ' is-active' : ''}`}
                    >
                      {l.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
