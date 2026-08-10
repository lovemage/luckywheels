import { api } from './client.js';

export interface PublicPrize {
  id: string;
  rankLabel: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  wheelPosition: number;
  segmentColor: string;
  textColor: string;
  cashAmount: number;
  isConsolation: boolean;
}

export interface PublicSettings {
  spinDurationMs: number;
  pointThresholds: { points: number; draws: number }[];
  rulesText: string;
  /** Admin-configurable home logo URL; empty string ⇒ use the bundled default. */
  homeLogoUrl: string;
  /** Admin-configurable home background URL; empty string ⇒ use the bundled default. */
  homeBackgroundUrl: string;
}

export function fetchPrizes(): Promise<{ items: PublicPrize[] }> {
  return api('/api/prizes/public');
}

export function fetchSettings(): Promise<PublicSettings> {
  return api('/api/settings/public');
}

export interface DrawResponse {
  redemption: { id: string; code: string; status: string; totalWinAmount: number };
  draws: {
    drawLogId: string;
    subIndex: number;
    prize: { id: string; rankLabel: string; name: string; description: string | null; imageUrl: string | null; wheelPosition: number };
    winningCashAmount: number;
    gatedBy: string | null;
  }[];
  points: number;
  tier: 'single' | 'multi';
  tierDraws: number;
  isTest: boolean;
}

export function postDraw(draws: number): Promise<DrawResponse> {
  return api('/api/draw', {
    method: 'POST',
    body: JSON.stringify({ draws }),
  });
}

export interface WinHistoryEntry {
  id: string;
  code: string;
  totalWinAmount: number;
  status: 'pending' | 'delivered' | 'cancelled' | string;
  createdAt: string;
  draws: {
    subIndex: number;
    rankLabel: string;
    prizeName: string;
    winningCashAmount: number;
  }[];
}

export function fetchWinHistory(
  query: { take?: number; cursor?: string } = {},
): Promise<{ items: WinHistoryEntry[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return api(`/api/me/redemptions?${params.toString()}`);
}
