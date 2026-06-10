import { z } from 'zod';

export const SITES = ['A', 'B'] as const;
export type Site = (typeof SITES)[number];

// The superadmin service is a SEPARATE deployment. It deliberately does NOT
// import the shared src/env.ts (which parses required member/admin vars like
// DATABASE_URL / LINE secrets at import time) so this service only needs its
// own variables and won't crash for lack of unrelated config.
const Schema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  SITE_A_DATABASE_URL: z.string().url(),
  SITE_B_DATABASE_URL: z.string().url(),
  SUPERADMIN_JWT_SECRET: z.string().min(32, 'SUPERADMIN_JWT_SECRET must be at least 32 characters'),
  SUPERADMIN_CONTROL_SITE: z.enum(['A', 'B']).default('A'),
  SITE_A_LABEL: z.string().optional(),
  SITE_B_LABEL: z.string().optional(),
});

export interface SuperadminConfig {
  port: number;
  siteUrls: Record<Site, string>;
  jwtSecret: string;
  /** Which site's database holds the superadmin AdminUser rows (role='superadmin'). */
  controlSite: Site;
  labels: Record<Site, string>;
}

let cached: SuperadminConfig | null = null;

/**
 * Resolve + assert the env required by the superadmin service. Lazy (not at
 * import) so importing superadmin modules in the normal server / tests — where
 * these vars are intentionally unset — does not crash. The superadmin entry
 * calls this at startup; route/auth code calls it on first use.
 */
export function superadminEnv(): SuperadminConfig {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`superadmin service env invalid: ${msg}`);
  }
  const e = parsed.data;
  cached = {
    port: e.PORT,
    siteUrls: { A: e.SITE_A_DATABASE_URL, B: e.SITE_B_DATABASE_URL },
    jwtSecret: e.SUPERADMIN_JWT_SECRET,
    controlSite: e.SUPERADMIN_CONTROL_SITE,
    labels: { A: e.SITE_A_LABEL ?? 'A 站', B: e.SITE_B_LABEL ?? 'B 站' },
  };
  return cached;
}

export function isSite(v: unknown): v is Site {
  return v === 'A' || v === 'B';
}
