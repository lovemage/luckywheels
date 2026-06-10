import { api } from './client.js';
import type { Site } from './me.js';

export type AccountType = 'pending' | 'verified' | 'test' | 'blacklisted';

export interface SuperUserRow {
  id: string;
  nickname: string | null;
  displayName: string;
  pictureUrl: string | null;
  lineUserId: string;
  entertainmentMemberCode: string | null;
  accountType: AccountType;
  points: number;
  lifetimeDrawCount: number;
  blacklistedAt: string | null;
  createdAt: string;
  site: Site;
  siteLabel: string;
}

export interface UsersListResponse {
  items: SuperUserRow[];
  cursors: Record<Site, string | null>;
}

export interface UsersListQuery {
  tab?: 'verified' | 'test' | 'pending';
  q?: string;
  take?: number;
  site?: Site;
  cursorA?: string;
  cursorB?: string;
}

export function fetchUsers(query: UsersListQuery): Promise<UsersListResponse> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') params.set(k, String(v));
  }
  return api(`/api/superadmin/users?${params.toString()}`);
}

export interface SuperUserDetail extends SuperUserRow {
  testSkipCost: boolean;
  testForcePrizeId: string | null;
  testForcePrizeIds?: string[] | null;
  testForcePrizeMode?: 'random' | 'cycle' | null;
  blacklistReason: string | null;
  blacklistedByAdminUserId: string | null;
  entertainmentCodeBoundAt: string | null;
}

export interface CrossSiteMatch {
  id: string;
  nickname: string | null;
  displayName: string;
  accountType: AccountType;
  createdAt: string;
}

export interface UserDetailResponse {
  user: SuperUserDetail;
  crossSite: {
    otherSite: Site;
    otherSiteLabel: string;
    sameLineUser: (CrossSiteMatch & { entertainmentMemberCode: string | null }) | null;
    sameEntertainmentCode: (CrossSiteMatch & { lineUserId: string }) | null;
  };
}

export function fetchUser(site: Site, id: string): Promise<UserDetailResponse> {
  return api(`/api/superadmin/users/${site}/${id}`);
}

export function approveUser(site: Site, id: string): Promise<{ ok: true }> {
  return api(`/api/superadmin/users/${site}/${id}/approve`, { method: 'PATCH' });
}

export function deleteUser(site: Site, id: string): Promise<{ ok: true }> {
  return api(`/api/superadmin/users/${site}/${id}`, { method: 'DELETE' });
}

export interface MigrateResult {
  ok: true;
  toSite: Site;
  toUserId: string;
  points: number;
}

// Move a member (and their points) to the OTHER site; deletes the source.
export function migrateMember(site: Site, id: string): Promise<MigrateResult> {
  return api(`/api/superadmin/users/${site}/${id}/migrate`, { method: 'POST' });
}

export function adjustPoints(site: Site, id: string, body: { delta: number; reason?: string }): Promise<{ points: number }> {
  return api(`/api/superadmin/users/${site}/${id}/points`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function setAccountType(site: Site, id: string, accountType: 'verified' | 'test'): Promise<{ ok: true }> {
  return api(`/api/superadmin/users/${site}/${id}/account-type`, {
    method: 'PATCH',
    body: JSON.stringify({ accountType }),
  });
}

export function setBlacklist(site: Site, id: string, body: { blacklist: boolean; reason?: string; restoreTo?: 'verified' | 'test' }): Promise<{ ok: true }> {
  return api(`/api/superadmin/users/${site}/${id}/blacklist`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function setEntertainmentCode(site: Site, id: string, body: { code: string | null; reason: string }): Promise<{ ok: true }> {
  return api(`/api/superadmin/users/${site}/${id}/entertainment-code`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function updateTestSettings(
  site: Site,
  id: string,
  body: {
    testSkipCost?: boolean;
    testForcePrizeId?: string | null;
    testForcePrizeIds?: string[];
    testForcePrizeMode?: 'random' | 'cycle';
  },
): Promise<{ ok: true }> {
  return api(`/api/superadmin/users/${site}/${id}/test-settings`, {
    method: 'PATCH',
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

export function fetchPointsHistory(site: Site, id: string): Promise<{ items: PointsHistoryItem[] }> {
  return api(`/api/superadmin/users/${site}/${id}/points-history`);
}

export interface DrawHistoryItem {
  redemption: {
    id: string;
    code: string;
    tier: 'single' | 'multi';
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

export function fetchDrawHistory(site: Site, id: string): Promise<{ items: DrawHistoryItem[]; nextCursor: string | null }> {
  return api(`/api/superadmin/users/${site}/${id}/draw-history`);
}
