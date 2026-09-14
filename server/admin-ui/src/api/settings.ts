import { api } from './client.js';

export interface AdminSettings {
  pointThresholds: { points: number; draws: number }[];
  spinDurationMs: number;
  minDrawsBeforeWin: number;
  cooldownDrawsAfterWin: number;
  pendingApprovalAlertEnabled: boolean;
  costControlEnabled: boolean;
  costControlInterval: number;
  rulesText: string;
  winTitleText: string;
  winRedemptionText: string;
  homeLogoUrl: string;
  homeBackgroundUrl: string;
  totals: { drawCount: number; payoutAmount: number; pointsBurned: number };
  lowestCostPrize: { id: string; rankLabel: string; name: string; cashAmount: number } | null;
  consolationPrizeId: string;
}

export type SettingsUpdate = Partial<
  Pick<
    AdminSettings,
    | 'pointThresholds'
    | 'spinDurationMs'
    | 'minDrawsBeforeWin'
    | 'cooldownDrawsAfterWin'
    | 'pendingApprovalAlertEnabled'
    | 'costControlEnabled'
    | 'costControlInterval'
    | 'rulesText'
    | 'winTitleText'
    | 'winRedemptionText'
    | 'homeLogoUrl'
    | 'homeBackgroundUrl'
  >
>;

export function fetchSettings(): Promise<AdminSettings> {
  return api('/api/admin/settings');
}
export function updateSettings(body: SettingsUpdate): Promise<AdminSettings> {
  return api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(body) });
}
