import { useMemo } from 'react';

// 主視覺：地平線上升起的金色光柱（設計稿 comp-4／Midjourney A_0「金色光柱＋大量留白」）。
// 以固定種子產生線段，每次渲染一致；兩側高、中央低，留出標題的位置。

const W = 400;
const H = 240;
const HORIZON = 188;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

interface Pillar {
  x: number;
  top: number;
  width: number;
  opacity: number;
  spark: boolean;
}

function buildPillars(): Pillar[] {
  const r = rng(0xc0ffee);
  const out: Pillar[] = [];
  for (let i = 0; i < 74; i++) {
    const x = 4 + r() * (W - 8);
    // 與中心的距離 0（中央）→ 1（邊緣）；中央的柱子壓低，給標題留白
    const edge = Math.abs(x - W / 2) / (W / 2);
    const reach = 0.32 + 0.68 * Math.pow(edge, 1.1);
    const height = (HORIZON - 14) * reach * (0.45 + r() * 0.55);
    out.push({
      x,
      top: HORIZON - height,
      width: r() < 0.18 ? 1.6 : 0.7 + r() * 0.5,
      opacity: 0.35 + r() * 0.6,
      spark: r() < 0.22,
    });
  }
  return out;
}

interface Streak {
  x: number;
  rise: number;
  len: number;
  width: number;
  dur: number;
  delay: number;
}

// 由下往上流動的細光線：沿著部分光柱從地平線升到柱頂後淡出
function buildStreaks(pillars: Pillar[]): Streak[] {
  const r = rng(0x5eed);
  const out: Streak[] = [];
  for (let i = 0; i < 30; i++) {
    const p = pillars[Math.floor(r() * pillars.length)];
    const rise = HORIZON - p.top;
    if (rise < 40) continue;
    const dur = 1.8 + r() * 2.4;
    out.push({
      x: p.x,
      rise,
      len: 18 + r() * 30,
      width: 0.9 + r() * 0.7,
      dur,
      delay: -r() * dur, // 負延遲：一進場就分散在各個高度
    });
  }
  return out;
}

export function LightPillars() {
  const pillars = useMemo(buildPillars, []);
  const streaks = useMemo(() => buildStreaks(pillars), [pillars]);
  return (
    <svg className="aa-pillars" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="aa-pillar" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffe3a0" />
          <stop offset="0.55" stopColor="#d9a441" stopOpacity="0.7" />
          <stop offset="1" stopColor="#8a5a14" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="aa-reflect" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4c56a" stopOpacity="0.45" />
          <stop offset="1" stopColor="#f4c56a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="aa-horizon" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd98a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="aa-streak" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffd98a" stopOpacity="0" />
          <stop offset="0.75" stopColor="#ffe9b8" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fffaf0" />
        </linearGradient>
        <filter id="aa-streak-glow" x="-300%" y="-20%" width="700%" height="140%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="aa-glow" x="-50%" y="-10%" width="200%" height="120%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      <ellipse cx={W / 2} cy={HORIZON} rx={W * 0.62} ry="16" fill="url(#aa-horizon)" />

      <g className="aa-pillars-rise">
        <g filter="url(#aa-glow)" opacity="0.6">
          {pillars.map((p, i) => (
            <rect key={i} x={p.x - p.width} y={p.top} width={p.width * 2} height={HORIZON - p.top} fill="url(#aa-pillar)" opacity={p.opacity * 0.6} />
          ))}
        </g>
        {pillars.map((p, i) => (
          <rect key={i} x={p.x - p.width / 2} y={p.top} width={p.width} height={HORIZON - p.top} fill="url(#aa-pillar)" opacity={p.opacity} />
        ))}
        {pillars
          .filter((p) => p.spark)
          .map((p, i) => (
            <circle key={i} cx={p.x} cy={p.top} r="1.1" fill="#fff1c9" opacity={p.opacity} />
          ))}
      </g>

      <g className="aa-streaks" filter="url(#aa-streak-glow)">
        {streaks.map((st, i) => (
          <rect
            key={i}
            className="aa-streak"
            x={st.x - st.width / 2}
            y={HORIZON - st.len}
            width={st.width}
            height={st.len}
            fill="url(#aa-streak)"
            style={{ '--rise': `${-st.rise}px`, animationDuration: `${st.dur}s`, animationDelay: `${st.delay}s` } as React.CSSProperties}
          />
        ))}
      </g>

      {/* 地面倒影 */}
      <g opacity="0.5">
        {pillars.map((p, i) => (
          <rect key={i} x={p.x - p.width / 2} y={HORIZON} width={p.width} height={Math.min(46, (HORIZON - p.top) * 0.35)} fill="url(#aa-reflect)" opacity={p.opacity} />
        ))}
      </g>
      <line x1="0" y1={HORIZON} x2={W} y2={HORIZON} stroke="#f2c165" strokeOpacity="0.55" strokeWidth="0.6" />
    </svg>
  );
}
