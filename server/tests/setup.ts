const defaults: Record<string, string> = {
  DATABASE_URL: 'postgresql://lucky:lucky@127.0.0.1:5433/luckywheels',
  PORT: '3001',
  PUBLIC_FRONTEND_ORIGIN: 'http://127.0.0.1:5173',
  JWT_SECRET: 'test-jwt-secret-must-be-at-least-32-chars-xxxx',
  STATE_SECRET: 'test-state-secret-distinct-from-jwt-32-chars-yy',
  JWT_ISSUER: 'luckywheels-test',
  JWT_AUDIENCE: 'luckywheels-test-aud',
  LINE_CHANNEL_ID: '1234567890',
  LINE_CHANNEL_SECRET: 'line-channel-test-secret-16char+',
  LINE_REDIRECT_URI: 'http://127.0.0.1:3001/api/auth/line/callback',
  LINE_AUTH_BASE: 'https://access.line.me/oauth2/v2.1',
  LINE_API_BASE: 'https://api.line.me/oauth2/v2.1',
  LINE_PROFILE_BASE: 'https://api.line.me/v2',
  LINE_ISSUER: 'https://access.line.me',
};
for (const [k, v] of Object.entries(defaults)) {
  if (process.env[k] === undefined) process.env[k] = v;
}
