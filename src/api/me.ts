import { api } from './client.js';
import type { MeProfile } from '../state/session.js';

export function fetchMe(): Promise<MeProfile> {
  return api<MeProfile>('/api/me');
}

export function submitOnboarding(body: { nickname: string; code: string }): Promise<{ nickname: string; entertainmentMemberCode: string }> {
  return api('/api/onboarding/profile', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function logout(): Promise<void> {
  return api('/api/logout', { method: 'POST' });
}
