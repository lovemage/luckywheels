import { useEffect, useState } from 'react';
import { ChevronRight, Coins, Hourglass, Search } from 'lucide-react';
import { ApiError } from '../../api/client.js';
import { fetchTopRooms, type AssistantMe, type RoomsResponse } from '../../api/assistant.js';
import { LightPillars } from '../LightPillars.js';
import { COLLECT_INTRO_MS, CollectingLoader } from '../CollectingLoader.js';
import { fmtAgo, fmtClock, fmtInt, fmtRemaining, fmtRtp, fmtStamp, slotIconFor } from '../format.js';
import type { AssistantView } from '../AssistantApp.js';

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
}: {
  me: AssistantMe | null;
  nickname: string;
  onNavigate: (view: AssistantView, anchor?: string) => void;
}) {
  const active = me?.pass.active ?? false;
  const [top, setTop] = useState<TopState>({ kind: 'loading' });
  const [now, setNow] = useState(() => Date.now());
  // 進入首頁先跑約 2.5 秒「數據助手採集中」動畫，結束後才顯示排行（資料同時在背景抓取）
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => setIntroDone(true), COLLECT_INTRO_MS);
    return () => window.clearTimeout(t);
  }, [active]);

  useEffect(() => {
    if (!me) return;
    if (!active) {
      setTop({ kind: 'locked' });
      return;
    }
    let alive = true;
    const load = () =>
      fetchTopRooms(5)
        .then((data) => alive && setTop({ kind: 'ready', data }))
        .catch((e: unknown) => {
          if (!alive) return;
          setTop(e instanceof ApiError && e.code === 'ASSISTANT_EXPIRED' ? { kind: 'locked' } : { kind: 'error' });
        });
    void load();
    // 採集每數分鐘一輪；首頁停留時每分鐘重抓，並更新「幾秒前」
    const refresh = window.setInterval(load, 60_000);
    const tick = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      alive = false;
      window.clearInterval(refresh);
      window.clearInterval(tick);
    };
  }, [me, active]);

  const collecting = active && (!introDone || top.kind === 'loading');
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
        <LightPillars />
        <div className="aa-hero-copy">
          <h1 id="aa-hero-title" className="aa-display">
            機台數據<span className="aa-hero-gap" /> 一眼看清
          </h1>
          <p className="aa-hero-sub">ATG 房間整理 · 本金條件篩選</p>
          {me && (
            active ? (
              <button type="button" className="aa-cta" onClick={() => onNavigate('recommend')}>
                輸入本金找機台 <ChevronRight aria-hidden="true" />
              </button>
            ) : (
              <button type="button" className="aa-cta" onClick={() => onNavigate('exchange')}>
                用積分開通 <ChevronRight aria-hidden="true" />
              </button>
            )
          )}
          <p className="aa-hero-pass">
            {!me ? ' ' : active ? `使用中 · 剩 ${fmtRemaining(me.pass.remainingSeconds)}` : `目前積分 ${fmtInt(me.points)}`}
          </p>
        </div>
      </section>

      <nav className="aa-entries" aria-label="功能入口">
        <EntryTile icon={<Search />} title="精選空台" sub="即時空台排行" onClick={() => document.getElementById('aa-top')?.scrollIntoView({ behavior: 'smooth' })} />
        <EntryTile icon={<Coins />} title="本金推薦" sub="依本金篩選" onClick={() => onNavigate('recommend')} />
        <EntryTile icon={<Hourglass />} title="積分兌換" sub="開通・延長時間" onClick={() => onNavigate('exchange')} />
        <EntryTile icon={<SlotIcon />} title="兌換紀錄" sub="開通與到期" onClick={() => onNavigate('exchange', 'aa-history')} />
      </nav>

      <section className="aa-top" id="aa-top" aria-labelledby="aa-top-title">
        <div className="aa-section-head">
          <h2 id="aa-top-title" className="aa-display">精選空台 TOP 5</h2>
          {game && <span className="aa-section-note">{game.name}</span>}
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
            <button type="button" className="aa-button" onClick={() => onNavigate('exchange')}>
              用積分開通
            </button>
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
              <p>{top.data.game.stale ? '採集暫停中，恢復更新後會顯示空台排行。' : '目前沒有空台，稍後再來看看。'}</p>
            </div>
          ) : (
            <ol className="aa-rooms is-reveal">
              {top.data.items.map((room, i) => (
                <li key={room.id} className="aa-room" style={{ '--i': i } as React.CSSProperties}>
                  <span className="aa-room-rank" aria-label={`第 ${i + 1} 名`}>{RANK[i]}</span>
                  <img className="aa-room-icon" src={slotIconFor(room.roomNo)} alt="" width="56" height="56" loading="lazy" />
                  <div className="aa-room-main">
                    <p className="aa-room-title">
                      <span className="aa-room-no">#{room.roomNo}</span>
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
          ))}

        <p className="aa-disclaimer">數據僅供參考，不保證獲利</p>
      </section>
    </div>
  );
}

function EntryTile({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" className="aa-entry" onClick={onClick}>
      <span className="aa-entry-icon" aria-hidden="true">{icon}</span>
      <span className="aa-entry-copy">
        <span className="aa-entry-title aa-display">{title}</span>
        <span className="aa-entry-sub">{sub}</span>
      </span>
    </button>
  );
}

function SlotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
      <rect x="3" y="5" width="15" height="15" rx="2" />
      <path d="M6.5 9h8M6.5 9v7M10.5 9v7M14.5 9v7M6.5 16h8" />
      <path d="M18 9h1.5a1 1 0 0 1 1 1v2M20.5 12V8" />
      <circle cx="20.5" cy="6.6" r="1.3" />
    </svg>
  );
}
