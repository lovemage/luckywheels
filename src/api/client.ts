export class ApiError extends Error {
  constructor(public code: string, public override message: string, public status: number) {
    super(message);
  }
}

let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  unauthorizedHandler = fn;
}

export async function api<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(input, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 401) {
    unauthorizedHandler?.();
    const body = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
    throw new ApiError(body?.error?.code ?? 'UNAUTHENTICATED', body?.error?.message ?? 'login required', 401);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
    throw new ApiError(body?.error?.code ?? 'INTERNAL', body?.error?.message ?? 'request failed', res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
