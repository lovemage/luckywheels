import type { Site } from '../api/me.js';

export function SiteBadge({ site, label }: { site: Site; label?: string }) {
  return (
    <span className={`sa-badge sa-badge--site-${site}`} title={label ?? `Site ${site}`}>
      {label ?? `Site ${site}`}
    </span>
  );
}

const ACCOUNT_LABEL: Record<string, string> = {
  pending: '審核中',
  verified: '正式',
  test: '測試',
  blacklisted: '黑名單',
};

export function AccountBadge({ accountType }: { accountType: string }) {
  return (
    <span className={`sa-badge sa-badge--acct-${accountType}`}>
      {ACCOUNT_LABEL[accountType] ?? accountType}
    </span>
  );
}
