import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCollectorAccount,
  deleteCollectorAccount,
  fetchCollectorOverview,
  fetchCollectorRuns,
  updateCollectorAccount,
  updateCollectorSettings,
  type CollectorAccount,
  type CollectorRunStatus,
} from '../api/assistant-collector.js';
import { ApiError } from '../api/client.js';
import { ConfirmModal } from '../components/ConfirmModal.js';

const OVERVIEW_KEY = ['admin', 'assistant', 'collector'] as const;
const RUNS_KEY = ['admin', 'assistant', 'collector', 'runs'] as const;

const ERROR_LABELS: Record<string, string> = {
  COLLECTOR_KEY_NOT_CONFIGURED: '伺服器尚未設定 COLLECTOR_CREDENTIALS_KEY，無法儲存帳號密碼',
  CASINO_URL_INVALID: '娛樂城網址必須是 https，且不可包含帳號密碼',
  COLLECTOR_PASSWORD_REQUIRED: '變更娛樂城網址時，需同時重新輸入密碼',
  COLLECTOR_BODY_INVALID: '欄位格式錯誤',
  COLLECTOR_ACCOUNT_NOT_FOUND: '找不到此採集帳號',
  ADMIN_NAV_FORBIDDEN: '沒有數據助手權限',
};

// 沿用既有 badge 顏色：進行中＝黃、成功＝綠、失敗＝紅
const RUN_STATUS: Record<CollectorRunStatus, { label: string; tone: string }> = {
  running: { label: '進行中', tone: 'pending' },
  succeeded: { label: '成功', tone: 'delivered' },
  failed: { label: '失敗', tone: 'cancelled' },
};

const TIME_FORMAT = new Intl.DateTimeFormat('zh-TW', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const fmt = (iso: string | null) => (iso ? TIME_FORMAT.format(new Date(iso)) : '—');
const seconds = (ms: number | null) => (ms === null ? '—' : `${Math.round(ms / 1000)} 秒`);

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="member-detail-info-item">
      <dt>{label}</dt>
      <dd>
        <span>{value}</span>
      </dd>
    </div>
  );
}

function emptyAccountForm() {
  return { label: '', casinoUrl: '', account: '', password: '', enabled: true };
}

function useErrorText() {
  const [error, setError] = useState<string | null>(null);
  const onError = (e: unknown) => {
    setError(e instanceof ApiError ? ERROR_LABELS[e.code] ?? `操作失敗（${e.code}）` : '操作失敗');
  };
  return { error, setError, onError };
}

export function AssistantCollector() {
  const overview = useQuery({ queryKey: OVERVIEW_KEY, queryFn: fetchCollectorOverview });
  const runs = useQuery({ queryKey: RUNS_KEY, queryFn: () => fetchCollectorRuns(30), refetchInterval: 30_000 });

  return (
    <section className="member-detail-page collector-page">
      <header className="member-detail-hero">
        <div>
          <p className="admin-eyebrow">Data Assistant</p>
          <h1>數據採集</h1>
          <p>ATG 戰神賽特 II 機台資料採集：採集帳號、頻率與執行紀錄。機台歷史資料只保存 3 天。</p>
        </div>
      </header>

      {overview.data && !overview.data.keyConfigured && (
        <p className="member-detail-error" role="alert">
          伺服器尚未設定 COLLECTOR_CREDENTIALS_KEY：無法新增或修改採集帳號，collector 也無法讀取已儲存的帳號。
        </p>
      )}

      <section className="member-detail-card">
        <h2>採集概況</h2>
        {runs.isLoading ? (
          <p>載入中…</p>
        ) : (
          <dl className="member-detail-info-grid collector-overview-grid">
            <InfoItem label="最近一次成功" value={fmt(runs.data?.lastSucceededAt ?? null)} />
            <InfoItem label="機台數" value={`${runs.data?.rooms.total ?? 0} 台`} />
            <InfoItem label="已有細項" value={`${runs.data?.rooms.detailed ?? 0} 台`} />
          </dl>
        )}
      </section>

      {overview.isLoading ? (
        <p>載入中…</p>
      ) : overview.data ? (
        <AccountsSection
          accounts={overview.data.accounts}
          activeAccountId={overview.data.activeAccountId}
          keyConfigured={overview.data.keyConfigured}
          settings={<SettingsCard initial={overview.data.settings} />}
        />
      ) : (
        <p className="member-detail-error" role="alert">無法載入採集設定</p>
      )}

      <section className="member-detail-card">
        <h2>採集紀錄（最近 30 輪）</h2>
        {runs.isLoading ? (
          <p>載入中…</p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-prize-table collector-table">
              <thead>
                <tr>
                  <th>開始時間</th>
                  <th>狀態</th>
                  <th className="is-numeric">耗時</th>
                  <th className="is-numeric">列表</th>
                  <th className="is-numeric">細項</th>
                  <th>錯誤</th>
                </tr>
              </thead>
              <tbody>
                {(runs.data?.items ?? []).map((run) => {
                  const status = RUN_STATUS[run.status] ?? { label: run.status, tone: run.status };
                  return (
                    <tr key={run.id}>
                      <td>{fmt(run.startedAt)}</td>
                      <td>
                        <span className={`admin-status-badge admin-status-badge--${status.tone}`}>{status.label}</span>
                      </td>
                      <td className="is-numeric">{seconds(run.durationMs)}</td>
                      <td className="is-numeric">{run.roomsListed}</td>
                      <td className="is-numeric">{run.roomsDetailed}</td>
                      <td className="is-wrap">{run.errorCode ? `${run.errorCode}${run.errorMessage ? `：${run.errorMessage}` : ''}` : '—'}</td>
                    </tr>
                  );
                })}
                {runs.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={6}>尚無採集紀錄</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function SettingsCard({ initial }: { initial: { intervalMinutes: number; detailBatchSize: number } }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    intervalMinutes: String(initial.intervalMinutes),
    detailBatchSize: String(initial.detailBatchSize),
  });
  const [message, setMessage] = useState<string | null>(null);
  const { error, setError, onError } = useErrorText();

  useEffect(() => {
    setForm({ intervalMinutes: String(initial.intervalMinutes), detailBatchSize: String(initial.detailBatchSize) });
  }, [initial.intervalMinutes, initial.detailBatchSize]);

  const mut = useMutation({
    mutationFn: updateCollectorSettings,
    onSuccess: () => {
      setMessage('採集設定已儲存，下一輪起生效');
      setError(null);
      qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    },
    onError: (e) => {
      setMessage(null);
      onError(e);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const intervalMinutes = Number(form.intervalMinutes);
    const detailBatchSize = Number(form.detailBatchSize);
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 120) {
      setError('採集間隔需為 5–120 的整數分鐘');
      return;
    }
    if (!Number.isInteger(detailBatchSize) || detailBatchSize < 0 || detailBatchSize > 5000) {
      setError('每輪細項台數需為 0–5000 的整數');
      return;
    }
    mut.mutate({ intervalMinutes, detailBatchSize });
  }

  return (
    <section className="member-detail-card">
      <h2>採集設定</h2>
      <form className="admin-form-grid" onSubmit={submit}>
        <label>
          <span>採集間隔（分鐘）</span>
          <input
            type="number"
            min={5}
            max={120}
            value={form.intervalMinutes}
            onChange={(e) => setForm({ ...form, intervalMinutes: e.target.value })}
          />
          <small>以「開始到開始」計算。測試期 10 分鐘、正式 20 分鐘。</small>
        </label>
        <label>
          <span>每輪細項台數</span>
          <input
            type="number"
            min={0}
            max={5000}
            value={form.detailBatchSize}
            onChange={(e) => setForm({ ...form, detailBatchSize: e.target.value })}
          />
          <small>每台約 0.3 秒；細項階段最多使用間隔的 80%，時間不夠時會提早結束。</small>
        </label>
        <div className="member-detail-actions">
          <button type="submit" disabled={mut.isPending}>儲存設定</button>
        </div>
      </form>
      {message && <p className="admin-success-text" role="status">{message}</p>}
      {error && <p className="member-detail-error" role="alert">{error}</p>}
    </section>
  );
}

function AccountsSection({
  accounts,
  activeAccountId,
  keyConfigured,
  settings,
}: {
  accounts: CollectorAccount[];
  activeAccountId: string | null;
  keyConfigured: boolean;
  settings: ReactNode;
}) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyAccountForm);
  const [deleting, setDeleting] = useState<CollectorAccount | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { error, setError, onError } = useErrorText();
  const editing = accounts.find((a) => a.id === editingId) ?? null;

  const formRef = useRef<HTMLElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  // 只在點「編輯」／「取消」時重設表單；背景 refetch 換掉 accounts 物件時不能清掉正在輸入的內容
  function startEditing(a: CollectorAccount | null) {
    setEditingId(a?.id ?? null);
    setForm(a ? { label: a.label, casinoUrl: a.casinoUrl, account: '', password: '', enabled: a.enabled } : emptyAccountForm());
  }

  // 表單在列表下方：點「編輯」後捲到表單並把焦點放到第一個欄位
  useEffect(() => {
    if (!editingId) return;
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    labelInputRef.current?.focus({ preventScroll: true });
  }, [editingId]);

  const done = (text: string) => {
    setMessage(text);
    setError(null);
    qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
  };
  const fail = (e: unknown) => {
    setMessage(null);
    onError(e);
  };

  const createMut = useMutation({
    mutationFn: createCollectorAccount,
    onSuccess: () => {
      done('採集帳號已新增');
      startEditing(null);
    },
    onError: fail,
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateCollectorAccount>[1] }) =>
      updateCollectorAccount(id, body),
    onSuccess: () => {
      done('採集帳號已更新');
      startEditing(null);
    },
    onError: fail,
  });
  // 列表上的啟用／停用：與編輯表單分開，不影響正在編輯的帳號
  const toggleMut = useMutation({
    mutationFn: (a: CollectorAccount) => updateCollectorAccount(a.id, { enabled: !a.enabled }),
    onSuccess: (row) => done(`「${row.label}」已${row.enabled ? '啟用' : '停用'}`),
    onError: fail,
  });
  const deleteMut = useMutation({
    mutationFn: deleteCollectorAccount,
    onSuccess: () => {
      done('採集帳號已刪除');
      if (deleting?.id === editingId) startEditing(null);
      setDeleting(null);
    },
    onError: fail,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const label = form.label.trim();
    const casinoUrl = form.casinoUrl.trim();
    const account = form.account.trim();
    if (!label || !casinoUrl) {
      setError('請輸入名稱與娛樂城網址');
      return;
    }
    if (editingId) {
      updateMut.mutate({
        id: editingId,
        body: {
          label,
          casinoUrl,
          enabled: form.enabled,
          ...(account ? { account } : {}),
          ...(form.password ? { password: form.password } : {}),
        },
      });
      return;
    }
    if (!account || !form.password) {
      setError('新增採集帳號需輸入帳號與密碼');
      return;
    }
    createMut.mutate({ label, casinoUrl, account, password: form.password, enabled: form.enabled });
  }

  return (
    <>
      <section className="member-detail-card">
        <h2>採集帳號</h2>
        <div className="admin-table-scroll">
          <table className="admin-prize-table collector-table">
            <thead>
              <tr>
                <th>名稱</th>
                <th>帳號</th>
                <th>狀態</th>
                <th>最後使用</th>
                <th>最後錯誤</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td className="is-wrap">
                    {a.label}
                    <br />
                    <small>{a.casinoUrl}</small>
                  </td>
                  <td>{a.accountMasked ?? '—'}</td>
                  <td>
                    {a.id === activeAccountId ? (
                      <span className="admin-status-badge admin-status-badge--delivered">使用中</span>
                    ) : a.enabled ? (
                      <span className="admin-status-badge">備用</span>
                    ) : (
                      <span className="admin-status-badge admin-status-badge--cancelled">停用</span>
                    )}
                  </td>
                  <td>{fmt(a.lastUsedAt)}</td>
                  <td className="is-wrap">{a.lastError ? `${fmt(a.lastErrorAt)} ${a.lastError}` : '—'}</td>
                  <td>
                    <div className="member-detail-actions">
                      <button type="button" onClick={() => startEditing(a)}>編輯</button>
                      <button type="button" disabled={toggleMut.isPending} onClick={() => toggleMut.mutate(a)}>
                        {a.enabled ? '停用' : '啟用'}
                      </button>
                      <button type="button" className="danger" onClick={() => setDeleting(a)}>刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={6}>尚未設定採集帳號（collector 會改用環境變數 ATG_COLLECTOR_*，若也沒有則不採集）</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="member-detail-grid">
      <section className="member-detail-card" ref={formRef}>
        <h2>{editingId ? '編輯採集帳號' : '新增採集帳號'}</h2>
        <form className="admin-form-grid" onSubmit={submit} autoComplete="off">
          <label>
            <span>名稱</span>
            <input ref={labelInputRef} value={form.label} maxLength={60} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </label>
          <label>
            <span>娛樂城網址</span>
            <input
              value={form.casinoUrl}
              placeholder="https://"
              onChange={(e) => setForm({ ...form, casinoUrl: e.target.value })}
            />
            <small>
              只保留網域（例：https://www.example.com），路徑與參數不儲存。{editingId && '變更網域時需同時重新輸入密碼。'}
            </small>
          </label>
          <label>
            <span>{editingId ? `帳號（目前 ${editing?.accountMasked ?? '已設定'}，留空不變）` : '帳號'}</span>
            <input
              value={form.account}
              autoComplete="off"
              onChange={(e) => setForm({ ...form, account: e.target.value })}
            />
          </label>
          <label>
            <span>{editingId ? '密碼（已設定，留空不變）' : '密碼'}</span>
            <input
              type="password"
              value={form.password}
              autoComplete="new-password"
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <label className="admin-toggle">
            <input
              type="checkbox"
              role="switch"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            <span className="admin-toggle-track" aria-hidden="true" />
            <span className="admin-toggle-label">啟用</span>
          </label>
          <div className="member-detail-actions">
            <button
              type="submit"
              disabled={
                (!keyConfigured && (!editingId || form.account.trim() !== '' || form.password !== '')) ||
                createMut.isPending ||
                updateMut.isPending
              }
            >
              {editingId ? '更新採集帳號' : '新增採集帳號'}
            </button>
            {editingId && (
              <button type="button" onClick={() => startEditing(null)}>取消</button>
            )}
          </div>
        </form>
        <p>帳號與密碼加密儲存，儲存後無法再查看密碼。有多個啟用帳號時，使用最近更新的那一個。</p>
        {message && <p className="admin-success-text" role="status">{message}</p>}
        {error && <p className="member-detail-error" role="alert">{error}</p>}
      </section>

        {settings}
      </div>

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="刪除採集帳號"
        description={deleting ? `確定刪除「${deleting.label}」？刪除後無法復原。` : undefined}
        confirmLabel="刪除"
        busy={deleteMut.isPending}
        onConfirm={() => {
          if (deleting) deleteMut.mutate(deleting.id);
        }}
      />
    </>
  );
}
