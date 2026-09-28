import type { CSSProperties } from 'react';

// Shared verbatim between luckywheels and luckywheels-juxin — keep in sync.
// Deterministic spreads (no Math.random) so re-renders don't reshuffle pieces.
const COINS = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
  const distance = 110 + (i % 4) * 34;
  return {
    '--tx': `${Math.round(Math.cos(angle) * distance)}px`,
    '--ty': `${Math.round(Math.sin(angle) * distance * 0.8 - 70)}px`,
    '--rot': `${(i % 2 ? 1 : -1) * (240 + i * 25)}deg`,
    '--delay': `${(i % 5) * 0.04}s`,
    '--size': `${18 + (i % 3) * 5}px`,
  } as CSSProperties;
});

const CONFETTI_COLORS = ['#ffd84a', '#fff1b0', '#e04fb6', '#b36bff', '#ffffff', '#f5a623'];
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  '--x': `${(i * 37 + 5) % 100}%`,
  '--c': CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  '--sway': `${(i % 2 ? 1 : -1) * (18 + (i % 5) * 10)}px`,
  '--delay': `${0.25 + (i % 9) * 0.22}s`,
  '--duration': `${2.8 + (i % 4) * 0.45}s`,
}) as CSSProperties);

export function WinCelebration() {
  return (
    <>
      <div className="win-fx" aria-hidden="true">
        <div className="win-fx-rays" />
        <div className="win-fx-flash" />
        <div className="win-fx-ring" />
        <div className="win-fx-ring win-fx-ring--late" />
      </div>
      {/* Coins and confetti fly over the panel; pointer-events stay off. */}
      <div className="win-fx win-fx--front" aria-hidden="true">
        {COINS.map((style, i) => <i key={`coin-${i}`} className="win-fx-coin" style={style} />)}
        {CONFETTI.map((style, i) => <i key={`confetti-${i}`} className="win-fx-confetti" style={style} />)}
      </div>
    </>
  );
}
