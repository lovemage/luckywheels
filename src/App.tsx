import { useEffect, useRef, useState } from 'react';
import { Gift, LayoutList, Sparkles } from 'lucide-react';
import { ApiError, setUnauthorizedHandler } from './api/client.js';
import { fetchMe } from './api/me.js';
import {
  fetchWinHistory,
  fetchPrizes,
  fetchSettings,
  postDraw,
  type DrawResponse,
  type PublicPrize,
  type PublicSettings,
  type WinHistoryEntry,
} from './api/draw.js';
import { sessionStore, type MeProfile } from './state/session.js';
import { useSession } from './hooks/useMe.js';
import { Login } from './components/Login.js';
import { Onboarding } from './components/Onboarding.js';
import { WinModal } from './components/WinModal.js';
import { Legal, type LegalTab } from './components/Legal.js';

function proxiedImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/')) return url;
  try {
    const u = new URL(url);
    if (u.pathname.includes('/prize-images/')) {
      return `/api/media-proxy?url=${encodeURIComponent(u.href)}`;
    }
  } catch {
    return url;
  }
  return url;
}

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

function formatWinHistory(items: WinHistoryEntry[]): WinHistoryEntry[] {
  return items.map((entry) => ({
    ...entry,
    createdAt: new Date(entry.createdAt).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
  }));
}

function copyCode(code: string) {
  void navigator.clipboard?.writeText(`LW-${code}`).catch(() => {});
}

function settleMobileViewport() {
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${height}px`);
  window.scrollTo({ top: 1, behavior: 'auto' });
}

const SOUND_SOURCES = {
  enter: '/assets/sfx/background-sound.mp3',
  wheelTap: '/assets/sfx/wheel-tap.ogg',
  spinConfirm: '/assets/sfx/spin-confirm.ogg',
  wheelSpinning: '/assets/sfx/spin-sound.mp3',
  win: '/assets/sfx/floraphonic-coin-payout-6-213526.mp3',
} as const;
const MULTI_SPIN_DURATION_MS = 8800;
const MULTI_REVEAL_OFFSET_MS = 1000;

type SoundKey = keyof typeof SOUND_SOURCES;

function createAudio(src: string, loop = false) {
  const audio = new Audio(src);
  audio.preload = 'auto';
  audio.loop = loop;
  return audio;
}

export function App() {
  const session = useSession();
  const [legalTab, setLegalTab] = useState<LegalTab | null>(null);
  const openLegal = (tab: LegalTab) => setLegalTab(tab);

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

  let body: React.ReactNode;
  if (session.phase === 'loading') {
    body = <main className="splash"><p>載入中…</p></main>;
  } else if (session.phase === 'anonymous') {
    body = <Login onShowLegal={openLegal} />;
  } else if (session.phase === 'onboarding') {
    body = <Onboarding />;
  } else if (session.phase === 'blacklisted') {
    body = (
      <main className="splash">
        <h1>帳號已停用</h1>
        <p>請聯絡客服了解詳情。</p>
      </main>
    );
  } else {
    body = <MainApp me={session.me!} onShowLegal={openLegal} />;
  }

  return (
    <>
      {body}
      {legalTab && <Legal initialTab={legalTab} onClose={() => setLegalTab(null)} />}
    </>
  );
}

function MainApp({ me, onShowLegal }: { me: MeProfile; onShowLegal: (tab: LegalTab) => void }) {
  const [view, setView] = useState<'wheel' | 'rules' | 'mine'>('wheel');
  const [prizes, setPrizes] = useState<PublicPrize[] | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [selectedTierIndex, setSelectedTierIndex] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<DrawResponse | null>(null);
  const [winHistory, setWinHistory] = useState<WinHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const soundsRef = useRef<Record<SoundKey, HTMLAudioElement> | null>(null);
  const soundTimersRef = useRef<Partial<Record<SoundKey, number>>>({});
  const introPlayedRef = useRef(false);

  function playSound(key: SoundKey) {
    const audio = soundsRef.current?.[key];
    if (!audio) return;
    const timer = soundTimersRef.current[key];
    if (timer) {
      window.clearTimeout(timer);
      delete soundTimersRef.current[key];
    }
    audio.pause();
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  }

  function stopSound(key: SoundKey) {
    const audio = soundsRef.current?.[key];
    const timer = soundTimersRef.current[key];
    if (timer) {
      window.clearTimeout(timer);
      delete soundTimersRef.current[key];
    }
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  function playSoundForDuration(key: SoundKey, durationMs: number) {
    stopSound(key);
    playSound(key);
    soundTimersRef.current[key] = window.setTimeout(() => {
      stopSound(key);
    }, durationMs);
  }

  useEffect(() => {
    soundsRef.current = {
      enter: createAudio(SOUND_SOURCES.enter),
      wheelTap: createAudio(SOUND_SOURCES.wheelTap),
      spinConfirm: createAudio(SOUND_SOURCES.spinConfirm),
      wheelSpinning: createAudio(SOUND_SOURCES.wheelSpinning),
      win: createAudio(SOUND_SOURCES.win),
    };

    return () => {
      Object.values(soundTimersRef.current).forEach((timer) => {
        if (timer) window.clearTimeout(timer);
      });
      soundTimersRef.current = {};
      Object.values(soundsRef.current ?? {}).forEach((audio) => {
        audio.pause();
        audio.src = '';
      });
      soundsRef.current = null;
    };
  }, []);

  useEffect(() => {
    Promise.all([fetchPrizes(), fetchSettings()])
      .then(([p, s]) => {
        setPrizes(p.items);
        setSettings(s);
      })
      .catch(() => setError('無法載入抽獎資料，請稍後再試'));
  }, []);

  useEffect(() => {
    if (!prizes || !settings || introPlayedRef.current) return;
    introPlayedRef.current = true;
    playSound('enter');
  }, [prizes, settings]);

  useEffect(() => {
    const timers = [50, 300, 800].map((delay) => window.setTimeout(settleMobileViewport, delay));
    const onResize = () => settleMobileViewport();
    window.visualViewport?.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.visualViewport?.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  useEffect(() => {
    if (view !== 'mine') return;
    fetchWinHistory()
      .then((history) => setWinHistory(formatWinHistory(history.items)))
      .catch(() => setError('無法載入中獎紀錄，請稍後再試'));
  }, [view]);

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
  const spinAnimationDurationMs = selectedTier.draws > 1 ? MULTI_SPIN_DURATION_MS : settings.spinDurationMs;
  const revealDelayMs =
    selectedTier.draws > 1
      ? Math.max(0, spinAnimationDurationMs - MULTI_REVEAL_OFFSET_MS)
      : spinAnimationDurationMs;
  const phoneShellStyle = {
    '--spin-duration': `${spinAnimationDurationMs}ms`,
    ...(settings.homeBackgroundUrl
      ? { '--home-bg': `url(${JSON.stringify(proxiedImageUrl(settings.homeBackgroundUrl) ?? settings.homeBackgroundUrl)})` }
      : {}),
  } as React.CSSProperties;

  async function spin() {
    if (spinning) return;
    playSound('wheelTap');
    setError(null);
    setSpinning(true);
    try {
      const res = await postDraw(selectedTier.draws);
      playSound('spinConfirm');
      playSoundForDuration('wheelSpinning', spinAnimationDurationMs);
      const segmentSize = 360 / prizes!.length;
      const resultPrizeId = res.draws[0]!.prize.id;
      const targetPrizeIndex = prizes!.findIndex((prize) => prize.id === resultPrizeId);
      const resultIndex = targetPrizeIndex >= 0 ? targetPrizeIndex : res.draws[0]!.prize.wheelPosition;
      const targetCenter = resultIndex * segmentSize;
      const targetRotation = (360 - targetCenter) % 360;
      const next = Math.ceil(rotation / 360) * 360 + 1440 + targetRotation;
      setRotation(next);
      const revealResult = () => {
        setResult(res);
        const winningDraws = res.draws
          .filter((draw) => draw.winningCashAmount > 0)
          .map((draw) => ({
            subIndex: draw.subIndex,
            rankLabel: draw.prize.rankLabel,
            prizeName: draw.prize.name,
            winningCashAmount: draw.winningCashAmount,
          }));
        if (winningDraws.length > 0) {
          setWinHistory((current) => [
            {
              id: res.redemption.id,
              code: res.redemption.code,
              totalWinAmount: winningDraws.reduce((sum, draw) => sum + draw.winningCashAmount, 0),
              status: res.redemption.status,
              createdAt: new Date().toLocaleString('zh-TW', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              }),
              draws: winningDraws,
            },
            ...current,
          ]);
        }
        if (res.draws.some((draw) => draw.winningCashAmount > 0)) {
          playSound('win');
        }
        sessionStore.getState().setMe({
          ...me,
          points: res.points,
          lifetimeDrawCount: me.lifetimeDrawCount + (res.isTest ? 0 : res.tierDraws),
        });
      };
      window.setTimeout(revealResult, revealDelayMs);
      window.setTimeout(() => {
        stopSound('wheelSpinning');
        setSpinning(false);
      }, spinAnimationDurationMs);
    } catch (e) {
      stopSound('wheelSpinning');
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

  function closeResult() {
    stopSound('wheelSpinning');
    setResult(null);
  }

  return (
    <main className="showcase">
      <section className="phone-shell" aria-label="會員抽獎前台" style={phoneShellStyle}>
        <div className="stage-bg" />
        <div className="floating coin-a" />
        <div className="floating coin-b" />
        <div className="floating shard-a" />
        <div className="floating shard-b" />

        <header className="hero">
          <div className="title-lockup">
            <img
              className="logo-image"
              src={proxiedImageUrl(settings.homeLogoUrl) || '/assets/logo.png'}
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
              {settings.rulesText.split('\n').filter((line) => line.trim()).map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
            <div className="legal-footer-links">
              <button type="button" onClick={() => onShowLegal('privacy')}>隱私權政策</button>
              <button type="button" onClick={() => onShowLegal('terms')}>服務條款</button>
            </div>
          </section>
        )}

        {view === 'mine' && (
          <section className="panel-screen">
            <ScreenHeader icon={<Gift />} title="中獎紀錄" />
            <div className="rule-list">
              {winHistory.length === 0 ? (
                <p>目前尚無中獎紀錄。</p>
              ) : (
                <ol className="win-history-list">
                  {winHistory.map((entry, index) => (
                    <li key={entry.id} className="win-history-item">
                      <div className="win-history-head">
                        <strong>
                          第 {index + 1} 筆
                          {entry.status === 'delivered' && <span className="win-history-status">已領取</span>}
                        </strong>
                        <span>{entry.createdAt}</span>
                      </div>
                      <div className="win-history-code">
                        <span>LW-{entry.code}</span>
                        <button type="button" aria-label="複製兌換碼" onClick={() => copyCode(entry.code)}>
                          <CopyIcon />
                        </button>
                      </div>
                      <ol className="win-history-draws">
                        {entry.draws.map((draw) => (
                          <li key={`${entry.id}-${draw.subIndex}`}>
                            <span>#{draw.subIndex + 1}</span>
                            <span>
                              {draw.rankLabel} {draw.prizeName}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        )}

        <nav className="bottom-tabs">
          <TabButton active={view === 'wheel'} icon={<WheelTabIcon />} label="輪盤" onClick={() => setView('wheel')} />
          <TabButton active={view === 'rules'} icon={<RulesTabIcon />} label="活動規則" onClick={() => setView('rules')} />
          <TabButton active={view === 'mine'} icon={<HistoryTabIcon />} label="中獎紀錄" onClick={() => setView('mine')} />
        </nav>

        {result && <WinModal result={result} onClose={closeResult} />}
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
                {prize.imageUrl ? <img src={proxiedImageUrl(prize.imageUrl) ?? prize.imageUrl} alt="" /> : <b>💰</b>}
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

function ScreenHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="screen-header">
      <div>{icon}</div>
      {subtitle && <span>{subtitle}</span>}
      <h2>{title}</h2>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function WheelTabIcon() {
  return (
    <svg viewBox="0 0 15 15" width="24" height="24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M7.5.877a6.623 6.623 0 1 1 0 13.246A6.623 6.623 0 0 1 7.5.877M3.781 11.782A5.65 5.65 0 0 0 7.1 13.156v-4.69zM7.9 13.156a5.64 5.64 0 0 0 3.315-1.374L7.9 8.467zM1.84 7.9a5.65 5.65 0 0 0 1.375 3.316L6.533 7.9zm9.941 3.316A5.64 5.64 0 0 0 13.156 7.9h-4.69zM8.467 7.1h4.69a5.65 5.65 0 0 0-1.375-3.318zM3.216 3.782A5.65 5.65 0 0 0 1.842 7.1h4.691zM7.1 1.842a5.65 5.65 0 0 0-3.318 1.375L7.1 6.533zm.8 4.691l3.316-3.316A5.64 5.64 0 0 0 7.9 1.842z" />
    </svg>
  );
}

function RulesTabIcon() {
  return (
    <svg viewBox="0 0 15 15" width="24" height="24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M7.224 8.607a.5.5 0 0 1 .629.065l2.476 2.474a.5.5 0 0 1 0 .707L7.853 14.33a.5.5 0 0 1-.707 0L4.67 11.853l-.064-.078a.5.5 0 0 1 .064-.629l2.475-2.474zM5.732 11.5l1.767 1.767L9.267 11.5L7.499 9.732zM3.224 4.607a.5.5 0 0 1 .629.065l2.476 2.474a.5.5 0 0 1 0 .707L3.853 10.33a.5.5 0 0 1-.707 0L.67 7.853l-.064-.077a.5.5 0 0 1 .064-.63l2.475-2.474zm8 0a.5.5 0 0 1 .629.065l2.476 2.474a.5.5 0 0 1 0 .707l-2.476 2.476a.5.5 0 0 1-.707 0L8.67 7.853l-.064-.078a.5.5 0 0 1 .064-.629l2.475-2.474zM1.732 7.5l1.767 1.768L5.267 7.5L3.499 5.732zm8 0l1.767 1.767L13.267 7.5l-1.768-1.768zM7.224.607a.5.5 0 0 1 .629.065l2.476 2.474a.5.5 0 0 1 0 .707L7.853 6.33a.5.5 0 0 1-.707 0L4.67 3.853l-.064-.078a.5.5 0 0 1 .064-.629L7.146.672zM5.732 3.5l1.767 1.767L9.267 3.5L7.499 1.732z" />
    </svg>
  );
}

function HistoryTabIcon() {
  return (
    <svg viewBox="0 0 15 15" width="24" height="24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M4.646 12.647a.5.5 0 0 1 .707.707l-1 1a.5.5 0 1 1-.707-.707zM10.41.811a6.3 6.3 0 0 1 1.794-.02c.528.08 1.051.256 1.4.605c.348.348.525.87.604 1.399c.081.543.07 1.166-.02 1.794c-.177 1.239-.68 2.608-1.535 3.464l-.623.623l.465 3.253a.5.5 0 0 1-.142.424l-2 2a.5.5 0 0 1-.782-.096l-1.17-1.951l-.548.547a.5.5 0 0 1-.707 0l-1.5-1.5a.5.5 0 1 1 .707-.707L7.5 11.793l4.446-4.446c.645-.645 1.093-1.775 1.253-2.899a5.4 5.4 0 0 0 .02-1.505c-.067-.442-.196-.713-.323-.84c-.126-.126-.397-.256-.84-.322a5.4 5.4 0 0 0-1.504.02c-1.053.151-2.112.554-2.772 1.135l-.127.118L3.207 7.5l1.146 1.146a.5.5 0 0 1-.707.708l-1.5-1.5a.5.5 0 0 1 0-.708l.547-.546l-1.95-1.171a.5.5 0 0 1-.097-.783l2-2a.5.5 0 0 1 .424-.141l3.253.465l.623-.623C7.802 1.49 9.171.989 10.41.812M3.146 11.147a.5.5 0 0 1 .707.707l-2 2a.5.5 0 1 1-.707-.707zm5.984.431l.97 1.615l1.37-1.37l-.324-2.262zM1.646 9.647a.5.5 0 0 1 .707.707l-1 1a.5.5 0 1 1-.707-.707zM9.5 4.25a1.25 1.25 0 1 1 0 2.499a1.25 1.25 0 0 1 0-2.499m-7.693.65l1.616.97l2.016-2.017l-2.262-.324z" />
    </svg>
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
