import { z } from 'zod';

const Schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3001),
  PUBLIC_FRONTEND_ORIGIN: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  STATE_SECRET: z.string().min(32, 'STATE_SECRET must be at least 32 characters'),
  ADMIN_JWT_SECRET: z.string().min(32, 'ADMIN_JWT_SECRET must be at least 32 characters'),
  ADMIN_PUBLIC_ORIGIN: z.string().url().optional(),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  LINE_CHANNEL_ID: z.string().min(1),
  LINE_CHANNEL_SECRET: z.string().min(16),
  LINE_REDIRECT_URI: z.string().url(),
  LINE_AUTH_BASE: z.string().url(),
  LINE_API_BASE: z.string().url(),
  LINE_PROFILE_BASE: z.string().url(),
  LINE_ISSUER: z.string().url(),
  // Railway Bucket (S3-compatible) — optional so dev / tests work without it.
  // Upload endpoints throw BUCKET_NOT_CONFIGURED at request time if any of
  // BUCKET / ACCESS_KEY_ID / SECRET_ACCESS_KEY / ENDPOINT are missing.
  BUCKET: z.string().optional(),
  ACCESS_KEY_ID: z.string().optional(),
  SECRET_ACCESS_KEY: z.string().optional(),
  ENDPOINT: z.string().url().optional(),
  REGION: z.string().optional(),
}).superRefine((e, ctx) => {
  if (e.JWT_SECRET === e.STATE_SECRET) {
    ctx.addIssue({ code: 'custom', message: 'JWT_SECRET and STATE_SECRET must be distinct', path: ['STATE_SECRET'] });
  }
  if (e.ADMIN_JWT_SECRET === e.JWT_SECRET || e.ADMIN_JWT_SECRET === e.STATE_SECRET) {
    ctx.addIssue({ code: 'custom', message: 'ADMIN_JWT_SECRET must be distinct from JWT_SECRET and STATE_SECRET', path: ['ADMIN_JWT_SECRET'] });
  }
});

export type Env = z.infer<typeof Schema>;
export function parseEnv(raw: Record<string, string | undefined>): Env {
  return Schema.parse(raw);
}
export const env: Env = parseEnv(process.env);
