export async function uploadImage(file: File): Promise<{ url: string; key: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/admin/uploads', {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
    throw new Error(body?.error?.message ?? `upload failed: ${res.status}`);
  }
  return res.json() as Promise<{ url: string; key: string }>;
}
