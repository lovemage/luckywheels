// 把遊戲場景樹讀到的文字轉成結構化資料。純函式，不碰瀏覽器，方便單元測試。
// 節點名稱來源：docs/plans/2026-11-02-atg-recon-report.md 第 8.5 節。

export type RoomStatus = 'idle' | 'busy' | 'locked';

/** 列表層一台機台（SlotTableItem2 節點）的原始文字 */
export interface RawListItem {
  roomNo: string | null;
  rate: string | null;
  roomId: string | null;
  icon: string | null;
}

export interface ListRoom {
  roomNo: string;
  sourceRoomId: string;
  status: RoomStatus;
  /** 百分比字串，保留兩位小數，例 "114.44" */
  todayRtp: string;
}

/** 細項面板內的一個文字節點（path 相對於面板根節點） */
export interface RawLabel {
  path: string;
  text: string;
}

export interface RoomDetail {
  roomNo: string;
  unopenedSpins: number | null;
  prev1Spins: number | null;
  prev2Spins: number | null;
  todayBet: string | null;
  thirtyDayBet: string | null;
  todayRtp: string | null;
  thirtyDayRtp: string | null;
}

const ICON_STATUS: Record<string, RoomStatus> = {
  machinel_icon: 'idle',
  other_icon: 'busy',
  otherLock_icon: 'locked',
};

export function statusFromIcon(icon: string | null): RoomStatus | null {
  return icon ? ICON_STATUS[icon] ?? null : null;
}

// 金額與百分比全程以字串處理（不經 Number），近 30 天下注額可能超過 2^53，轉浮點會失真。
// 小數補足或截斷到兩位（畫面本身就是兩位小數，不做四捨五入）。
function toFixed2(digits: string): string | null {
  const m = digits.match(/^(-?)(\d+)(?:\.(\d*))?$/);
  if (!m) return null;
  const int = m[2]!.replace(/^0+(?=\d)/, '');
  return `${m[1]}${int}.${(m[3] ?? '').padEnd(2, '0').slice(0, 2)}`;
}

/** "114.44%" → "114.44"、"1,379.58%" → "1379.58"；無法解析回 null */
export function parsePercent(text: string | null | undefined): string | null {
  const m = text?.replace(/[\s,]/g, '').match(/^(.+)%$/);
  return m ? toFixed2(m[1]!) : null;
}

/** "279,185.00" → "279185.00"；無法解析回 null */
export function parseAmount(text: string | null | undefined): string | null {
  const cleaned = text?.replace(/[\s,]/g, '');
  return cleaned ? toFixed2(cleaned) : null;
}

/** 取文字中第一個整數，例 "未開 222 轉" → 222 */
export function parseFirstInt(text: string | null | undefined): number | null {
  const m = text?.match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

/** 列表層：缺欄位或無法辨識狀態的項目回報在 skipped，不靜默丟棄 */
export function parseListItems(items: RawListItem[]): { rooms: ListRoom[]; skipped: RawListItem[] } {
  const rooms: ListRoom[] = [];
  const skipped: RawListItem[] = [];
  for (const item of items) {
    const roomNo = item.roomNo?.trim();
    const sourceRoomId = item.roomId?.trim();
    const status = statusFromIcon(item.icon);
    const todayRtp = parsePercent(item.rate);
    if (roomNo && sourceRoomId && status && todayRtp !== null) {
      rooms.push({ roomNo, sourceRoomId, status, todayRtp });
    } else {
      skipped.push(item);
    }
  }
  return { rooms, skipped };
}

/** 分頁 n 的機台號範圍：(n−1)×500+1 ～ n×500 */
export function pageOfRoomNo(roomNo: string, pageSize = 500): number {
  return Math.floor((Number(roomNo) - 1) / pageSize) + 1;
}

const byPath = (labels: RawLabel[], suffix: string) => labels.find((l) => l.path.endsWith(suffix))?.text;

/**
 * 細項面板。已知節點（2026-11-02 實測）：slotTableNumber、notOpenContent/number、
 * previousOneContent/number、previousTwoContent/number、scoreCol|rateCol 的 hourMask/hour（今日）與
 * dayMask/day（近 30 天）。前一／前二另以文字「前一」「前二」附近的數字作為備援，防節點改名。
 */
export function parseDetail(labels: RawLabel[]): RoomDetail | null {
  const roomNo = byPath(labels, 'slotTableNumber')?.trim();
  if (!roomNo) return null;
  return {
    roomNo,
    unopenedSpins: parseFirstInt(byPath(labels, 'notOpenContent/number')),
    prev1Spins: parseFirstInt(byPath(labels, 'previousOneContent/number')) ?? findPrevSpins(labels, '前一'),
    prev2Spins: parseFirstInt(byPath(labels, 'previousTwoContent/number')) ?? findPrevSpins(labels, '前二'),
    todayBet: parseAmount(byPath(labels, 'scoreCol/hourMask/hour')),
    thirtyDayBet: parseAmount(byPath(labels, 'scoreCol/dayMask/day')),
    todayRtp: parsePercent(byPath(labels, 'rateCol/hourMask/hour')),
    thirtyDayRtp: parsePercent(byPath(labels, 'rateCol/dayMask/day')),
  };
}

// 「前一 17 轉開」可能是一個節點，也可能拆成「前一」「17」「轉開」三個兄弟節點。
function findPrevSpins(labels: RawLabel[], keyword: string): number | null {
  const idx = labels.findIndex((l) => l.text.includes(keyword));
  if (idx < 0) return null;
  const inline = parseFirstInt(labels[idx]!.text.replace(keyword, ''));
  if (inline !== null) return inline;
  const parent = labels[idx]!.path.split('/').slice(0, -1).join('/');
  const sibling = labels.find((l, i) => i !== idx && l.path.startsWith(parent + '/') && /^\d+$/.test(l.text.trim()));
  return sibling ? Number(sibling.text.trim()) : null;
}
