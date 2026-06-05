# Member Frontend Integration Plan

> **Execution:** Subagent-driven (small inline tasks for surgical edits, subagent dispatches for multi-file changes).

**Goal:** Convert `src/App.tsx` from a hardcoded-data prototype into the real LINE 會員抽獎前端 wired to the Hono backend. Reuse the existing wheel visuals; swap data and actions to backend calls.

**Architecture:**
- Same Vite + React 19 SPA at repo root (`src/`).
- Same `127.0.0.1:5173` dev server with Vite proxy `/api → http://127.0.0.1:3001` (so dev cookies share an origin).
- State machine via React state, no router (single page: login → onboarding → main). The wheel uses the existing visual layer; only the data/action layer changes.
- Win/result animations stay client-side; the *result* is server-authoritative.

**Tech additions:** zustand 5 for global session state, nothing else new.

**Out of scope:** LIFF integration, push notifications, in-app history (member-facing).

---

## Reference invariants from CLAUDE.md

- `/api/draw` is server-authoritative; client only animates to `prize.wheelPosition`.
- `spinDurationMs` comes from `/api/settings/public`, not hardcoded.
- Dev/preview hosts pin to `127.0.0.1`.
- Prizes are seeded server-side; client cannot add/remove them.

---

## File map

```
src/
  api/
    client.ts                       # new — fetch wrapper, ApiError, 401 handler
    me.ts                           # new — /api/me, /api/onboarding/profile
    draw.ts                         # new — /api/draw, /api/settings/public, /api/prizes/public
  state/
    session.ts                      # new — zustand store: { phase, me, refresh, clear }
  components/
    Login.tsx                       # new — LINE login splash
    Onboarding.tsx                  # new — nickname + code form
    Wheel.tsx                       # existing — small prop changes (already accepts prizes[])
    WinModal.tsx                    # new — extracted from current inline win panel
  hooks/
    useMe.ts                        # new — wraps the zustand session
  App.tsx                           # OVERHAULED — state machine + API wiring; removes prototype Admin pane
  styles.css                        # small additions (login splash, onboarding form)
public/assets/                      # unchanged (wheel-frame.png + lucky-logo)
server/
  src/routes/public.ts              # extend with GET /api/prizes/public
  tests/integration/public.test.ts  # extend with prize list assertions
vite.config.ts                      # add proxy /api → http://127.0.0.1:3001
```

---

## Task 1: Backend — `GET /api/prizes/public`

Public read of enabled prizes ordered by `wheelPosition`. Returns only visual fields (no `weight`, no `stock`, no internal flags except `isConsolation` for client highlighting).

**Files:**
- Modify: `server/src/routes/public.ts`
- Modify: `server/tests/integration/public.test.ts`

**Backend response shape:**
```json
{
  "items": [
    {
      "id": "...",
      "rankLabel": "頭獎",
      "name": "最高彩金",
      "description": null,
      "imageUrl": null,
      "wheelPosition": 0,
      "segmentColor": "#d92b3a",
      "textColor": "#fff5d6",
      "cashAmount": 10000,
      "isConsolation": false
    }
  ]
}
```

Order by `wheelPosition asc`. Filter `enabled = true`.

**Test additions** (append to existing `public.test.ts`):
```ts
it('GET /api/prizes/public returns enabled prizes ordered by wheelPosition', async () => {
  // seed sets 6 prizes; assert all 6 returned, ordered, with expected fields
  const r = await app.request('/api/prizes/public');
  expect(r.status).toBe(200);
  const body = await r.json();
  expect(body.items).toHaveLength(6);
  expect(body.items[0].wheelPosition).toBe(0);
  expect(body.items[5].wheelPosition).toBe(5);
  expect(body.items[0]).not.toHaveProperty('weight');
  expect(body.items[0]).not.toHaveProperty('stock');
});
```

Commit: `feat(server): GET /api/prizes/public for member frontend wheel`

---

## Task 2: Frontend — API client + Vite proxy

**Files:**
- Modify: `vite.config.ts` (add `server.proxy['/api'] = 'http://127.0.0.1:3001'`)
- Create: `src/api/client.ts`

Vite config change:
```ts
server: {
  host: '127.0.0.1',
  port: 5173,
  proxy: { '/api': 'http://127.0.0.1:3001' },
},
```

`src/api/client.ts`:
```ts
export class ApiError extends Error {
  constructor(public code: string, public override message: string, public status: number) {
    super(message);
  }
}

let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  unauthorizedHandler = fn;
}

export async function api<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(input, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 401) {
    unauthorizedHandler?.();
    const body = await res.json().catch(() => null) as { error?: { code: string; message: string } } | null;
    throw new ApiError(body?.error?.code ?? 'UNAUTHENTICATED', body?.error?.message ?? 'login required', 401);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: { code: string; message: string } } | null;
    throw new ApiError(body?.error?.code ?? 'INTERNAL', body?.error?.message ?? 'request failed', res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
```

Commit: `feat(web): API client + Vite proxy for backend`

---

## Task 3: Frontend — session store + typed endpoints

**Files:**
- Create: `src/state/session.ts`
- Create: `src/api/me.ts`
- Create: `src/api/draw.ts`
- Create: `src/hooks/useMe.ts`

`src/state/session.ts` (zustand):
```ts
import { createStore } from 'zustand/vanilla';
import { useSyncExternalStore } from 'react';

export type Phase = 'loading' | 'anonymous' | 'onboarding' | 'ready' | 'blacklisted';

export interface MeProfile {
  id: string;
  lineUserId: string;
  displayName: string;
  pictureUrl: string | null;
  vipLevel: number;
  points: number;
  accountType: 'verified' | 'test' | 'blacklisted';
  nickname: string | null;
  entertainmentMemberCode: string | null;
}

interface SessionState {
  phase: Phase;
  me: MeProfile | null;
  setLoading(): void;
  setAnonymous(): void;
  setMe(me: MeProfile): void;
}

function derivePhase(me: MeProfile): Phase {
  if (me.accountType === 'blacklisted') return 'blacklisted';
  if (!me.nickname || !me.entertainmentMemberCode) return 'onboarding';
  return 'ready';
}

const store = createStore<SessionState>((set) => ({
  phase: 'loading',
  me: null,
  setLoading: () => set({ phase: 'loading' }),
  setAnonymous: () => set({ phase: 'anonymous', me: null }),
  setMe: (me) => set({ phase: derivePhase(me), me }),
}));

export const sessionStore = store;
```

`src/api/me.ts`:
```ts
import { api } from './client.js';
import type { MeProfile } from '../state/session.js';

export function fetchMe(): Promise<MeProfile> {
  return api<MeProfile>('/api/me');
}

export function submitOnboarding(body: { nickname: string; code: string }): Promise<{ nickname: string; entertainmentMemberCode: string }> {
  return api('/api/onboarding/profile', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function logout(): Promise<void> {
  return api('/api/logout', { method: 'POST' });
}
```

`src/api/draw.ts`:
```ts
import { api } from './client.js';

export interface PublicPrize {
  id: string;
  rankLabel: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  wheelPosition: number;
  segmentColor: string;
  textColor: string;
  cashAmount: number;
  isConsolation: boolean;
}

export interface PublicSettings {
  spinDurationMs: number;
  pointThresholds: { points: number; draws: number }[];
}

export function fetchPrizes(): Promise<{ items: PublicPrize[] }> {
  return api('/api/prizes/public');
}

export function fetchSettings(): Promise<PublicSettings> {
  return api('/api/settings/public');
}

export interface DrawResponse {
  redemption: { id: string; code: string; status: string; totalWinAmount: number };
  draws: {
    drawLogId: string;
    subIndex: number;
    prize: { id: string; rankLabel: string; name: string; description: string | null; imageUrl: string | null; wheelPosition: number };
    winningCashAmount: number;
    gatedBy: string | null;
  }[];
  points: number;
  tier: 'single' | 'multi';
  tierDraws: number;
  isTest: boolean;
}

export function postDraw(tier: 'single' | 'multi'): Promise<DrawResponse> {
  return api('/api/draw', {
    method: 'POST',
    body: JSON.stringify({ tier }),
  });
}
```

`src/hooks/useMe.ts`:
```ts
import { useSyncExternalStore } from 'react';
import { sessionStore } from '../state/session.js';

export function useSession() {
  const state = useSyncExternalStore(
    sessionStore.subscribe,
    () => sessionStore.getState(),
  );
  return state;
}
```

Add `zustand` to root `package.json` deps. Then `npm install`.

Commit: `feat(web): session store + typed API endpoints (me, draw, prizes, settings)`

---

## Task 4: Frontend — Login splash

**Files:**
- Create: `src/components/Login.tsx`

Renders when `phase === 'anonymous'`. Single button: "用 LINE 登入" — clicking sets `window.location.href = '/api/auth/line/start'` so the cookie set by the callback lands on this origin (Vite proxy makes them same-origin).

```tsx
export function Login() {
  return (
    <main className="login-splash">
      <img src="/assets/wheel-frame.png" alt="" className="login-decoration" aria-hidden />
      <h1>幸運轉盤</h1>
      <p>請使用 LINE 帳號登入</p>
      <button
        className="login-button"
        onClick={() => { window.location.href = '/api/auth/line/start'; }}
      >
        用 LINE 登入
      </button>
    </main>
  );
}
```

CSS additions (in `styles.css`):
```css
.login-splash { display: grid; place-items: center; min-height: 100vh; gap: 16px; }
.login-button { background: #06c755; color: #fff; padding: 12px 32px; border-radius: 8px; border: 0; font-size: 16px; }
```

Commit: `feat(web): LINE login splash`

---

## Task 5: Frontend — Onboarding form

**Files:**
- Create: `src/components/Onboarding.tsx`

Renders when `phase === 'onboarding'`. Two inputs (暱稱 2-12 chars, 娛樂城會員編號 6-20 chars [A-Za-z0-9_-]). Submit calls `submitOnboarding`. On success, re-fetch `/api/me` and update store. On 400 NICKNAME_INVALID / ENTERTAINMENT_CODE_INVALID / 409 ENTERTAINMENT_CODE_TAKEN, show inline errors.

```tsx
import { useState } from 'react';
import { submitOnboarding, fetchMe } from '../api/me.js';
import { ApiError } from '../api/client.js';
import { sessionStore } from '../state/session.js';

export function Onboarding() {
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await submitOnboarding({ nickname, code });
      const me = await fetchMe();
      sessionStore.getState().setMe(me);
    } catch (e) {
      const ae = e as ApiError;
      const map: Record<string, string> = {
        NICKNAME_INVALID: '暱稱需為 2-12 字',
        ENTERTAINMENT_CODE_INVALID: '會員編號需為 6-20 字（英數字 _ -）',
        ENTERTAINMENT_CODE_TAKEN: '此會員編號已被綁定',
        ENTERTAINMENT_CODE_REASON_REQUIRED: '系統錯誤，請聯絡客服',
      };
      setErr(map[ae.code] ?? ae.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding">
      <h1>完成註冊</h1>
      <p>請填寫您的暱稱與娛樂城會員編號以開始抽獎</p>
      <form onSubmit={submit}>
        <label>
          暱稱
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} required minLength={2} maxLength={12} />
        </label>
        <label>
          娛樂城會員編號
          <input value={code} onChange={(e) => setCode(e.target.value)} required pattern="[A-Za-z0-9_-]{6,20}" />
        </label>
        {err && <p role="alert" className="error">{err}</p>}
        <button type="submit" disabled={busy}>{busy ? '送出中…' : '確定送出'}</button>
      </form>
    </main>
  );
}
```

CSS additions:
```css
.onboarding { max-width: 360px; margin: 24px auto; padding: 16px; }
.onboarding form { display: flex; flex-direction: column; gap: 12px; }
.onboarding label { display: flex; flex-direction: column; gap: 4px; }
.onboarding .error { color: #c00; }
```

Commit: `feat(web): onboarding form for nickname + entertainment code`

---

## Task 6: Frontend — Overhaul `App.tsx`

The big one. Replace the prototype state with:
- Initial mount: `fetchMe()` → on success `setMe`; on 401 `setAnonymous`; on error: also anonymous.
- Render based on `session.phase`:
  - `loading` → spinner
  - `anonymous` → `<Login />`
  - `onboarding` → `<Onboarding />`
  - `blacklisted` → static "帳號已停用" page with logout
  - `ready` → main wheel UI

Wire 401 handler: `setUnauthorizedHandler(() => sessionStore.getState().setAnonymous())`.

In the main wheel UI:
- On mount, also fetch `fetchPrizes()` + `fetchSettings()`. Cache in React state (no need for Tanstack Query here — small surface).
- Render wheel using fetched prizes (replace `PRIZES` constant).
- `spinDurationMs` from settings drives BOTH the CSS transition timing AND the `setTimeout` for showing the win modal.
- Two CTA buttons (single / multi): click → `postDraw(tier)`. Disable while spinning.
- On 200: animate wheel to `response.draws[0].prize.wheelPosition`. After spinDurationMs, show `<WinModal />` with all sub-draws + redemption code + totalWinAmount.
- On 422 INSUFFICIENT_POINTS: toast/inline error.
- On 403 ONBOARDING_REQUIRED: re-fetch me to swap phase.
- On 403 USER_BLACKLISTED: re-fetch me; phase → blacklisted.

REMOVE from current App.tsx:
- The Admin Console JSX block (the right-hand `.admin-console`).
- The `PRIZES` constant.
- The `pickPrize()` function.
- The hardcoded `POINT_THRESHOLDS` (use `settings.pointThresholds`).
- The fake `points` initial state.

KEEP:
- The wheel layout / `wheelGradient()` helper.
- The CSS class structure (`.phone-shell`, `.wheel`, `.prize-label`).
- The 4300ms in CSS — but make it a CSS custom property `--spin-duration` set from settings in JS via inline style.

Commit: `feat(web): wire member frontend to backend (real draw + login + onboarding)`

---

## Task 7: Frontend — `<WinModal />` component

Extracted from the prototype's inline win panel; supports both single (1 prize) and multi (10 prizes).

```tsx
import type { DrawResponse } from '../api/draw.js';

export function WinModal({ result, onClose }: { result: DrawResponse; onClose: () => void }) {
  return (
    <div className="win-modal-backdrop" onClick={onClose}>
      <div className="win-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{result.tier === 'multi' ? '10 連抽結果' : '中獎了！'}</h2>
        <p className="redemption-code">兌換碼：LW-{result.redemption.code}</p>
        <p className="redemption-total">總中獎金額：{result.redemption.totalWinAmount}</p>
        {result.tier === 'single' ? (
          <div className="win-single">
            <strong>{result.draws[0].prize.rankLabel}</strong>
            <span>{result.draws[0].prize.name}</span>
            <span>{result.draws[0].winningCashAmount}</span>
          </div>
        ) : (
          <ol className="win-multi-list">
            {result.draws.map((d) => (
              <li key={d.subIndex}>
                <span>#{d.subIndex + 1}</span>
                <span>{d.prize.rankLabel}</span>
                <span>{d.winningCashAmount}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="hint">請將兌換碼截圖傳送給客服以進行領取。</p>
        <button onClick={onClose}>關閉</button>
      </div>
    </div>
  );
}
```

CSS additions:
```css
.win-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: grid; place-items: center; z-index: 1000; }
.win-modal { background: #fff5d6; color: #2a1430; padding: 24px; border-radius: 12px; min-width: 280px; max-width: 360px; max-height: 80vh; overflow-y: auto; }
.redemption-code { font-family: monospace; font-size: 18px; background: #fff; padding: 4px 8px; border-radius: 4px; display: inline-block; }
.win-multi-list { list-style: none; padding: 0; }
.win-multi-list li { display: grid; grid-template-columns: 32px 80px 1fr; padding: 4px 0; border-bottom: 1px solid rgba(0,0,0,0.1); }
```

Commit: `feat(web): WinModal component (single + multi)`

---

## Task 8: Smoke verification

Run both dev servers + verify the flow manually:

```bash
# terminal 1
cd server && npm run dev
# terminal 2
npm run dev
```

Note: LINE OAuth requires real LINE credentials in `server/.env` to complete callback — for environments without those, document the limitation and use the `admin:create` CLI + a manual `POST /api/auth/line/start` mock to exercise the rest.

Verify:
- Visiting `/` with no session shows the Login splash.
- Login redirects to `https://access.line.me/oauth2/v2.1/authorize` (the URL in 302 Location).
- After backend callback completes (or manually setting a session cookie), `/` shows the Onboarding form when nickname/code are unset.
- After onboarding, the wheel renders with the seeded 6 prizes.
- Clicking 抽獎 (single) sends `POST /api/draw {tier:'single'}` and animates to the returned wheelPosition.
- WinModal shows the prize + redemption code.
- Clicking 連抽 (multi) animates once and shows 10-result list.
- Points decrement correctly between draws.

Commit any tweaks found; no commit required if everything passes.

---

## Out of scope (deferred for future)

- Result history view for the member
- Push notifications
- LIFF deep linking
- Toast / snackbar component (errors render inline for now)
- Account deletion / unlinking
- Display of `vipLevel` (rendered but not styled)
