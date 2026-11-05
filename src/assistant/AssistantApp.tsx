import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Coins, Hourglass, Home } from 'lucide-react';
import { ApiError } from '../api/client.js';
import { fetchAssistantMe, type AssistantMe } from '../api/assistant.js';
import type { MeProfile } from '../state/session.js';
import { ASSISTANT_BRAND } from './brand.js';
import { BrandMark } from './BrandMark.js';
import { AssistantHome } from './views/AssistantHome.js';
import { RecommendView } from './views/RecommendView.js';
import { ExchangeView } from './views/ExchangeView.js';
import { RulesView } from './views/RulesView.js';
import './assistant.css';

// 新版（數據助手）。上線前只有通過預覽閘門的人看得到（DATA_ASSISTANT_ENABLED=preview）。

export type AssistantView = 'home' | 'recommend' | 'exchange' | 'rules';

const TITLES: Record<AssistantView, string> = {
  home: ASSISTANT_BRAND,
  recommend: '本金推薦',
  exchange: '積分兌換',
  rules: '曜金規則',
};

export function AssistantApp({ me: profile, onExit, onLocked }: { me: MeProfile; onExit: () => void; onLocked: () => void }) {
  const [view, setView] = useState<AssistantView>('home');
  const [me, setMe] = useState<AssistantMe | null>(null);
  const [meError, setMeError] = useState(false);

  const reload = useCallback(async () => {
    try {
      setMe(await fetchAssistantMe());
      setMeError(false);
    } catch (e) {
      // 預覽 cookie 過期或預覽已關閉 → 回原版
      if (e instanceof ApiError && e.status === 404) onLocked();
      else setMeError(true);
    }
  }, [onLocked]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const go = useCallback((next: AssistantView, anchor?: string) => {
    setView(next);
    // 等新畫面掛上後再捲動（anchor：頁內區塊 id）
    requestAnimationFrame(() => {
      const el = anchor ? document.getElementById(anchor) : null;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else window.scrollTo({ top: 0 });
    });
  }, []);

  return (
    <main className="aa-stage">
      <section className="aa-shell" aria-label={ASSISTANT_BRAND}>
        <header className="aa-topbar">
          {view === 'home' ? (
            <div className="aa-brand">
              <BrandMark />
              <span>{ASSISTANT_BRAND}</span>
            </div>
          ) : (
            <button type="button" className="aa-back" onClick={() => go('home')} aria-label={`返回首頁（目前：${TITLES[view]}）`}>
              <ArrowLeft aria-hidden="true" />
              <span>首頁</span>
            </button>
          )}
          <span className="aa-badge">測試版</span>
        </header>

        <div className="aa-content">
          {meError && !me ? (
            <div className="aa-notice" role="alert">
              <p>無法載入會員資料，請檢查網路後再試一次。</p>
              <button type="button" className="aa-button aa-button--ghost" onClick={() => void reload()}>
                重新載入
              </button>
            </div>
          ) : view === 'home' ? (
            <AssistantHome me={me} nickname={profile.nickname ?? profile.displayName} onNavigate={go} />
          ) : view === 'recommend' ? (
            <RecommendView me={me} onNavigate={go} />
          ) : view === 'rules' ? (
            <RulesView me={me} onNavigate={go} />
          ) : (
            <ExchangeView me={me} onChanged={reload} />
          )}
        </div>

        <nav className="aa-tabs" aria-label="數據助手選單">
          <TabButton active={view === 'home'} icon={<Home />} label="首頁" onClick={() => go('home')} />
          <TabButton active={view === 'recommend'} icon={<Coins />} label="本金推薦" onClick={() => go('recommend')} />
          <TabButton active={view === 'exchange'} icon={<Hourglass />} label="兌換" onClick={() => go('exchange')} />
          <TabButton active={false} icon={<WheelIcon />} label="輪盤" onClick={onExit} />
        </nav>
      </section>
    </main>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" className={`aa-tab${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined} onClick={onClick}>
      <span className="aa-tab-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function WheelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 3v7M12 14v7M3 12h7M14 12h7M5.6 5.6l5 5M13.4 13.4l5 5M18.4 5.6l-5 5M10.6 13.4l-5 5" />
    </svg>
  );
}
