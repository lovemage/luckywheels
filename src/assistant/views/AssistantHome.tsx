import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client.js';
import { fetchTeaserRooms, fetchTopRooms, type AssistantMe, type RoomsResponse } from '../../api/assistant.js';
import { LightPillars } from '../LightPillars.js';
import { InkIcon, InkTitle, inkTitleSrc } from '../InkTitle.js';
import { COLLECT_INTRO_MS, CollectingLoader } from '../CollectingLoader.js';
import { fmtAgo, fmtClock, fmtInt, fmtRemainingDetail, fmtRtp, fmtStamp, slotIconFor } from '../format.js';
import type { AssistantView } from '../AssistantApp.js';
import { isNativeApp } from '../../native.js';
import { SignalCard } from '../SignalCard.js';
import { exchangeClosedMessage, exchangeOpen, OpenPassButton } from '../OpenPassButton.js';

// Android 手機的瀏覽器（不在 App 內）才顯示安裝 App 的入口
const showAppInstall = !isNativeApp && typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

const RANK = ['1', '2', '3', '4', '5'];

type TopState =
  | { kind: 'loading' }
  | { kind: 'locked' }
  | { kind: 'error' }
  | { kind: 'ready'; data: RoomsResponse };

export function AssistantHome({
  me,
  nickname,
  onNavigate,
  onExpired,
}: {
  me: AssistantMe | null;
  nickname: string;
  onNavigate: (view: AssistantView, anchor?: string) => void;
  /** 使用期限倒數歸零時呼叫（重新載入會員資料，畫面切回未開通） */
  onExpired?: () => void;
}) {
  const active = me?.pass.active ?? false;
  const [top, setTop] = useState<TopState>({ kind: 'loading' });
  const [now, setNow] = useState(() => Date.now());
  // 第一次拿到排行後，資料正常更新才跑約 4.5 秒「數據分析中」動畫，結束後才顯示排行；
  // 資料暫停更新（stale）、錯誤或未開通時直接顯示結果，不播動畫。只在進入首頁時判斷一次
  const [intro, setIntro] = useState<'pending' | 'playing' | 'done'>('pending');
  useEffect(() => {
    if (intro !== 'pending' || top.kind === 'loading') return;
    setIntro(top.kind === 'ready' && !top.data.game.stale ? 'playing' : 'done');
  }, [intro, top]);
  useEffect(() => {
    if (intro !== 'playing') return;
    const t = window.setTimeout(() => setIntro('done'), COLLECT_INTRO_MS);
    return () => window.clearTimeout(t);
  }, [intro]);

  useEffect(() => {
    if (!me) return;
    let alive = true;
    // 未開通：顯示預覽排行（房號遮蔽、霧化），引導開通
    const load = () =>
      (active ? fetchTopRooms(5) : fetchTeaserRooms())
        .then((data) => alive && setTop({ kind: 'ready', data }))
        .catch((e: unknown) => {
          if (!alive) return;
          setTop(e instanceof ApiError && e.code === 'ASSISTANT_EXPIRED' ? { kind: 'locked' } : { kind: 'error' });
        });
    void load();
    // 數據每數分鐘更新一輪；首頁停留時每分鐘重抓，並更新「幾秒前」
    const refresh = window.setInterval(load, 60_000);
    const tick = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      alive = false;
      window.clearInterval(refresh);
      window.clearInterval(tick);
    };
  }, [me, active]);

  const collecting = intro === 'playing';
  const game = !collecting && top.kind === 'ready' ? top.data.game : null;

  return (
    <div className="aa-home">
      <p className="aa-freshness" aria-live="polite">
        {game?.stale ? (
          <span className="aa-freshness-stale">資料暫停更新 · 最後更新 {fmtStamp(game.updatedAt)}</span>
        ) : game?.updatedAt ? (
          <>資料更新 {fmtClock(game.updatedAt)} · {fmtAgo(game.updatedAt, now)}</>
        ) : (
          <>{nickname}，歡迎使用</>
        )}
      </p>

      <section className="aa-hero" aria-labelledby="aa-hero-title">
        {/* 金虎在流光後方，由看不到慢慢浮現 */}
        <img className="aa-tiger" src="/assets/assistant/tiger.webp" alt="" aria-hidden="true" draggable={false} />
        <LightPillars />
        <div className="aa-hero-copy">
          <InkTitle as="h1" id="aa-hero-title" className="aa-display" text="機台數據 一眼看清" height={50} />
          <p className="aa-hero-sub">ATG 房間整理 · 本金條件篩選</p>
          <div className="aa-hero-space" aria-hidden="true" />
          {me && active && <PassBar me={me} onExpired={onExpired} />}
        </div>
      </section>

      <nav className="aa-entries" aria-label="功能入口">
        <EntryTile icon={<InkIcon name="rules" />} title="曜金規則" sub="數據怎麼看" onClick={() => onNavigate('rules')} />
        <EntryTile icon={<InkIcon name="recommend" />} title="本金推薦" sub="依本金篩選" onClick={() => onNavigate('recommend')} />
        <EntryTile icon={<InkIcon name="exchange" />} title="積分兌換" sub={me && !exchangeOpen(me) ? exchangeClosedMessage(me) : '開通・延長時間'} disabled={!exchangeOpen(me)} onClick={() => onNavigate('exchange')} />
        <EntryTile icon={<InkIcon name="history" />} title="兌換紀錄" sub="開通與到期" onClick={() => onNavigate('exchange', 'aa-history')} />
      </nav>

      {me && active && <SignalCard onExpired={onExpired} />}

      <section className="aa-top" id="aa-top" aria-labelledby="aa-top-title">
        <div className="aa-section-head">
          <InkTitle id="aa-top-title" className="aa-display" text={me?.display?.topTitle ?? '精選空台 TOP 5'} height={34} />
          {game &&
            (inkTitleSrc(game.name) ? (
              <img className="aa-section-note aa-ink-note" src={inkTitleSrc(game.name)!} alt={game.name} />
            ) : (
              <span className="aa-section-note">{game.name}</span>
            ))}
        </div>

        {collecting && <CollectingLoader />}

        {!collecting && top.kind === 'loading' && (
          <ol className="aa-rooms" aria-busy="true">
            {RANK.map((r) => (
              <li key={r} className="aa-room is-skeleton">
                <span className="aa-room-rank">{r}</span>
                <span className="aa-skel aa-skel--icon" />
                <span className="aa-skel aa-skel--text" />
              </li>
            ))}
          </ol>
        )}

        {top.kind === 'locked' && (
          <div className="aa-locked">
            <p>開通後可查看即時空台排行、綜合分數與本金推薦。</p>
            <OpenPassButton me={me} className="aa-button" onClick={() => onNavigate('exchange')} />
          </div>
        )}

        {!collecting && top.kind === 'error' && (
          <div className="aa-notice" role="alert">
            <p>空台排行暫時無法載入，請稍後再試。</p>
          </div>
        )}

        {!collecting && top.kind === 'ready' &&
          (top.data.items.length === 0 ? (
            <div className="aa-notice">
              <p>{top.data.game.stale ? '數據分析暫停中，恢復更新後會顯示空台排行。' : '目前沒有空台，稍後再來看看。'}</p>
            </div>
          ) : (
            <>
            <ol className={`aa-rooms is-reveal${top.data.masked ? ' is-masked' : ''}`}>
              {top.data.items.map((room, i) => (
                <li key={room.id} className="aa-room" style={{ '--i': i } as React.CSSProperties}>
                  <span className="aa-room-rank" aria-label={`第 ${i + 1} 名`}>{RANK[i]}</span>
                  <img className="aa-room-icon" src={slotIconFor(top.data.masked ? room.id : room.roomNo)} alt="" width="56" height="56" loading="lazy" />
                  <div className="aa-room-main">
                    <p className="aa-room-title">
                      {top.data.masked ? (
                        <span className="aa-room-no aa-room-no--masked" aria-label="開通後顯示機台編號">#{room.roomNo}</span>
                      ) : (
                        <span className="aa-room-no">#{room.roomNo}</span>
                      )}
                      {i < 2 && <img className="aa-rec-label" src="/assets/assistant/rec-label.webp" alt="推薦" width="52" height="28" />}
                      <span className="aa-chip">空台</span>
                      {room.premium && <span className="aa-chip aa-chip--solid">精品</span>}
                    </p>
                    <p className="aa-room-meta">
                      <span>未開 <b>{fmtInt(room.unopenedSpins)}</b></span>
                      <span>RTP <b>{fmtRtp(room.todayRtp)}</b></span>
                      <span>下注 <b>{fmtInt(room.todayBet)}</b></span>
                    </p>
                  </div>
                  <div className="aa-room-score">
                    <span>綜合分數</span>
                    <strong>{room.score ?? '—'}</strong>
                  </div>
                </li>
              ))}
            </ol>
            {top.data.masked && (
              <div className="aa-unlock">
                <p>機台編號開通後顯示</p>
                <OpenPassButton me={me} className="aa-button" onClick={() => onNavigate('exchange')} />
              </div>
            )}
            </>
          ))}

        <p className="aa-disclaimer">數據攻略僅供參考</p>
      </section>

      {showAppInstall && (
        <a className="aa-app-install" href="/android/">
          <span>
            <strong>安裝 Android App</strong>
            <span>在 App 裡邊玩遊戲邊看助手</span>
          </span>
          <span aria-hidden="true">›</span>
        </a>
      )}
    </div>
  );
}

/**
 * 使用期限進度條：剩餘時間 ÷ 本次開通總長（startsAt → expiresAt）。
 * 剩餘時間直接用到期時間（expiresAt）計算，並以 serverTime 校正本機與伺服器的時間差；
 * 不依賴元件掛載時間（離開首頁再回來不會重算錯）。每 5 秒、切回畫面時更新，歸零時通知重新載入。
 */
function PassBar({ me, onExpired }: { me: AssistantMe; onExpired?: () => void }) {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const update = () => setTick(Date.now());
    const t = window.setInterval(update, 5_000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, []);

  const { startsAt, expiresAt, remainingSeconds } = me.pass;
  // 伺服器時間 ≈ 本機時間 + （收到回應時的 serverTime − 收到回應時的本機時間）
  const skew = me.receivedAt ? Date.parse(me.serverTime) - me.receivedAt : 0;
  const serverNow = tick + skew;
  const remaining = expiresAt
    ? Math.max(0, Math.floor((Date.parse(expiresAt) - serverNow) / 1000))
    : Math.max(0, remainingSeconds);

  // 歸零 → 重新載入會員資料（畫面切回未開通、需兌換）
  const expired = remaining <= 0;
  useEffect(() => {
    if (expired) onExpired?.();
  }, [expired, onExpired]);
  const total = startsAt && expiresAt ? (Date.parse(expiresAt) - Date.parse(startsAt)) / 1000 : remaining;
  const ratio = total > 0 ? Math.min(1, remaining / total) : 0;
  const pct = Math.round(ratio * 100);

  return (
    <div className={`aa-passbar${ratio <= 0.1 ? ' is-low' : ''}`}>
      <span
        className="aa-passbar-track"
        role="progressbar"
        aria-label="使用期限剩餘"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`剩 ${fmtRemainingDetail(remaining)}`}
      >
        <span className="aa-passbar-fill" style={{ width: `${Math.max(pct, remaining > 0 ? 2 : 0)}%` }} />
      </span>
      <span className="aa-passbar-text">剩 {fmtRemainingDetail(remaining)}</span>
    </div>
  );
}

function EntryTile({ icon, title, sub, disabled = false, onClick }: { icon: React.ReactNode; title: string; sub: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="aa-entry" disabled={disabled} onClick={onClick}>
      <span className="aa-entry-icon" aria-hidden="true">{icon}</span>
      <span className="aa-entry-copy">
        <span className="aa-entry-title aa-display">{title}</span>
        <span className="aa-entry-sub">{sub}</span>
      </span>
    </button>
  );
}

