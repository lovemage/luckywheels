import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Gamepad2, Home } from 'lucide-react';
import { ApiError } from '../api/client.js';
import { fetchAssistantMe, type AssistantMe } from '../api/assistant.js';
import type { MeProfile } from '../state/session.js';
import { ASSISTANT_BRAND } from './brand.js';
import { fmtInt } from './format.js';
import { BrandMark } from './BrandMark.js';
import { PassClock } from './PassClock.js';
import { InkIcon } from './InkTitle.js';
import { AssistantHome } from './views/AssistantHome.js';
import { RecommendView } from './views/RecommendView.js';
import { ExchangeView } from './views/ExchangeView.js';
import { exchangeOpen } from './OpenPassButton.js';
import { RulesView } from './views/RulesView.js';
import { backToGame, hasDock, isNativeApp } from '../native.js';
import './assistant.css';

// 新版（數據助手）。上線前只有通過預覽閘門的人看得到（DATA_ASSISTANT_ENABLED=preview）。

export type AssistantView = 'home' | 'recommend' | 'exchange' | 'rules';

const TITLES: Record<AssistantView, string> = {
  home: ASSISTANT_BRAND,
  recommend: '本金推薦',
  exchange: '積分兌換',
  rules: '曜金規則',
};

export function AssistantApp({
  me: profile,
  initialView = 'home',
  onExit,
  onLocked,
}: {
  me: MeProfile;
  initialView?: AssistantView;
  onExit: () => void;
  onLocked: () => void;
}) {
  const [view, setView] = useState<AssistantView>(initialView);
  const [me, setMe] = useState<AssistantMe | null>(null);
  const [meError, setMeError] = useState(false);

  const reload = useCallback(async () => {
    try {
      const m = await fetchAssistantMe();
      setMe({ ...m, receivedAt: Date.now() });
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

  const brandName = me?.display?.brandName ?? ASSISTANT_BRAND;

  return (
    <main className="aa-stage">
      <section className="aa-shell" aria-label={brandName}>
        <header className="aa-topbar">
          {view === 'home' ? (
            <div className="aa-brand">
              <BrandMark />
              <span>{brandName}</span>
            </div>
          ) : (
            <button type="button" className="aa-back" onClick={() => go('home')} aria-label={`返回首頁（目前：${TITLES[view]}）`}>
              <ArrowLeft aria-hidden="true" />
              <span>首頁</span>
            </button>
          )}
          <div className="aa-topbar-end">
            <a className="aa-home-link" href="/intro/" aria-label="回到主頁">
              <Home aria-hidden="true" />
              <span>主頁</span>
            </a>
            {me && (
              <div className="aa-badges">
                <span className="aa-badge">積分：{fmtInt(me.points)}</span>
                <PassClock me={me} className="aa-badge" onExpired={reload} />
              </div>
            )}
          </div>
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
            <AssistantHome me={me} nickname={profile.nickname ?? profile.displayName} onNavigate={go} onExpired={reload} />
          ) : view === 'recommend' ? (
            <RecommendView me={me} onNavigate={go} />
          ) : view === 'rules' ? (
            <RulesView me={me} onNavigate={go} />
          ) : (
            <ExchangeView me={me} onChanged={reload} />
          )}
        </div>

        <nav className="aa-tabs" aria-label="數據助手選單">
          <TabButton active={view === 'home'} icon={<InkIcon name="home" />} label="首頁" onClick={() => go('home')} />
          <TabButton active={view === 'recommend'} icon={<InkIcon name="recommend" />} label="本金推薦" onClick={() => go('recommend')} />
          <TabButton active={view === 'exchange'} icon={<InkIcon name="exchange" />} label="兌換" disabled={!exchangeOpen(me)} onClick={() => go('exchange')} />
          <TabButton active={false} icon={<InkIcon name="wheel" />} label="輪盤" onClick={onExit} />
          {isNativeApp && (
            // App 內：網站是全螢幕，遊戲在後面；按這顆才切到遊戲畫面（1.1.0+ 的文字為「進入遊戲」）
            <TabButton active={false} icon={<Gamepad2 aria-hidden="true" />} label={hasDock ? '進入遊戲' : '回遊戲'} onClick={backToGame} />
          )}
        </nav>
      </section>
    </main>
  );
}

function TabButton({ active, icon, label, disabled = false, onClick }: { active: boolean; icon: React.ReactNode; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`aa-tab${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined} disabled={disabled} onClick={onClick}>
      <span className="aa-tab-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

