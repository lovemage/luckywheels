/** Keep Prisma's pool independent of the shared host's CPU count. */
export function withConnectionLimit(databaseUrl: string | undefined): string | undefined {
  if (!databaseUrl) return databaseUrl;
  try {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) return databaseUrl;
    // An explicit deployment setting always takes precedence.
    if (url.searchParams.has('connection_limit')) return databaseUrl;
    url.searchParams.set('connection_limit', '5');
    return url.toString();
  } catch {
    // Preserve Prisma's own validation without logging a credential-bearing URL.
    return databaseUrl;
  }
}
