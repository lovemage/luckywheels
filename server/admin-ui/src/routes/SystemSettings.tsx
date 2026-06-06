import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Logs } from './Logs.js';
import { Profile } from './Profile.js';
import { Settings } from './Settings.js';
import { HomeSettings } from './HomeSettings.js';

const systemTabs = [
  { key: 'logs', label: '歷史紀錄', element: <Logs /> },
  { key: 'profile', label: '個人設定', element: <Profile /> },
  { key: 'settings', label: '遊戲規則', element: <Settings /> },
  { key: 'home', label: '首頁設定', element: <HomeSettings /> },
] as const;

type SystemTabKey = (typeof systemTabs)[number]['key'];

export function SystemSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab');
  const activeTab = useMemo(
    () => systemTabs.find((tab) => tab.key === currentTab) ?? systemTabs[0],
    [currentTab],
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
          <p>集中管理歷史紀錄、個人設定、遊戲規則與首頁設定。</p>
        </div>
      </header>
      <div className="system-settings-tabs" role="tablist" aria-label="系統設定分頁">
        {systemTabs.map((tab) => (
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
