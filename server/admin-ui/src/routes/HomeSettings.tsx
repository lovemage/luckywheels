import { useState, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSettings, updateSettings } from '../api/settings.js';
import { ImageUploadInput } from '../components/ImageUploadInput.js';

function Hint({ children }: { children: ReactNode }) {
  return <small style={{ display: 'block', marginTop: 4, color: '#6b7280', lineHeight: 1.5 }}>{children}</small>;
}

export function HomeSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'settings'], queryFn: fetchSettings });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (data) {
      setLogoUrl(data.homeLogoUrl || null);
      setBgUrl(data.homeBackgroundUrl || null);
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () => updateSettings({ homeLogoUrl: logoUrl ?? '', homeBackgroundUrl: bgUrl ?? '' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
      setError(null);
      setSavedAt(Date.now());
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading || !data) return <p>載入中…</p>;

  return (
    <section>
      <h1>首頁設定</h1>
      <p style={{ marginTop: 0, color: '#6b7280' }}>
        更換會員前台（抽獎首頁）的 LOGO 與背景圖。儲存後會員前台重新載入即可看到。留空（移除）＝使用系統內建預設圖。
      </p>

      <fieldset style={{ marginBottom: 16 }}>
        <legend>LOGO</legend>
        <ImageUploadInput value={logoUrl} onChange={setLogoUrl} />
        <Hint>
          顯示在首頁左上角。建議尺寸約 <strong>1344 × 896</strong>（3:2）、PNG 去背、5MB 以內。
        </Hint>
      </fieldset>

      <fieldset style={{ marginBottom: 16 }}>
        <legend>背景圖</legend>
        <ImageUploadInput value={bgUrl} onChange={setBgUrl} />
        <Hint>
          鋪滿整個手機畫面（以 cover 裁切置中）。建議<strong>直式</strong>、約 <strong>853 × 1844</strong>（手機比例）、5MB 以內。
        </Hint>
      </fieldset>

      {error && <p style={{ color: '#c00' }}>{error}</p>}
      {savedAt && <p style={{ color: '#0a0' }}>已儲存 ({new Date(savedAt).toLocaleTimeString()})</p>}
      <button onClick={() => mut.mutate()} disabled={mut.isPending}>
        {mut.isPending ? '儲存中…' : '儲存'}
      </button>
    </section>
  );
}
