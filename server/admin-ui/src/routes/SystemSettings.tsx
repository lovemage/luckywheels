import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Logs } from './Logs.js';
import { Profile } from './Profile.js';
import { Settings } from './Settings.js';
import { HomeSettings } from './HomeSettings.js';
import { SubAccounts } from './SubAccounts.js';
import { fetchAdminMe } from '../api/me.js';

type SystemTab = {
  key: string;
  label: string;
  element: ReactElement;
  mainOnly?: boolean;
};

const systemTabs: SystemTab[] = [
  { key: 'subAccounts', label: '子帳設定', element: <SubAccounts />, mainOnly: true },
  { key: 'logs', label: '歷史紀錄', element: <Logs /> },
  { key: 'profile', label: '個人設定', element: <Profile /> },
  { key: 'settings', label: '遊戲規則', element: <Settings /> },
  { key: 'home', label: '首頁設定', element: <HomeSettings /> },
] as const;

type SystemTabKey = string;

export function SystemSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const me = useQuery({ queryKey: ['admin', 'me'], queryFn: fetchAdminMe });
  const visibleTabs = useMemo(
    () => systemTabs.filter((tab) => !tab.mainOnly || me.data?.isMain),
    [me.data?.isMain],
  );
  const currentTab = searchParams.get('tab');
  const activeTab = useMemo(
    () => visibleTabs.find((tab) => tab.key === currentTab) ?? visibleTabs[0] ?? systemTabs[0]!,
    [currentTab, visibleTabs],
  );

  const setActiveTab = (key: SystemTabKey) => {
    setSearchParams({ tab: key });
  };

  return (
    <section className="member-detail-page system-settings">
      <header className="member-detail-hero">
        <div>
          <p className="admin-eyebrow">System</p>
          <h1>系統設定</h1>
          <p>集中管理子帳設定、歷史紀錄、個人設定、遊戲規則與首頁設定。</p>
        </div>
      </header>
      <div className="system-settings-tabs" role="tablist" aria-label="系統設定分頁">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab.key === tab.key}
            className={activeTab.key === tab.key ? 'is-active' : ''}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="system-settings-panel" role="tabpanel">
        {activeTab.element}
      </div>
    </section>
  );
}
