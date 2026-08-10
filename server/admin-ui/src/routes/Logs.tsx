import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchLogs, type ActionLogRow } from '../api/logs.js';
import { Table } from '../components/Table.js';
import { CursorPagination } from '../components/CursorPagination.js';
import { useCursorPagination } from '../hooks/useCursorPagination.js';

const ACTION_LABELS: Record<string, string> = {
  'admin.account_change': '管理員更新帳號資料',
  'admin.password_change': '管理員更新密碼',
  'admin.login_failed': '管理員登入失敗',
  'admin.login_succeeded': '管理員登入成功',
  'admin.upload': '管理員上傳檔案',
  'app_settings.update': '更新系統設定',
  'draw_blocked_blacklist': '黑名單會員被阻擋抽獎',
  'prize.created': '建立獎項',
  'prize.updated': '更新獎項',
  'prize.deleted': '刪除獎項',
  'prize.reordered': '調整獎項順序',
  'redemption.claim': '標記兌獎為已派送',
  'redemption.void': '作廢兌獎紀錄',
  'redemption.unclaim': '取消已派送狀態',
  'redemption.reset_all': '重設全部兌獎狀態',
  'superadmin.login_failed': '超級管理員登入失敗',
  'superadmin.login_succeeded': '超級管理員登入成功',
  'user.deleted': '刪除會員',
  'user.points_adjust': '調整會員點數',
  'user.account_type_change': '變更會員帳號類型',
  'user.approved': '核准會員帳號',
  'user.test_settings_change': '修改會員測試設定',
  'user.blacklist_set': '加入會員黑名單',
  'user.blacklist_clear': '移除會員黑名單',
  'user.entertainment_code_change': '修改會員娛樂城代碼',
  'user.migrated_in': '會員移入本站',
  'user.migrated_out': '會員移出本站',
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  admin: '管理員登入事件',
  admin_user: '管理員帳號',
  app_settings: '系統設定',
  prize: '獎項資料',
  redemption: '兌獎紀錄',
  upload: '上傳檔案',
  user: '會員資料',
};

function renderActionCell(action: string) {
  return (
    <div className="admin-log-cell">
      <code>{action}</code>
      <span>{ACTION_LABELS[action] ?? '未定義的操作類型'}</span>
    </div>
  );
}

function renderTargetCell(targetType: string | null, targetId: string | null) {
  if (!targetType) return '—';
  return (
    <div className="admin-log-cell">
      <code>{`${targetType}:${targetId ?? ''}`}</code>
      <span>{TARGET_TYPE_LABELS[targetType] ?? '未定義的目標類型'}</span>
    </div>
  );
}

export function Logs() {
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [targetId, setTargetId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const pagination = useCursorPagination();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'action-logs', action, targetType, targetId, from, to, pagination.cursor],
    queryFn: () => fetchLogs({
      action: action || undefined,
      targetType: targetType || undefined,
      targetId: targetId || undefined,
      from: from || undefined,
      to: to || undefined,
      take: 25,
      cursor: pagination.cursor,
    }),
  });

  return (
    <section className="member-detail-page">
      <header className="member-detail-hero">
        <div>
          <p className="admin-eyebrow">Action Logs</p>
          <h1>歷史紀錄</h1>
          <p>檢視管理員操作與系統紀錄。</p>
        </div>
      </header>
      <div className="member-detail-actions admin-toolbar">
        <input placeholder="action（e.g. redemption.claim）" value={action} onChange={(e) => { setAction(e.target.value); pagination.reset(); }} />
        <input placeholder="targetType" value={targetType} onChange={(e) => { setTargetType(e.target.value); pagination.reset(); }} />
        <input placeholder="targetId" value={targetId} onChange={(e) => { setTargetId(e.target.value); pagination.reset(); }} />
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); pagination.reset(); }} />
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); pagination.reset(); }} />
      </div>
      {isLoading && <p>載入中…</p>}
      {data && (
        <>
          <section className="member-detail-card member-detail-card--wide admin-table-card">
            <Table<ActionLogRow>
              rows={data.items}
              rowKey={(r) => r.id}
              columns={[
                { header: '時間', cell: (r) => new Date(r.createdAt).toLocaleString() },
                { header: 'Admin', cell: (r) => r.adminUser?.email ?? '—' },
                { header: 'Action', cell: (r) => renderActionCell(r.action) },
                { header: 'Target', cell: (r) => renderTargetCell(r.targetType, r.targetId) },
                { header: 'IP', cell: (r) => r.ip ?? '—' },
                { header: 'Payload', cell: (r) => <details><summary>view</summary><pre>{JSON.stringify(r.payload, null, 2)}</pre></details> },
              ]}
            />
          </section>
          <CursorPagination
            page={pagination.page}
            canPrevious={pagination.canPrevious}
            canNext={Boolean(data.nextCursor)}
            onPrevious={pagination.previous}
            onNext={() => pagination.next(data.nextCursor)}
          />
        </>
      )}
    </section>
  );
}
