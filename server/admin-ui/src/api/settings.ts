import { api } from './client.js';

export interface AdminSettings {
  pointThresholds: { points: number; draws: number }[];
  spinDurationMs: number;
  minDrawsBeforeWin: number;
  cooldownDrawsAfterWin: number;
  payoutCapEnabled: boolean;
  payoutCapRatio: number;
  totals: { drawCount: number; payoutAmount: number; pointsBurned: number };
  consolationPrizeId: string;
}

export type SettingsUpdate = Partial<
  Pick<
    AdminSettings,
    | 'pointThresholds'
    | 'spinDurationMs'
    | 'minDrawsBeforeWin'
    | 'cooldownDrawsAfterWin'
    | 'payoutCapEnabled'
    | 'payoutCapRatio'
  >
>;

export function fetchSettings(): Promise<AdminSettings> {
  return api('/api/admin/settings');
}
export function updateSettings(body: SettingsUpdate): Promise<AdminSettings> {
  return api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(body) });
}
