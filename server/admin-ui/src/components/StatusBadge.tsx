const COLORS: Record<string, string> = {
  pending: '#fef9c3',
  delivered: '#dcfce7',
  cancelled: '#fee2e2',
};

export const STATUS_LABELS: Record<string, string> = {
  pending: '未完成',
  delivered: '已派送',
  cancelled: '已取消',
  all: '全部',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{ background: COLORS[status] ?? '#eee', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
