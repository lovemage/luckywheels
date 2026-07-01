type AccountType = 'pending' | 'verified' | 'test' | 'blacklisted';

const LABELS: Record<AccountType, string> = {
  pending: '審核中',
  verified: '正式',
  test: '測試',
  blacklisted: '黑名單',
};

export function AccountTypeBadge({ type }: { type: AccountType }) {
  return <span className={`admin-account-badge admin-account-badge--${type}`}>{LABELS[type]}</span>;
}
