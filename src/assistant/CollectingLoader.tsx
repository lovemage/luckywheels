import { useEffect, useMemo, useRef, useState } from 'react';

/** 精選空台載入動畫的最短顯示時間 */
export const COLLECT_INTRO_MS = 2500;

const STEPS = [
  '連線 ATG 採集節點',
  '正在採集房間資料',
  '搜尋空台中',
  '讀取最新參數',
  '對照今日 RTP 與下注量',
  '比對未開轉數',
  '計算綜合分數',
  '排序精選 TOP 5',
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

/** 「數據助手採集中」載入面板：逐行跑出採集步驟、進度百分比、背景資料流與金色掃描光 */
export function CollectingLoader() {
  const stream = useMemo(() => Array.from({ length: STREAM_ROWS }, streamLine), []);
  const [pct, setPct] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / COLLECT_INTRO_MS);
      // ease-out，前段跑快、後段收慢，貼近「採集→整理」的節奏
      setPct(Math.round((1 - Math.pow(1 - p, 2.2)) * 100));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const stepGap = COLLECT_INTRO_MS / STEPS.length;

  return (
    <div className="aa-collect" role="status" aria-live="polite" aria-label="數據助手正在採集空台資料">
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
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={i === STEPS.length - 1 ? 'is-last' : undefined}
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
