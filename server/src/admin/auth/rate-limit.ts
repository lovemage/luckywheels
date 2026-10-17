const WINDOW_MS = 60_000;
const MAX_FAILURES = 5;
const MAX_BUCKETS = 10_000;

const buckets = new Map<string, number[]>();
let nextSweepAt = 0;

function pruneExpired(atMs: number): void {
  if (atMs < nextSweepAt) return;
  for (const [ip, timestamps] of buckets) {
    const fresh = timestamps.filter((t) => atMs - t < WINDOW_MS);
    if (fresh.length === 0) buckets.delete(ip);
    else buckets.set(ip, fresh);
  }
  nextSweepAt = atMs + WINDOW_MS;
}

export function recordLoginFailure(ip: string, atMs: number = Date.now()): void {
  pruneExpired(atMs);
  // Do not evict an active lock to make room for a new IP.
  if (!buckets.has(ip) && buckets.size >= MAX_BUCKETS) return;
  const arr = (buckets.get(ip) ?? []).filter((t) => atMs - t < WINDOW_MS);
  arr.push(atMs);
  // The most recent five failures fully determine the sliding-window lock.
  buckets.set(ip, arr.slice(-MAX_FAILURES));
}

export function isLoginLocked(ip: string, atMs: number = Date.now()): boolean {
  pruneExpired(atMs);
  const arr = buckets.get(ip);
  // Fail closed for untracked IPs at capacity until expired entries are swept.
  if (!arr) return buckets.size >= MAX_BUCKETS;
  const fresh = arr.filter((t) => atMs - t < WINDOW_MS);
  if (fresh.length === 0) buckets.delete(ip);
  else if (fresh.length !== arr.length) buckets.set(ip, fresh);
  return fresh.length >= MAX_FAILURES;
}

export function clearRateLimitBucket(): void {
  buckets.clear();
  nextSweepAt = 0;
}
