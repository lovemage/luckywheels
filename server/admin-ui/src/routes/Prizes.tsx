import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchPrizes,
  createPrize,
  updatePrize,
  deletePrize,
  reorderPrizes,
  type AdminPrize,
  type PrizeCreate,
} from '../api/prizes.js';
import { Modal } from '../components/Modal.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { ImageUploadInput } from '../components/ImageUploadInput.js';

const EMPTY_PRIZE: PrizeCreate = {
  rankLabel: '',
  name: '',
  description: null,
  imageUrl: null,
  cashAmount: 0,
  weight: 10,
  stock: 100,
  segmentColor: '#d92b3a',
  textColor: '#fff5d6',
  isConsolation: false,
  enabled: true,
};

type EditingState = null | { mode: 'create' } | { mode: 'edit'; prize: AdminPrize };

export function Prizes() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'prizes'], queryFn: fetchPrizes });
  const [editing, setEditing] = useState<EditingState>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const items = data?.items ?? [];
  const activeTotalWeight = items
    .filter((p) => p.enabled && p.stock > 0)
    .reduce((sum, p) => sum + p.weight, 0);
  const activeTotalWeightText = activeTotalWeight.toLocaleString('zh-TW', {
    maximumFractionDigits: 4,
  });

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const newOrder = items.map((p) => p.id);
    const from = newOrder.indexOf(dragId);
    const to = newOrder.indexOf(targetId);
    if (from === -1 || to === -1) {
      setDragId(null);
      return;
    }
    const moved = newOrder.splice(from, 1)[0]!;
    newOrder.splice(to, 0, moved);
    // optimistic update
    qc.setQueryData<{ items: AdminPrize[] }>(['admin', 'prizes'], (old) => {
      if (!old) return old;
      const map = new Map(old.items.map((p) => [p.id, p]));
      return { items: newOrder.map((id, i) => ({ ...map.get(id)!, wheelPosition: i })) };
    });
    setDragId(null);
    reorderPrizes(newOrder)
      .then(() => qc.invalidateQueries({ queryKey: ['admin', 'prizes'] }))
      .catch(() => qc.invalidateQueries({ queryKey: ['admin', 'prizes'] }));
  }

  return (
    <section className="member-detail-page">
      <header className="member-detail-hero">
        <div>
          <p className="admin-eyebrow">Prizes</p>
          <h1>獎品設定</h1>
          <p>
            目前可中獎總權重：<strong>{activeTotalWeightText}</strong>
            {' '}（只計算已啟用且庫存大於 0 的獎項）
          </p>
        </div>
      </header>
      {isLoading && <p>載入中…</p>}
      <section className="member-detail-card member-detail-card--wide admin-table-card">
        <table className="admin-prize-table">
          <thead>
            <tr>
              <th></th>
              <th>排名</th>
              <th>名稱</th>
              <th>中獎金額</th>
              <th>權重</th>
              <th>庫存</th>
              <th>顏色</th>
              <th>狀態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr
                key={p.id}
                draggable
                onDragStart={() => setDragId(p.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(p.id)}
                onDragEnd={() => setDragId(null)}
                className={dragId === p.id ? 'is-dragging' : ''}
              >
                <td className="admin-drag-handle">⋮⋮</td>
                <td>{p.rankLabel}</td>
                <td>{p.name}</td>
                <td>{p.cashAmount}</td>
                <td>{p.weight}</td>
                <td>{p.stock}</td>
                <td>
                  <span
                    className="admin-color-swatch"
                    style={{ background: p.segmentColor }}
                  />
                </td>
                <td>
                  {p.isConsolation && <span className="admin-soft-badge">安慰獎</span>}
                  {p.enabled ? '啟用' : '停用'}
                </td>
                <td>
                  <button onClick={() => setEditing({ mode: 'edit', prize: p })}>編輯</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {editing && (
        <PrizeEditModal
          initial={editing.mode === 'edit' ? editing.prize : EMPTY_PRIZE}
          mode={editing.mode}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['admin', 'prizes'] });
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function PrizeEditModal({
  initial,
  mode,
  onClose,
  onSaved,
}: {
  initial: PrizeCreate | AdminPrize;
  mode: 'create' | 'edit';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<PrizeCreate>(() => ({
    rankLabel: initial.rankLabel,
    name: initial.name,
    description: initial.description,
    imageUrl: initial.imageUrl,
    cashAmount: initial.cashAmount,
    weight: initial.weight,
    stock: initial.stock,
    segmentColor: initial.segmentColor,
    textColor: initial.textColor,
    isConsolation: initial.isConsolation,
    enabled: initial.enabled,
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editingId = mode === 'edit' ? (initial as AdminPrize).id : null;

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      if (editingId) await updatePrize(editingId, form);
      else await createPrize(form);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!editingId) return;
    setBusy(true);
    setError(null);
    try {
      await deletePrize(editingId);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={mode === 'create' ? '新增獎品' : `編輯：${initial.rankLabel}`}>
      <div style={{ display: 'grid', gap: 10 }}>
        <label>
          排名{' '}
          <input value={form.rankLabel} onChange={(e) => setForm({ ...form, rankLabel: e.target.value })} />
        </label>
        <label>
          名稱 <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          說明{' '}
          <input
            value={form.description ?? ''}
            onChange={(e) => setForm({ ...form, description: e.target.value || null })}
          />
        </label>
        <label>
          圖片{' '}
          <ImageUploadInput value={form.imageUrl} onChange={(url) => setForm({ ...form, imageUrl: url })} />
        </label>
        <label>
          中獎金額{' '}
          <input
            type="number"
            value={form.cashAmount}
            onChange={(e) => setForm({ ...form, cashAmount: Number(e.target.value) })}
          />
        </label>
        <label>
          中獎權重（weight）{' '}
          <input
            type="number"
            min={0}
            step={0.1}
            value={form.weight}
            onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })}
          />
          <small style={{ display: 'block', marginTop: 4, color: '#6b7280' }}>
            權重可使用小數，例如 0.1。中獎機率 = 本獎項權重 ÷ 所有可中獎獎項權重總和 × 100%。例如總權重 100、本獎項權重 0.1，機率約為 0.1%。
          </small>
        </label>
        <label>
          庫存（stock）{' '}
          <input
            type="number"
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
          />
          <small style={{ display: 'block', marginTop: 4, color: '#6b7280' }}>
            庫存為 0 時，前台輪盤仍會顯示並可轉動，但後端抽獎不會抽中此獎項。
          </small>
        </label>
        <label>
          背景色{' '}
          <input
            type="color"
            value={form.segmentColor}
            onChange={(e) => setForm({ ...form, segmentColor: e.target.value })}
          />
        </label>
        <label>
          文字色{' '}
          <input
            type="color"
            value={form.textColor}
            onChange={(e) => setForm({ ...form, textColor: e.target.value })}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.isConsolation}
            onChange={(e) => setForm({ ...form, isConsolation: e.target.checked })}
          />{' '}
          安慰獎（謝謝參加）
          <small style={{ display: 'block', marginTop: 4, color: '#6b7280' }}>
            舊版標記；目前成本控制會自動使用「啟用獎項中最低的中獎金額」，不再依賴安慰獎。
          </small>
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />{' '}
          啟用
        </label>
        {error && <p style={{ color: '#c00' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          {editingId && (
            <button onClick={() => setConfirmDelete(true)} style={{ color: '#c00' }} disabled={busy}>
              刪除
            </button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={busy}>
              取消
            </button>
            <button onClick={onSave} disabled={busy}>
              {busy ? '儲存中…' : '儲存'}
            </button>
          </div>
        </div>
      </div>
      {confirmDelete && (
        <ConfirmModal
          open
          onClose={() => setConfirmDelete(false)}
          title="刪除獎品"
          description="永久刪除此獎品？若有抽獎紀錄會被拒絕，請改用「停用」。"
          confirmLabel="確認刪除"
          busy={busy}
          onConfirm={onDelete}
        />
      )}
    </Modal>
  );
}
