const WINDOW_MS = 60_000;
const MAX_FAILURES = 5;

const buckets = new Map<string, number[]>();

export function recordLoginFailure(ip: string, atMs: number = Date.now()): void {
  const arr = buckets.get(ip) ?? [];
  arr.push(atMs);
  buckets.set(ip, arr);
}

export function isLoginLocked(ip: string, atMs: number = Date.now()): boolean {
  const arr = buckets.get(ip);
  if (!arr) return false;
  const fresh = arr.filter((t) => atMs - t < WINDOW_MS);
  if (fresh.length !== arr.length) buckets.set(ip, fresh);
  return fresh.length >= MAX_FAILURES;
}

export function clearRateLimitBucket(): void {
  buckets.clear();
}
