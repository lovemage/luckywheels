import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, Dispatcher } from 'undici';
import { SignJWT } from 'jose';
import { env } from '../../src/env.js';

export const MOCK_NONCE = 'mock-nonce-xyz';

let agent: MockAgent | null = null;
let original: Dispatcher | null = null;

async function mintIdToken(): Promise<string> {
  const secret = new TextEncoder().encode(env.LINE_CHANNEL_SECRET);
  return new SignJWT({ nonce: MOCK_NONCE, name: 'Mocked Member' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(env.LINE_ISSUER)
    .setAudience(env.LINE_CHANNEL_ID)
    .setSubject('U_mocked')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

export async function startMockLine(): Promise<void> {
  original = getGlobalDispatcher();
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);

  const tokenOrigin = new URL(env.LINE_API_BASE).origin;
  const profileOrigin = new URL(env.LINE_PROFILE_BASE).origin;

  // Pre-mint the id_token so the reply callback can stay synchronous.
  // undici 6.x's function-form reply does not await async callbacks: the
  // wrapper at mock-interceptor.js:123 destructures the return value
  // synchronously, so an async fn yields a Promise that fails validation.
  const idToken = await mintIdToken();

  agent.get(tokenOrigin).intercept({
    path: new URL(`${env.LINE_API_BASE}/token`).pathname,
    method: 'POST',
  }).reply((opts) => {
    const body = new URLSearchParams(opts.body as string);
    if (body.get('code') === 'bad_code') {
      return {
        statusCode: 400,
        data: JSON.stringify({ error: 'invalid_grant' }),
        responseOptions: { headers: { 'content-type': 'application/json' } },
      };
    }
    return {
      statusCode: 200,
      data: JSON.stringify({
        access_token: 'mock_access_token',
        expires_in: 2592000,
        id_token: idToken,
        refresh_token: 'mock_refresh',
        token_type: 'Bearer',
      }),
      responseOptions: { headers: { 'content-type': 'application/json' } },
    };
  }).persist();

  agent.get(profileOrigin).intercept({
    path: new URL(`${env.LINE_PROFILE_BASE}/profile`).pathname,
    method: 'GET',
  }).reply(200, {
    userId: 'U_mocked',
    displayName: 'Mocked Member',
    pictureUrl: 'https://profile.line/p.png',
  }).persist();
}

export function stopMockLine(): void {
  if (agent) agent.close();
  if (original) setGlobalDispatcher(original);
  agent = null;
  original = null;
}
