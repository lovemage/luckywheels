const COLORS: Record<string, string> = {
  pending: '#fef9c3',
  delivered: '#dcfce7',
  cancelled: '#fee2e2',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{ background: COLORS[status] ?? '#eee', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>
      {status}
    </span>
  );
}
