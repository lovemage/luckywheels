import { useEffect, useState } from 'react';
import type { AssistantMe } from '../api/assistant.js';

// 使用期限倒數（時:分:秒；超過一天小時繼續累加，例：52:03:09）。助手頁頂部積分下方、App 駐守小卡標題列共用。
// 以到期時間計算，並用 serverTime 校正本機與伺服器的時間差（同 AssistantHome 的 PassBar）。

/** 秒數 → 「時:分:秒」 */
export function fmtHms(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

/** 目前剩餘秒數（每秒更新）；未開通回傳 null */
export function usePassRemaining(me: AssistantMe | null, onExpired?: () => void): number | null {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setTick(Date.now());
    const t = window.setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  const expiresAt = me?.pass.expiresAt ?? null;
  const skew = me?.receivedAt ? Date.parse(me.serverTime) - me.receivedAt : 0;
  const remaining = !me || !me.pass.active || !expiresAt ? null : Math.max(0, Math.floor((Date.parse(expiresAt) - (tick + skew)) / 1000));

  // 倒數歸零 → 讓上層重新載入會員資料（切回未開通）
  const expired = remaining === 0;
  useEffect(() => {
    if (expired) onExpired?.();
  }, [expired, onExpired]);
  return remaining;
}

export function PassClock({ me, className, onExpired }: { me: AssistantMe | null; className?: string; onExpired?: () => void }) {
  const remaining = usePassRemaining(me, onExpired);
  if (!me) return null;
  const text = remaining === null ? (me.pass.expiresAt ? '已到期' : '未開通') : fmtHms(remaining);
  return (
    <span
      className={`aa-passclock${remaining !== null && remaining < 3600 ? ' is-low' : ''}${className ? ` ${className}` : ''}`}
      role="timer"
      aria-label={remaining === null ? `剩餘時間：${text}` : `剩餘時間 ${fmtHms(remaining).replace(/^(\d+):(\d+):(\d+)$/, '$1 時 $2 分 $3 秒')}`}
    >
      <span className="aa-passclock-label">剩餘</span>
      <span className="aa-passclock-time">{text}</span>
    </span>
  );
}
