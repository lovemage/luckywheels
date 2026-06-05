import { useEffect, useState } from 'react';
import { Gift, LayoutList, RotateCw, Sparkles, Trophy } from 'lucide-react';
import { ApiError, setUnauthorizedHandler } from './api/client.js';
import { fetchMe } from './api/me.js';
import {
  fetchPrizes,
  fetchSettings,
  postDraw,
  type DrawResponse,
  type PublicPrize,
  type PublicSettings,
} from './api/draw.js';
import { sessionStore, type MeProfile } from './state/session.js';
import { useSession } from './hooks/useMe.js';
import { Login } from './components/Login.js';
import { Onboarding } from './components/Onboarding.js';
import { WinModal } from './components/WinModal.js';

function availableDrawsFor(points: number, thresholds: { points: number; draws: number }[]): number {
  let draws = 0;
  for (const t of thresholds) {
    if (points >= t.points) draws = t.draws;
    else break;
  }
  return draws;
}

function wheelGradient(prizes: PublicPrize[]) {
  const step = 100 / prizes.length;
  return prizes
    .map((prize, index) => {
      const start = (index * step).toFixed(4);
      const end = ((index + 1) * step).toFixed(4);
      return `${prize.segmentColor} ${start}% ${end}%`;
    })
    .join(', ');
}

export function App() {
  const session = useSession();

  useEffect(() => {
    setUnauthorizedHandler(() => sessionStore.getState().setAnonymous());
    (async () => {
      try {
        const me = await fetchMe();
        sessionStore.getState().setMe(me);
      } catch {
        sessionStore.getState().setAnonymous();
      }
    })();
  }, []);

  if (session.phase === 'loading') {
    return (
      <main className="splash">
        <p>載入中…</p>
      </main>
    );
  }
  if (session.phase === 'anonymous') return <Login />;
  if (session.phase === 'onboarding') return <Onboarding />;
  if (session.phase === 'blacklisted') {
    return (
      <main className="splash">
        <h1>帳號已停用</h1>
        <p>請聯絡客服了解詳情。</p>
      </main>
    );
  }
  return <MainApp me={session.me!} />;
}

function MainApp({ me }: { me: MeProfile }) {
  const [view, setView] = useState<'wheel' | 'ranking' | 'rules' | 'mine'>('wheel');
  const [prizes, setPrizes] = useState<PublicPrize[] | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [selectedTierIndex, setSelectedTierIndex] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<DrawResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchPrizes(), fetchSettings()])
      .then(([p, s]) => {
        setPrizes(p.items);
        setSettings(s);
      })
      .catch(() => setError('無法載入抽獎資料，請稍後再試'));
  }, []);

  if (!prizes || !settings) {
    return (
      <main className="splash">
        <p>{error ?? '載入抽獎資料中…'}</p>
      </main>
    );
  }

  const points = me.points;
  const availableDraws = availableDrawsFor(points, settings.pointThresholds);
  const maxAffordableIndex = (() => {
    let i = -1;
    for (let k = 0; k < settings.pointThresholds.length; k += 1) {
      if (settings.pointThresholds[k]!.points <= points) i = k;
    }
    return i;
  })();
  const effectiveTierIndex = Math.min(selectedTierIndex, Math.max(maxAffordableIndex, 0));
  const selectedTier = settings.pointThresholds[effectiveTierIndex] ?? settings.pointThresholds[0]!;
  const lastTier = settings.pointThresholds[settings.pointThresholds.length - 1];
  const tier: 'single' | 'multi' = selectedTier === lastTier ? 'multi' : 'single';

  const spinDurationStyle = { '--spin-duration': `${settings.spinDurationMs}ms` } as React.CSSProperties;

  async function spin() {
    if (spinning) return;
    setError(null);
    setSpinning(true);
    try {
      const res = await postDraw(tier);
      const targetWheelPosition = res.draws[0]!.prize.wheelPosition;
      const segmentSize = 360 / prizes!.length;
      const targetCenter = targetWheelPosition * segmentSize;
      const next = rotation + 1440 + (360 - targetCenter);
      setRotation(next);
      window.setTimeout(() => {
        setSpinning(false);
        setResult(res);
        sessionStore.getState().setMe({ ...me, points: res.points });
      }, settings!.spinDurationMs);
    } catch (e) {
      setSpinning(false);
      const ae = e as ApiError;
      const messages: Record<string, string> = {
        INSUFFICIENT_POINTS: '積分不足，無法進行此次抽獎',
        ONBOARDING_REQUIRED: '請先完成註冊',
        USER_BLACKLISTED: '帳號已停用',
        TIER_INVALID: '抽獎類型不正確',
      };
      setError(messages[ae.code] ?? `抽獎失敗：${ae.message}`);
      if (ae.code === 'ONBOARDING_REQUIRED' || ae.code === 'USER_BLACKLISTED') {
        try {
          const fresh = await fetchMe();
          sessionStore.getState().setMe(fresh);
        } catch {
          /* ignore */
        }
      }
    }
  }

  function cycleTier() {
    if (spinning) return;
    const cyclable = settings!.pointThresholds
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.draws <= availableDraws);
    if (cyclable.length <= 1) return;
    const here = cyclable.findIndex(({ i }) => i === effectiveTierIndex);
    const next = cyclable[(here + 1) % cyclable.length]!.i;
    setSelectedTierIndex(next);
  }

  return (
    <main className="showcase">
      <section className="phone-shell" aria-label="會員抽獎前台" style={spinDurationStyle}>
        <div className="stage-bg" />
        <div className="floating coin-a" />
        <div className="floating coin-b" />
        <div className="floating shard-a" />
        <div className="floating shard-b" />

        <header className="hero">
          <div className="title-lockup">
            <img
              className="logo-image"
              src="/assets/logo.png"
              alt="幸運輪盤"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>

          <aside className="member-card">
            {me.pictureUrl ? <img className="avatar" src={me.pictureUrl} alt="" /> : <div className="avatar" />}
            <div className="member-copy">
              <strong>{me.nickname ?? me.displayName}</strong>
              <span>{me.accountType === 'test' ? '測試帳號' : '會員專區'}</span>
            </div>
            <dl>
              <div>
                <dt>積分</dt>
                <dd>{points}</dd>
              </div>
              <div>
                <dt>可抽次數</dt>
                <dd>{availableDraws} 次</dd>
              </div>
              <div>
                <dt>累計抽獎次數</dt>
                <dd>—</dd>
              </div>
            </dl>
          </aside>
        </header>

        {view === 'wheel' && (
          <>
            <section className="wheel-screen">
              <Wheel prizes={prizes} rotation={rotation} spinning={spinning} />
            </section>
            <div className="cta-row">
              <button
                className="primary-cta primary-cta--spin"
                onClick={spin}
                disabled={spinning || points < selectedTier.points}
              >
                <Gift size={24} />
                <span>{spinning ? '抽獎中' : selectedTier.draws === 1 ? '抽獎' : `${selectedTier.draws} 連抽`}</span>
              </button>
              <button
                className="primary-cta primary-cta--cycle"
                onClick={cycleTier}
                disabled={spinning || availableDraws <= 1}
                aria-label="切換連抽次數"
              >
                <Sparkles size={22} />
              </button>
            </div>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}

        {view === 'rules' && (
          <section className="panel-screen">
            <ScreenHeader icon={<LayoutList />} title="活動規則" subtitle="使用須知" />
            <div className="rule-list">
              <p>單抽消耗 6 積分、連抽消耗 48 積分，結果由伺服器判定。</p>
              <p>中獎時會產生 Redemption 隨機碼，將碼截圖傳給管理員兌換彩金。</p>
              <p>積分由管理員後台派發，會員不可自行修改。</p>
            </div>
          </section>
        )}

        {view === 'ranking' && (
          <section className="panel-screen">
            <ScreenHeader icon={<Trophy />} title="排行榜" subtitle="建置中" />
            <div className="rule-list">
              <p>排行榜功能建置中。</p>
            </div>
          </section>
        )}

        {view === 'mine' && (
          <section className="panel-screen">
            <ScreenHeader icon={<Gift />} title="我的獎品" subtitle="建置中" />
            <div className="rule-list">
              <p>個人中獎紀錄查詢功能建置中。</p>
            </div>
          </section>
        )}

        <nav className="bottom-tabs">
          <TabButton active={view === 'wheel'} icon={<RotateCw />} label="輪盤" onClick={() => setView('wheel')} />
          <TabButton active={view === 'ranking'} icon={<Trophy />} label="排行榜" onClick={() => setView('ranking')} />
          <TabButton active={view === 'rules'} icon={<LayoutList />} label="活動規則" onClick={() => setView('rules')} />
          <TabButton active={view === 'mine'} icon={<Gift />} label="我的獎品" onClick={() => setView('mine')} />
        </nav>

        {result && <WinModal result={result} onClose={() => setResult(null)} />}
      </section>
    </main>
  );
}

function Wheel({
  prizes,
  rotation,
  spinning,
}: {
  prizes: PublicPrize[];
  rotation: number;
  spinning: boolean;
}) {
  return (
    <div className="wheel-wrap">
      <img className="wheel-frame" src="/assets/wheel-frame.png" alt="" aria-hidden="true" />
      <div className="wheel" style={{ transform: `rotate(${rotation}deg)` }}>
        <div
          className="wheel-face"
          style={{ '--segments': wheelGradient(prizes) } as React.CSSProperties}
          aria-hidden="true"
        />
        {prizes.map((prize, index) => {
          const angle = (360 / prizes.length) * index;
          const cashLabel = prize.cashAmount > 0 ? `${prize.cashAmount}` : '';
          return (
            <div
              className="prize-label"
              key={prize.id}
              style={{
                transform: `rotate(${angle}deg) translateY(var(--label-radius)) rotate(${-(angle + rotation)}deg)`,
                color: prize.textColor,
              }}
            >
              <div className="prize-content">
                <strong>{prize.rankLabel}</strong>
                <span>{prize.name}</span>
                {cashLabel && <small>{cashLabel}</small>}
                {prize.imageUrl ? <img src={prize.imageUrl} alt="" /> : <b>💰</b>}
              </div>
            </div>
          );
        })}
      </div>
      <div className={`hub ${spinning ? 'is-spinning' : ''}`} aria-hidden="true">
        <span />
      </div>
    </div>
  );
}

function ScreenHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="screen-header">
      <div>{icon}</div>
      <span>{subtitle}</span>
      <h2>{title}</h2>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
