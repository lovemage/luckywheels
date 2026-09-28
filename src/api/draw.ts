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
  winTitleText: string;
  winRedemptionText: string;
  /** Admin-configurable home logo URL; empty string ⇒ use the bundled default. */
  homeLogoUrl: string;
  /** Admin-configurable home background URL; empty string ⇒ use the bundled default. */
  homeBackgroundUrl: string;
  /** Admin toggle: bottom win ticker. Absent on older servers ⇒ treated as on. */
  /** Admin-managed entry ad; an empty image URL falls back to the bundled default creative. */
  adPopupEnabled?: boolean;
  adPopupImageUrl?: string;
  adPopupLinkUrl?: string;
  winTickerEnabled?: boolean;
  /** Admin toggle: tab bar collapses behind an up-arrow handle. Absent ⇒ on. */
  bottomNavCollapsible?: boolean;
}

export function fetchPrizes(): Promise<{ items: PublicPrize[] }> {
  return api('/api/prizes/public');
}

let publicSettingsRequest: Promise<PublicSettings> | null = null;

export function fetchSettings(): Promise<PublicSettings> {
  // App and MainApp can mount close together. Share the in-flight/resulting
  // request so one page load never downloads the same public settings twice.
  if (!publicSettingsRequest) {
    publicSettingsRequest = api<PublicSettings>('/api/settings/public').catch((error) => {
      publicSettingsRequest = null;
      throw error;
    });
  }
  return publicSettingsRequest;
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

export interface RecentWinner {
  id: string;
  maskedId: string;
  rankLabel: string;
  amount: number;
}

export function fetchRecentWinners(): Promise<{ items: RecentWinner[] }> {
  return api('/api/winners/recent');
}
