import { useEffect, useMemo, useRef, useState } from 'react';

/** 精選空台載入動畫的最短顯示時間 */
export const COLLECT_INTRO_MS = 4500;

/** 精選空台用的預設步驟 */
export const TOP_ROOM_STEPS = [
  '連線 ATG 分析節點',
  '正在分析房間資料',
  '搜尋空台中',
  '讀取最新參數',
  '對照今日 RTP 與下注量',
  '比對未開轉數',
  '計算綜合分數',
  '排序精選 TOP 5',
];

/** 本金推薦用的步驟 */
export const RECOMMEND_STEPS = [
  '連線 ATG 分析節點',
  '讀取最新房間參數',
  '比對本金級距與門檻',
  '搜尋符合條件的空台',
  '對照今日 RTP 與未開轉數',
  '計算綜合分數',
  '避開近期熱門房間',
  '整理推薦機台',
];

const STREAM_ROWS = 18;
const TAGS = ['SCAN', 'SYNC', 'READ', 'MATCH', 'CALC', 'PASS'];

function streamLine(): string {
  const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
  const room = String(Math.floor(Math.random() * 9000) + 1000);
  const val = (Math.random() * 9.99).toFixed(2);
  const tag = TAGS[Math.floor(Math.random() * TAGS.length)];
  return `0x${hex} · R-${room} · ${val} · ${tag}`;
}

/** 「數據分析中」載入面板：逐行跑出分析步驟、進度百分比、背景資料流與金色掃描光 */
export function CollectingLoader({ steps = TOP_ROOM_STEPS, durationMs = COLLECT_INTRO_MS }: { steps?: string[]; durationMs?: number }) {
  const stream = useMemo(() => Array.from({ length: STREAM_ROWS }, streamLine), []);
  const [pct, setPct] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      // ease-out，前段跑快、後段收慢，貼近「分析→整理」的節奏
      setPct(Math.round((1 - Math.pow(1 - p, 2.2)) * 100));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [durationMs]);

  const stepGap = durationMs / steps.length;

  return (
    <div className="aa-collect" role="status" aria-live="polite" aria-label="數據助手正在分析空台資料">
      <div className="aa-collect-stream" aria-hidden="true">
        <div className="aa-collect-stream-track">
          {[...stream, ...stream].map((line, i) => (
            <span key={i}>{line}</span>
          ))}
        </div>
      </div>
      <span className="aa-collect-sweep" aria-hidden="true" />

      <div className="aa-collect-head">
        <span className="aa-collect-dot" aria-hidden="true" />
        <span className="aa-collect-title">數據助手運作中</span>
        <span className="aa-collect-pct">{pct}%</span>
      </div>

      <div className="aa-collect-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>

      <ol className="aa-collect-steps" aria-hidden="true">
        {steps.map((s, i) => (
          <li
            key={s}
            className={i === steps.length - 1 ? 'is-last' : undefined}
            style={{ '--d': `${Math.round(i * stepGap)}ms`, '--done': `${Math.round((i + 1) * stepGap)}ms` } as React.CSSProperties}
          >
            <span className="aa-collect-mark" />
            <span className="aa-collect-text">{s}</span>
            <span className="aa-collect-state" />
          </li>
        ))}
      </ol>
    </div>
  );
}
