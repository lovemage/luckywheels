type AccountType = 'pending' | 'verified' | 'test' | 'blacklisted';

const STYLES: Record<AccountType, { background: string; color: string; label: string }> = {
  pending: { background: '#fef3c7', color: '#92400e', label: '審核中' },
  verified: { background: '#dcfce7', color: '#166534', label: '正式' },
  test: { background: '#dbeafe', color: '#1e3a8a', label: '測試' },
  blacklisted: { background: '#fee2e2', color: '#7f1d1d', label: '黑名單' },
};

export function AccountTypeBadge({ type }: { type: AccountType }) {
  const s = STYLES[type];
  return (
    <span style={{
      background: s.background, color: s.color,
      padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
    }}>{s.label}</span>
  );
}
