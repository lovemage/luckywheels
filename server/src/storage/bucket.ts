import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../env.js';
import { AppError } from '../errors.js';

let client: S3Client | null = null;

interface BucketConfig {
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  region: string;
}

function resolveConfig(): BucketConfig {
  if (!env.BUCKET || !env.ACCESS_KEY_ID || !env.SECRET_ACCESS_KEY || !env.ENDPOINT) {
    throw new AppError(
      'BUCKET_NOT_CONFIGURED',
      'set BUCKET / ACCESS_KEY_ID / SECRET_ACCESS_KEY / ENDPOINT',
      500,
    );
  }
  return {
    bucket: env.BUCKET,
    accessKeyId: env.ACCESS_KEY_ID,
    secretAccessKey: env.SECRET_ACCESS_KEY,
    endpoint: env.ENDPOINT,
    region: env.REGION ?? 'auto',
  };
}

export function getClient(): S3Client {
  if (client) return client;
  const cfg = resolveConfig();
  client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: true,
  });
  return client;
}

/** Test-only: drops the memoized client so process.env overrides take effect. */
export function resetClientForTests(): void {
  client = null;
}

export interface UploadInput {
  key: string;
  body: Uint8Array | Buffer | Blob;
  contentType: string;
}

export interface ObjectData {
  body: unknown;
  contentType?: string | null;
  contentLength?: number | null;
}

export async function putObject(input: UploadInput): Promise<{ key: string; url: string }> {
  const c = getClient();
  const cfg = resolveConfig();
  await c.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: input.key,
      Body: input.body as unknown as Buffer,
      ContentType: input.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
  return { key: input.key, url: publicUrl(input.key) };
}

export async function getObject(key: string): Promise<ObjectData> {
  const c = getClient();
  const cfg = resolveConfig();
  const response = await c.send(
    new GetObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
    }),
  );
  return {
    body: response.Body,
    contentType: response.ContentType ?? null,
    contentLength: response.ContentLength ?? null,
  };
}

export async function deleteObject(key: string): Promise<void> {
  const c = getClient();
  const cfg = resolveConfig();
  await c.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

/**
 * Build the public URL for an object.
 *
 * Accepts optional explicit `endpoint` / `bucket` so unit tests can verify
 * URL-joining without depending on process.env (env.ts is eager-validated).
 */
export function publicUrl(
  key: string,
  opts?: { endpoint?: string; bucket?: string },
): string {
  const endpoint = opts?.endpoint ?? env.ENDPOINT;
  const bucket = opts?.bucket ?? env.BUCKET;
  if (!endpoint || !bucket) {
    throw new AppError('BUCKET_NOT_CONFIGURED', 'cannot compute URL', 500);
  }
  return `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`;
}
