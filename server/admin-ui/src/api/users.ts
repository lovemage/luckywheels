import { api } from './client.js';

export interface AdminUserRow {
  id: string;
  nickname: string | null;
  displayName: string;
  pictureUrl: string | null;
  lineUserId: string;
  entertainmentMemberCode: string | null;
  accountType: 'pending' | 'verified' | 'test' | 'blacklisted';
  points: number;
  lifetimeDrawCount: number;
  blacklistedAt: string | null;
  createdAt: string;
}

export interface UsersListResponse {
  items: AdminUserRow[];
  nextCursor: string | null;
}

export interface UsersListQuery {
  tab?: 'verified' | 'test' | 'pending';
  q?: string;
  take?: number;
  cursor?: string;
}

export function fetchUsers(q: UsersListQuery): Promise<UsersListResponse> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined) params.set(k, String(v));
  }
  return api(`/api/admin/users?${params.toString()}`);
}

export interface AdminUserDetail extends AdminUserRow {
  testSkipCost: boolean;
  testForcePrizeId: string | null;
  testForcePrizeIds?: string[] | null;
  testForcePrizeMode?: TestForcePrizeMode | null;
  blacklistReason: string | null;
  blacklistedByAdminUserId: string | null;
  entertainmentCodeBoundAt: string | null;
}

export function fetchUser(id: string): Promise<AdminUserDetail> {
  return api(`/api/admin/users/${id}`);
}

export function deleteUser(id: string): Promise<{ ok: true }> {
  return api(`/api/admin/users/${id}`, {
    method: 'DELETE',
  });
}

export function adjustPoints(id: string, body: { delta: number; reason?: string }): Promise<{ points: number }> {
  return api(`/api/admin/users/${id}/points`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export interface PointsHistoryItem {
  id: string;
  delta: number;
  before: number | null;
  after: number | null;
  reason: string | null;
  adminUser: { id: string; email: string } | null;
  createdAt: string;
}

export function fetchPointsHistory(
  id: string,
  query: { take?: number; cursor?: string } = {},
): Promise<{ items: PointsHistoryItem[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return api(`/api/admin/users/${id}/points-history?${params.toString()}`);
}

export function setAccountType(id: string, accountType: 'verified' | 'test'): Promise<{ ok: true }> {
  return api(`/api/admin/users/${id}/account-type`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountType }),
  });
}

export function approveUser(id: string): Promise<{ ok: true }> {
  return api(`/api/admin/users/${id}/approve`, {
    method: 'PATCH',
  });
}

export type TestForcePrizeMode = 'random' | 'cycle';

export function updateTestSettings(
  id: string,
  body: {
    testSkipCost?: boolean;
    testForcePrizeId?: string | null;
    testForcePrizeIds?: string[];
    testForcePrizeMode?: TestForcePrizeMode;
  },
) {
  return api<{ ok: true }>(`/api/admin/users/${id}/test-settings`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function setBlacklist(id: string, body: { blacklist: boolean; reason?: string; restoreTo?: 'verified' | 'test' }) {
  return api<{ ok: true }>(`/api/admin/users/${id}/blacklist`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function setEntertainmentCode(id: string, body: { code: string | null; reason: string }) {
  return api<{ ok: true }>(`/api/admin/users/${id}/entertainment-code`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export interface DrawHistoryItem {
  redemption: {
    id: string;
    code: string;
    tier: 'single' | 'multi';
    tierDraws: number;
    status: string;
    createdAt: string;
    statusChangedAt: string | null;
  };
  draws: {
    id: string;
    subIndex: number;
    prize: { id: string; name: string };
    pointsBefore: number;
    pointsAfter: number;
    winningCashAmount: number;
    createdAt: string;
    isTest: boolean;
    gatedBy: string | null;
  }[];
}

export function fetchDrawHistory(
  id: string,
  query: { take?: number; cursor?: string } = {},
): Promise<{ items: DrawHistoryItem[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return api(`/api/admin/users/${id}/draw-history?${params.toString()}`);
}
