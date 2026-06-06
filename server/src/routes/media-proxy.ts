import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { AppError } from '../errors.js';
import { env } from '../env.js';
import { getObject } from '../storage/bucket.js';

export const mediaProxyRoutes = new Hono();

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === '/') return '';
  return trimmed.replace(/\/+$/, '');
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array> {
  return !!(
    value != null &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
  );
}

function extractStorageKey(rawUrl: string): string {
  const cfg = env;
  if (!cfg.BUCKET || !cfg.ENDPOINT) {
    throw new AppError('MEDIA_PROXY_CONFIG', 'BUCKET / ENDPOINT are required for media proxy', 500);
  }
  const endpoint = new URL(cfg.ENDPOINT);

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(rawUrl);
  } catch {
    throw new AppError('MEDIA_PROXY_BAD_URL', 'invalid media URL', 400);
  }

  if (sourceUrl.protocol !== endpoint.protocol || sourceUrl.host !== endpoint.host) {
    throw new AppError('MEDIA_PROXY_FORBIDDEN', 'media proxy only allows configured storage endpoint', 403);
  }

  const endpointPrefix = `${normalizePath(endpoint.pathname)}/${cfg.BUCKET}`;
  if (!sourceUrl.pathname.startsWith(`${endpointPrefix}/`)) {
    throw new AppError('MEDIA_PROXY_FORBIDDEN', 'media proxy only allows configured storage bucket', 403);
  }

  const rawKey = sourceUrl.pathname.slice(`${endpointPrefix}/`.length);
  let key: string;
  try {
    key = decodeURIComponent(rawKey);
  } catch {
    throw new AppError('MEDIA_PROXY_BAD_URL', 'invalid encoded object key', 400);
  }
  if (!key) {
    throw new AppError('MEDIA_PROXY_BAD_URL', 'storage URL has no object key', 400);
  }
  return key;
}

async function objectBodyToBytes(body: unknown): Promise<Uint8Array> {
  if (body == null) {
    return new Uint8Array();
  }

  if (body instanceof Uint8Array) {
    return body;
  }

  if (typeof body === 'string') {
    return Buffer.from(body);
  }

  const maybe = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };
  if (typeof maybe.transformToByteArray === 'function') {
    return maybe.transformToByteArray();
  }
  if (typeof maybe.arrayBuffer === 'function') {
    const ab = await maybe.arrayBuffer();
    return new Uint8Array(ab);
  }

  if (body instanceof Readable || isAsyncIterable(body)) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      if (chunk && chunk.byteLength > 0) {
        chunks.push(Buffer.from(chunk));
      }
    }
    return chunks.length === 0 ? new Uint8Array() : Buffer.concat(chunks);
  }

  throw new AppError('MEDIA_PROXY_BODY', 'unsupported storage object body format', 500);
}

mediaProxyRoutes.get('/api/media-proxy', async (c) => {
  const source = c.req.query('url');
  if (!source) {
    throw new AppError('MEDIA_PROXY_BAD_URL', 'query param `url` is required', 400);
  }

  const key = extractStorageKey(source);
  let obj;
  try {
    obj = await getObject(key);
  } catch (err) {
    const anyErr = err as { name?: string };
    if (anyErr?.name === 'NoSuchKey' || anyErr?.name === 'NotFound') {
      throw new AppError('MEDIA_PROXY_NOT_FOUND', 'media object not found', 404);
    }
    throw err;
  }

  if (!obj.body) {
    throw new AppError('MEDIA_PROXY_NOT_FOUND', 'media object not found', 404);
  }

  const bytes = await objectBodyToBytes(obj.body);
  const headers = new Headers();
  headers.set('content-type', obj.contentType ?? 'application/octet-stream');
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  if (obj.contentLength != null) {
    headers.set('content-length', String(obj.contentLength));
  }

  return new Response(bytes, {
    status: 200,
    headers,
  });
});
