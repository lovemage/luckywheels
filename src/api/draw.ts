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

export function postDraw(tier: 'single' | 'multi'): Promise<DrawResponse> {
  return api('/api/draw', {
    method: 'POST',
    body: JSON.stringify({ tier }),
  });
}
