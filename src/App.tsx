import { useEffect, useRef, useState } from 'react';
import { Gift, LayoutList, RotateCw, Sparkles } from 'lucide-react';
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
import { Legal, type LegalTab } from './components/Legal.js';

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

const SOUND_SOURCES = {
  enter: '/assets/sfx/background-sound.mp3',
  wheelTap: '/assets/sfx/wheel-tap.ogg',
  spinConfirm: '/assets/sfx/spin-confirm.ogg',
  wheelSpinning: '/assets/sfx/spin-sound.mp3',
  win: '/assets/sfx/floraphonic-coin-payout-6-213526.mp3',
} as const;

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
  type WinHistoryEntry = {
    id: string;
    code: string;
    totalWinAmount: number;
    createdAt: string;
    draws: {
      subIndex: number;
      rankLabel: string;
      prizeName: string;
      winningCashAmount: number;
    }[];
  };

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
  const spinDurationStyle = { '--spin-duration': `${settings.spinDurationMs}ms` } as React.CSSProperties;

  async function spin() {
    if (spinning) return;
    playSound('wheelTap');
    setError(null);
    setSpinning(true);
    try {
      const res = await postDraw(selectedTier.draws);
      playSound('spinConfirm');
      playSoundForDuration('wheelSpinning', settings!.spinDurationMs);
      const segmentSize = 360 / prizes!.length;
      const resultPrizeId = res.draws[0]!.prize.id;
      const targetPrizeIndex = prizes!.findIndex((prize) => prize.id === resultPrizeId);
      const resultIndex = targetPrizeIndex >= 0 ? targetPrizeIndex : res.draws[0]!.prize.wheelPosition;
      const targetCenter = resultIndex * segmentSize;
      const targetRotation = (360 - targetCenter) % 360;
      const next = Math.ceil(rotation / 360) * 360 + 1440 + targetRotation;
      setRotation(next);
      window.setTimeout(() => {
        stopSound('wheelSpinning');
        setSpinning(false);
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
        if (res.draws.some((draw) => draw.winningCashAmount > 0 && !draw.gatedBy)) {
          playSound('win');
        }
        sessionStore.getState().setMe({ ...me, points: res.points });
      }, settings!.spinDurationMs);
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
            <ScreenHeader icon={<Gift />} title="中獎紀錄" subtitle="每次中獎明細" />
            <div className="rule-list">
              {winHistory.length === 0 ? (
                <p>目前尚無中獎紀錄。</p>
              ) : (
                <ol className="win-history-list">
                  {winHistory.map((entry, index) => (
                    <li key={entry.id} className="win-history-item">
                      <div className="win-history-head">
                        <strong>第 {index + 1} 筆</strong>
                        <span>{entry.createdAt}</span>
                      </div>
                      <div className="win-history-code">兌換碼：LW-{entry.code}</div>
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
          <TabButton active={view === 'wheel'} icon={<RotateCw />} label="輪盤" onClick={() => setView('wheel')} />
          <TabButton active={view === 'rules'} icon={<LayoutList />} label="活動規則" onClick={() => setView('rules')} />
          <TabButton active={view === 'mine'} icon={<Gift />} label="中獎紀錄" onClick={() => setView('mine')} />
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
