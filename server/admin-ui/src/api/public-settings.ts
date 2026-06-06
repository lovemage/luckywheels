import { api } from './client.js';

export interface PublicSettings {
  homeLogoUrl: string;
  homeBackgroundUrl: string;
}

export function fetchPublicSettings(): Promise<PublicSettings> {
  return api('/api/settings/public');
}
