import { api } from './client.js';
import type { Site } from './me.js';

export interface Metric { A: number; B: number; total: number; }

export interface StatsBucket {
  key: string;
  label: string;
  draws: Metric;        // 抽獎次數 (DrawLog rows — 10連抽 counts as 10)
  delivered: Metric;    // 中獎金額(已派送)
  newMembers: Metric;   // 新增會員
}

export interface StatsResponse {
  period: 'week' | 'month';
  sites: { site: Site; label: string }[];
  totals: { members: Metric };
  buckets: StatsBucket[];
}

export function fetchStats(period: 'week' | 'month'): Promise<StatsResponse> {
  return api(`/api/superadmin/stats?period=${period}`);
}
