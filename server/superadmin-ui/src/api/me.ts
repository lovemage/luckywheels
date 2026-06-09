import { api } from './client.js';

export type Site = 'A' | 'B';

export interface SuperadminMe {
  id: string;
  account: string;
  email: string;
  role: string;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  controlSite: Site;
  sites: { site: Site; label: string }[];
}

export function fetchSuperadminMe(): Promise<SuperadminMe> {
  return api('/api/superadmin/me');
}

export function logout(): Promise<void> {
  return api('/api/superadmin/auth/logout', { method: 'POST' });
}
