import type { ReactNode } from 'react';
import { ChevronUp, Trophy } from 'lucide-react';
import type { RecentWinner } from '../api/draw.js';

// Shared verbatim between luckywheels and luckywheels-juxin — keep in sync.

const MIN_TRACK_ITEMS = 8;
const SECONDS_PER_ITEM = 2;

function WinTicker({ items }: { items: RecentWinner[] }) {
  // Pad short lists so one pass is wider than the strip, then render the pass twice
  // so a -50% translate loops seamlessly.
  const pass: RecentWinner[] = [];
  while (pass.length < MIN_TRACK_ITEMS) pass.push(...items);
  const duration = `${pass.length * SECONDS_PER_ITEM}s`;

  return (
    <div className="win-ticker" role="marquee" aria-label="最新中獎">
      <span className="win-ticker-badge">
        <i aria-hidden="true" />
        WIN
      </span>
      <div className="win-ticker-viewport">
        <div className="win-ticker-track" style={{ animationDuration: duration }}>
          {[0, 1].map((copy) =>
            pass.map((item, index) => (
              <span className="win-ticker-item" key={`${copy}-${index}-${item.id}`} aria-hidden={copy === 1}>
                <Trophy aria-hidden="true" />
                <b>{item.maskedId}</b>
                <span>抽中{item.rankLabel}</span>
                <strong>NT$ {item.amount.toLocaleString('zh-TW')}</strong>
              </span>
            )),
          )}
        </div>
      </div>
    </div>
  );
}

export function BottomDock({
  collapsible,
  open,
  onToggle,
  winners,
  children,
}: {
  collapsible: boolean;
  open: boolean;
  onToggle: () => void;
  winners: RecentWinner[];
  /** The tab bar; rendered only while the dock is expanded (or always when not collapsible). */
  children: ReactNode;
}) {
  const navVisible = !collapsible || open;
  const tickerVisible = winners.length > 0 && !(collapsible && open);

  return (
    <footer className={`bottom-dock${collapsible ? ' is-collapsible' : ''}${navVisible ? ' is-open' : ''}`}>
      {collapsible && (
        <button
          type="button"
          className="dock-handle"
          aria-expanded={open}
          aria-controls="bottom-tabs"
          aria-label={open ? '收起選單' : '展開選單'}
          onClick={onToggle}
        >
          <ChevronUp aria-hidden="true" />
        </button>
      )}
      {tickerVisible && <WinTicker items={winners} />}
      {navVisible && children}
    </footer>
  );
}
