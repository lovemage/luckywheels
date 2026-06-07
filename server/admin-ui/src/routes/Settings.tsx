import { useState, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSettings, updateSettings, type SettingsUpdate } from '../api/settings.js';

function Hint({ children }: { children: ReactNode }) {
  return <small>{children}</small>;
}

export function Settings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'settings'], queryFn: fetchSettings });
  const [form, setForm] = useState<SettingsUpdate>({});
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (data)
      setForm({
        pointThresholds: data.pointThresholds,
        spinDurationMs: data.spinDurationMs,
        minDrawsBeforeWin: data.minDrawsBeforeWin,
        cooldownDrawsAfterWin: data.cooldownDrawsAfterWin,
        costControlEnabled: data.costControlEnabled,
        costControlInterval: data.costControlInterval,
        rulesText: data.rulesText,
      });
  }, [data]);

  const mut = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
      setError(null);
      setSavedAt(Date.now());
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading || !data) return <p>載入中…</p>;
  const thresholds = form.pointThresholds ?? [];

  return (
    <section className="member-detail-page">
      <header className="member-detail-hero">
        <div>
          <p className="admin-eyebrow">Rules</p>
          <h1>遊戲規則</h1>
          <p>管理抽獎積分、動畫、前台規則與成本控制設定。</p>
        </div>
      </header>

      <fieldset className="member-detail-card member-detail-card--wide admin-fieldset-card">
        <legend>積分門檻（單抽 → 連抽）</legend>
        <p className="admin-muted-text">
          設定會員消耗多少積分可抽幾次。前台會依會員目前積分，自動顯示可用的單抽或連抽方案。
        </p>
        {thresholds.map((t, i) => (
          <div key={i} className="admin-inline-fields">
            <label>
              消耗積分{' '}
              <input
                type="number"
                value={t.points}
                onChange={(e) => {
                  const next = [...thresholds];
                  next[i] = { ...next[i]!, points: Number(e.target.value) };
                  setForm({ ...form, pointThresholds: next });
                }}
              />
            </label>
            <label>
              抽獎次數{' '}
              <input
                type="number"
                value={t.draws}
                onChange={(e) => {
                  const next = [...thresholds];
                  next[i] = { ...next[i]!, draws: Number(e.target.value) };
                  setForm({ ...form, pointThresholds: next });
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => setForm({ ...form, pointThresholds: thresholds.filter((_, j) => j !== i) })}
              disabled={thresholds.length <= 1}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setForm({ ...form, pointThresholds: [...thresholds, { points: 0, draws: 1 }] })}
        >
          + 新增門檻
        </button>
      </fieldset>

      <fieldset className="member-detail-card member-detail-card--wide admin-fieldset-card">
        <legend>動畫設定</legend>
        <label>
          轉盤旋轉時間（spinDurationMs，毫秒 ms）{' '}
          <input
            type="number"
            min={500}
            max={20000}
            value={form.spinDurationMs ?? 4300}
            onChange={(e) => setForm({ ...form, spinDurationMs: Number(e.target.value) })}
          />
          <Hint>控制前台轉盤動畫與轉動音效的持續時間。1000 ms = 1 秒；建議維持 3000 到 6000 ms，過短會像跳格，過長會等待太久。</Hint>
        </label>
      </fieldset>

      <fieldset className="member-detail-card member-detail-card--wide admin-fieldset-card">
        <legend>前台活動規則內容</legend>
        <p className="admin-muted-text">
          這段文字會顯示在會員前台「活動規則 / 使用須知」頁面。每一行會在前台顯示成一段規則。
        </p>
        <label>
          使用須知文字（rulesText）
          <textarea
            rows={6}
            value={form.rulesText ?? ''}
            onChange={(e) => setForm({ ...form, rulesText: e.target.value })}
            style={{ width: '100%', display: 'block', marginTop: 6 }}
          />
          <Hint>請用換行分隔不同規則。最多 2000 個字；儲存後前台重新載入即可看到新內容。</Hint>
        </label>
      </fieldset>

      <fieldset className="member-detail-card member-detail-card--wide admin-fieldset-card">
        <legend>成本控制門檻</legend>
        <p className="admin-muted-text">
          成本控制啟用後，系統會用全站累計抽獎次數判斷每一抽是否進入權重計算。只有命中指定倍數的抽獎才會依權重抽獎；其他抽獎一定派目前最低中獎金額獎項。連抽會逐筆子抽套用此規則。
        </p>
        <p className="admin-strong-text">
          目前最低金額成本控制獎：
          {data.lowestCostPrize
            ? `${data.lowestCostPrize.rankLabel} ${data.lowestCostPrize.name}，中獎金額 ${data.lowestCostPrize.cashAmount}`
            : '尚無啟用且金額大於 0 的獎項'}
        </p>
        <label className="admin-toggle">
          <input
            type="checkbox"
            role="switch"
            checked={form.costControlEnabled ?? false}
            onChange={(e) => setForm({ ...form, costControlEnabled: e.target.checked })}
          />
          <span className="admin-toggle-track" aria-hidden="true" />
          <span className="admin-toggle-label">
            啟用全站倍數成本控制（costControlEnabled）
          </span>
        </label>
        <Hint>關閉時，每一抽都依權重計算；開啟時，只有指定倍數抽獎依權重計算，其餘派最低金額獎。</Hint>
        {form.costControlEnabled !== data.costControlEnabled && (
          <span className="admin-dirty-hint">尚未儲存</span>
        )}
        <br />
        <label>
          權重計算倍數（costControlInterval）{' '}
          <select
            value={form.costControlInterval ?? 3}
            onChange={(e) => setForm({ ...form, costControlInterval: Number(e.target.value) })}
          >
            {[3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                每 {n} 抽
              </option>
            ))}
          </select>
          <Hint>
            只能擇一。例如選每 3 抽，則全站第 3、6、9、12 抽會依權重計算；第 1、2、4、5、7、8 抽會派最低金額獎。連抽會拆成多筆子抽依序計算。
          </Hint>
        </label>
      </fieldset>

      <fieldset className="member-detail-card member-detail-card--wide admin-fieldset-card">
        <legend>系統累計（唯讀）</legend>
        <p className="admin-muted-text">以下資料由系統自動累計，供成本控管判斷與營運檢查使用，不能在此手動修改。</p>
        <p>累計抽獎次數：{data.totals.drawCount}</p>
        <p>累計派彩金額：{data.totals.payoutAmount}</p>
        <p>累計消耗積分：{data.totals.pointsBurned}</p>
        <p>
          成本控制最低金額獎：
          {data.lowestCostPrize
            ? `${data.lowestCostPrize.rankLabel} ${data.lowestCostPrize.name} / ${data.lowestCostPrize.cashAmount}`
            : '（未偵測到）'}
        </p>
      </fieldset>

      {error && <p className="member-detail-error">{error}</p>}
      {savedAt && <p className="admin-success-text">已儲存 ({new Date(savedAt).toLocaleTimeString()})</p>}
      <div className="member-detail-actions">
        <button onClick={() => mut.mutate(form)} disabled={mut.isPending}>
          {mut.isPending ? '儲存中…' : '儲存'}
        </button>
      </div>
    </section>
  );
}
