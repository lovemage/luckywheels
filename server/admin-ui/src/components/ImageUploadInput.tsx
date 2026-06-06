import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { uploadImage } from '../api/uploads.js';

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
}

function proxiedImageUrl(url: string | null): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.pathname.includes('/prize-images/')) {
      return `/api/media-proxy?url=${encodeURIComponent(parsed.href)}`;
    }
  } catch {
    return url;
  }
  return url;
}

export function ImageUploadInput({ value, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const res = await uploadImage(file);
      onChange(res.url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      e.target.value = ''; // allow re-selecting same file
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {value && (
        <img
          src={proxiedImageUrl(value)}
          alt=""
          style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #ddd' }}
        />
      )}
      <label style={{ display: 'inline-block' }}>
        <span
          style={{
            padding: '6px 12px',
            background: '#3b82f6',
            color: '#fff',
            borderRadius: 6,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? '上傳中…' : value ? '更換圖片' : '上傳圖片'}
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={onPick}
          disabled={busy}
          style={{ display: 'none' }}
        />
      </label>
      {value && (
        <button type="button" onClick={() => onChange(null)} disabled={busy}>
          移除
        </button>
      )}
      {error && <span style={{ color: '#c00', fontSize: 12 }}>{error}</span>}
    </div>
  );
}
