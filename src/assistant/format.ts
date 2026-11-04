// 數據助手共用的數字與時間格式

const INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const CLOCK = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
const STAMP = new Intl.DateTimeFormat('zh-TW', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const fmtInt = (n: number | string | null | undefined) => {
  if (n === null || n === undefined || n === '') return '—';
  const v = typeof n === 'string' ? Number(n) : n;
  return Number.isFinite(v) ? INT.format(v) : '—';
};

export const fmtRtp = (s: string | null) => {
  if (s === null) return '—';
  const v = Number(s);
  return Number.isFinite(v) ? `${v.toFixed(1)}%` : '—';
};

export const fmtClock = (iso: string | null) => (iso ? CLOCK.format(new Date(iso)) : '—');
export const fmtStamp = (iso: string | null) => (iso ? STAMP.format(new Date(iso)) : '—');

export function fmtAgo(iso: string | null, now = Date.now()) {
  if (!iso) return '';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86_400) return `${Math.floor(s / 3600)} 小時前`;
  return `${Math.floor(s / 86_400)} 天前`;
}

export function fmtRemaining(seconds: number) {
  if (seconds <= 0) return '已到期';
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d} 天`, h && `${h} 小時`, d === 0 && m > 0 && `${m} 分`].filter(Boolean).join(' ') || '不到 1 分';
}

/** 房號 → 25 款機台圖示之一（同一房號永遠同一張圖） */
export function slotIconFor(roomNo: string) {
  let h = 0;
  for (const ch of roomNo) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `/assets/assistant/slots/${String((h % 25) + 1).padStart(2, '0')}.webp`;
}
