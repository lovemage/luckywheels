import { z } from 'zod';

const Schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3001),
  PUBLIC_FRONTEND_ORIGIN: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  STATE_SECRET: z.string().min(32, 'STATE_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  LINE_CHANNEL_ID: z.string().min(1),
  LINE_CHANNEL_SECRET: z.string().min(16),
  LINE_REDIRECT_URI: z.string().url(),
  LINE_AUTH_BASE: z.string().url(),
  LINE_API_BASE: z.string().url(),
  LINE_PROFILE_BASE: z.string().url(),
  LINE_ISSUER: z.string().url(),
}).superRefine((e, ctx) => {
  if (e.JWT_SECRET === e.STATE_SECRET) {
    ctx.addIssue({
      code: 'custom',
      message: 'JWT_SECRET and STATE_SECRET must be distinct',
      path: ['STATE_SECRET'],
    });
  }
});

export type Env = z.infer<typeof Schema>;
export function parseEnv(raw: Record<string, string | undefined>): Env {
  return Schema.parse(raw);
}
export const env: Env = parseEnv(process.env);
