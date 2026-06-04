# Admin 後台模組設計 (Brainstorm Spec)

> **Status:** Design approved 2026-06-04, ready for plan generation.
> **Plan split decision:** Two implementation plans — Plan 1 (Foundation + A + E, 22 tasks) and Plan 2 (B + C + D, 16 tasks).
> **Reference:** `docs/fullstack-spec.md` (schema + API contracts), `docs/design-spec.md` (UI principles), `docs/plans/2026-06-03-backend-core.md` (backend core dependency).

---

## 1. Goal & Context

Implement the Lucky Wheels Admin web console: an operator-facing dashboard that manages members, redemption history, prize catalog, game rules, bottom-tab settings, frontend templates, and system audit logs. The console runs on the same Hono server as the member-facing API, mounted at `/admin/*`, and connects to the same Postgres database the backend-core plan stands up.

This design closes the "all 5 modules deferred to Admin plan" gap in `docs/plans/2026-06-03-backend-core.md`. After implementation, operators no longer touch the database directly to dispatch points, mark Redemption codes as delivered, or change game rules.

---

## 2. Architecture Decisions

### 2.1 Locked-in tech stack

| Layer | Decision | Why |
|---|---|---|
| Server runtime | Same Hono server as backend-core | Single deploy, shared `prisma` client, shared `writeAdminActionLog` helper from Task 6 |
| Admin UI | React SPA in `server/admin-ui/`, built with Vite (`base: '/admin/'`), served via Hono `serveStatic` at `/admin/*` (catch-all → `index.html`) | Avoids second deploy target; keeps SPA cleanly isolated from the member-facing prototype |
| Auth model | Email + password (NO LINE login for admins) | Admins are internal staff, separate from members; passwordHash already in `admin_users` schema |
| Session token | JWT in `lw_admin_session` cookie, distinct secret `ADMIN_JWT_SECRET`, 7-day expiry | Separate cookie name so admin and member sessions don't conflict; 7d < member's 14d because admin is higher-value target |
| Role enforcement | None in MVP — any authenticated admin can do anything | `admin_users.role` field kept in schema for forward compat; future role-tier plan |
| Admin bootstrap | CLI: `npm run admin:create -- --email X --password Y` | Explicit, repeatable, no boot-time magic, supports password reset |
| File storage | `TemplateStorage` interface + `LocalDiskStorage` adapter writing to `server/uploads/templates/<slot>/` and `server/uploads/prizes/<id>.<ext>` | Works on Railway / single-instance now; swap to S3 by adding a second adapter when needed |

### 2.2 Audit attribution

All write endpoints call `audit(c, { event, targetType, targetId, payloadBefore, payloadAfter, note })` which auto-fills `adminUserId / ip / userAgent` from the request context. Audit row is written **in the same transaction** as the business mutation — never split.

Event taxonomy:
```
user.account_type_changed
user.blacklist_set
user.blacklist_cleared
user.points_topup
user.points_deduct
user.entertainment_code_rebound
user.test_settings_changed
prize.created
prize.updated
prize.disabled
prize.image_uploaded
settings.point_thresholds_updated
settings.spin_params_updated
settings.cost_gate_updated
settings.consolation_prize_changed
redemption.status_changed
bottom_tabs.updated
template.uploaded
template.activated
admin.password_changed
admin.login_succeeded
admin.login_failed
```

### 2.3 Login flow

- `POST /api/admin/auth/login { email, password }` → 200 + cookie, or 401 `BAD_CREDENTIALS` (same error for "no such email" and "wrong password")
- Failed login still writes `admin.login_failed` audit (no payload values beyond the email attempted, for brute-force visibility)
- Per-IP rate limit: 5 failures / minute → 429, in-memory bucket (no Redis dependency for MVP)
- Password hash: bcrypt cost 12

### 2.4 Global 401 frontend behavior

When any admin API call returns 401, the SPA shows a centered modal "請先登入" with a single confirm button. Confirm → clears local query cache, redirects to `/admin/login`. Implemented via a fetch wrapper / React Query interceptor; no per-page handling.

### 2.5 Out of scope (deferred to future plans)

- 2FA (TOTP, WebAuthn)
- Role tiers (`super / operator / viewer` enforcement)
- Password reset for OTHER admins
- Admin login via LINE OAuth
- CSV export of audit logs / draw history
- Real-time streaming / WebSocket
- S3-compatible template storage
- Multi-tenant / multi-site

---

## 3. URL Routing & API Surface

### Member-facing (existing, unchanged)
```
GET  /                            member prototype / SPA
GET  /api/auth/line/start
GET  /api/auth/line/callback
GET  /api/me
POST /api/logout
POST /api/onboarding/profile     // nickname + entertainmentMemberCode atomic
POST /api/draw
GET  /api/settings/public
```

### Admin SPA
```
GET  /admin/*                    serveStatic Admin SPA bundle (catch-all → /admin/index.html)
GET  /api/admin/health           ping endpoint (no auth)
```

### Admin Auth
```
POST /api/admin/auth/login
POST /api/admin/auth/logout
GET  /api/admin/me
```

### Module A — Members + Redemptions
```
GET    /api/admin/users                              list + pagination + filters
GET    /api/admin/users/:id
PATCH  /api/admin/users/:id/account-type
PATCH  /api/admin/users/:id/test-settings
PATCH  /api/admin/users/:id/blacklist
PATCH  /api/admin/users/:id/entertainment-code       admin override (rebind)
POST   /api/admin/users/:id/points                   { delta, note } — sign signals topup/deduct
GET    /api/admin/users/:id/draw-history

GET    /api/admin/redemptions                        list + filter (code / user / status / dates / isTest)
GET    /api/admin/redemptions/:id                    detail + sub-draws
PATCH  /api/admin/redemptions/:id/status             { status, cancelReason? }
```

### Module B — Game Rules
```
GET    /api/admin/prizes
POST   /api/admin/prizes
PATCH  /api/admin/prizes/:id
DELETE /api/admin/prizes/:id                         soft disable (toggles enabled=false); never hard-delete (FK from draw_logs)
POST   /api/admin/prizes/:id/image                   multipart upload

GET    /api/admin/settings                           dump of all admin-editable settings
PATCH  /api/admin/settings/thresholds                pointThresholds row editor
PATCH  /api/admin/settings/spin                      spinDurationMs / spinExtraTurns / spinEasing
PATCH  /api/admin/settings/gates                     minDrawsBeforeWin / cooldownDrawsAfterWin / payoutCapEnabled / payoutCapRatio
PATCH  /api/admin/settings/consolation               consolationPrizeId (validates target prize.isConsolation = true)
```

### Module C — Bottom Tabs
```
GET    /api/admin/bottom-tabs
PATCH  /api/admin/bottom-tabs                        batch update (all 4 rows)
```

### Module D — Templates
```
GET    /api/admin/templates                          list all slots + history
POST   /api/admin/templates/:slot                    multipart upload; slot ∈ {background, logo, wheel_frame}
PATCH  /api/admin/templates/:slot/active             switch active version (rollback)
```

### Module E — System
```
PATCH  /api/admin/me/password                        currentPassword + newPassword
GET    /api/admin/action-logs                        cursor pagination + filters
```

### SPA route map
```
/admin/login
/admin/                          dashboard (system totals cards + module shortcuts)
/admin/users                     members list (verified / test tabs)
/admin/users/:id                 member detail + sub-tabs
/admin/redemptions               redemption list
/admin/redemptions/:id           redemption detail + sub-draws
/admin/prizes                    prize list (inline edit)
/admin/prizes/:id                prize editor + image upload
/admin/settings                  game rules (4 cards, independent save buttons)
/admin/pages                     bottom tabs editor
/admin/templates                 template upload + history per slot tab
/admin/profile                   change password
/admin/logs                      action logs viewer
```

---

## 4. Module Scopes (MVP IN / OUT)

### A. Members + Redemptions

**IN:**
- List with `[正式會員 | 測試會員]` tab. Blacklisted users stay in their original tab with red badge + grey row.
- Column set: avatar / nickname / LINE displayName / entertainmentMemberCode / accountType badge / points / lifetimeDrawCount / lastDraw / actions
- Row actions: detail / ±points / change accountType / blacklist on-off / rebind entertainment code
- Search input matches across: nickname / LINE displayName / lineUserId substring / entertainmentMemberCode prefix / Redemption code (exact match jumps to redemption detail)
- Member detail page: metadata + edit button, test-settings block (only for `test` accounts), sub-tabs `[抽獎歷史 | 積分流水 | 黑名單歷史]`
- Redemption list with filters: code (exact) / member (autocomplete) / status / date range / isTest toggle
- Code displayed as copy-chip (operators view on phone, copy reduces typing errors)
- Status switch modals:
  - `pending → delivered`: confirm wording "已派送後不能再回 pending"
  - `pending → cancelled`: cancelReason required
  - `delivered → cancelled`: cancelReason required + double confirm "業主已收到彩金，確定取消？"
- All write actions write `admin_action_logs` rows with payloadBefore/After

**OUT:**
- Bulk operations
- CSV export
- Advanced filters (geo / VIP tier / leaderboard rank)

### B. Game Rules

**IN:**
- Prize list with inline-edit cells; drag handles for sortOrder / wheelPosition
- New prize via inline row (not modal)
- Disable toggle (never hard delete because draw_logs FK)
- Per-prize image upload via inline click (uses TemplateStorage adapter, writes to `server/uploads/prizes/`)
- Settings page with 4 independent cards (thresholds / spin / cost gates / consolation), each with its own save button
- Thresholds card uses row editor (not raw JSON); backend enforces strictly-increasing points and draws
- Footnote per card: "上次由 X 在 Y 修改 [查 audit log]" linking to `/admin/logs?event=settings.<key>`
- consolation_prize_id change validated against `prize.isConsolation = true`

**OUT:**
- Bulk import
- Settings diff preview before save
- Real-time payout-cap dashboard (lives in module E logs viewer for now)

### C. Bottom Tabs

**IN:**
- 4 fixed rows (keys `wheel / ranking / rules / mine`) with label / iconName / sortOrder / visible
- iconName dropdown shows lucide icon previews
- Single batch save button; backend writes transactionally + one `bottom_tabs.updated` audit with array diff

**OUT:**
- Adding new tabs (key bound to frontend route)
- Role / accountType visibility

### D. Templates

**IN:**
- Tabs `[background | logo | wheel_frame]`
- Three areas per slot: current active card (thumbnail + spec + uploader), dropzone with inline "current dev template spec reminder", history grid with rollback button
- Dropzone spec reminder always shows: `background 1080×1920 PNG ≤2MB`, `logo 720×480 transparent PNG ≤800KB`, `wheel_frame 1254×1254 PNG ≤2MB`
- Upload → confirm modal "set as active now?" → `template.activated` or just `template.uploaded`
- `wheel_frame` slot extra validation: must be square; other slots width/height ±20%
- LocalDiskStorage writes to `server/uploads/templates/<slot>/<id>.<ext>`

**OUT:**
- Image crop / resize
- Template packs (bundled multi-slot upload)
- Conditional templates (seasonal switching)

### E. System

**IN:**
- Change password form: currentPassword + newPassword + confirm; success shows "請重新登入" modal → cookie clear → redirect to `/admin/login`
- Display `passwordChangedAt`, `lastLoginAt`
- Action logs viewer with filter row (adminUserId / event / targetType / dateRange) and a member-search field (nickname / lineUserId / Redemption code) that navigates to the relevant member or redemption page
- Row expansion shows `payloadBefore` / `payloadAfter` JSON diff
- IP and userAgent shown but folded by default
- Cursor pagination `?after=createdAt&take=25`; no offset pagination

**OUT:**
- Reset other admins' passwords
- Real-time updates / WebSocket
- CSV export

---

## 5. UI Patterns

### Confirmation modals (consistent across modules)

| Action | Modal type | Required fields |
|---|---|---|
| ±points (deduct) | Two-step confirm | amount + note + "X points: A → B" preview |
| ±points (topup) | Single confirm | amount + note |
| Blacklist on | Single confirm | reason |
| Blacklist off | Single confirm | (no reason needed) |
| Change accountType (verified → test) | Single confirm | warns testSkipCost / testForcePrizeId reset |
| Rebind entertainment code | Single confirm | new code + reason; backend 409 surfaced as inline red |
| Redemption status pending → delivered | Single confirm | "後續不可回 pending" warning |
| Redemption status → cancelled (from pending) | Single confirm | cancelReason |
| Redemption status delivered → cancelled | Double confirm | cancelReason + "業主已收到彩金，確定取消？" |
| Disable prize | Single confirm | warns "不會刪除歷史紀錄" |
| Template upload | Single confirm | "set as active now?" choice |
| Template rollback | Single confirm | thumbnail preview + "目前生效版本將被取代" |
| Password change success | Information modal | "請重新登入" + redirect |

### Audit log capture points

Every modal's confirm handler calls `audit(c, {...})` with payloadBefore from `prisma.findUnique` before the mutation, and payloadAfter from the updated row.

### Component inventory

```
admin-ui/src/components/
  Table.tsx             generic data table with sort / select / row actions
  Modal.tsx             base modal
  SessionExpiredModal.tsx
  ConfirmModal.tsx      reusable confirm with optional reason input
  DoubleConfirmModal.tsx
  StatusBadge.tsx       Redemption status badge with color mapping
  AccountTypeBadge.tsx
  CodeChip.tsx          copy-to-clipboard chip for Redemption codes
  PointDelta.tsx        signed-amount display (+50 / -30)
  JsonDiff.tsx          for action-logs payload diff (react-json-view based)
  IconPicker.tsx        lucide icon dropdown for bottom-tabs editor
  Dropzone.tsx          drag-drop with spec reminder
  HistoryThumbnailGrid.tsx
```

---

## 6. Plan Split

Two implementation plans, both following the backend-core plan's TDD-per-task convention.

### Plan 1 — Admin Foundation + Module A + Module E (22 tasks)

**Rationale:** This stack gives the business team the daily-ops surface. Without B/C/D, the wheel still works (defaults stand), but operators can:
- Handle Redemption code claims (mark delivered)
- Dispatch points
- Blacklist abusive accounts
- See audit history of everything that happened

**Tasks:**

1. admin-ui Vite scaffold + Hono `/admin/*` serveStatic + dev-mode CORS
2. admin session JWT sign/verify with `ADMIN_JWT_SECRET`
3. `requireAdmin` middleware + login rate limit + `audit(c, ...)` attribution helper
4. `POST /api/admin/auth/login` + logout + `GET /api/admin/me` (incl. `admin.login_failed` audit)
5. AppShell + sidebar + global 401 modal + auth guard
6. CLI `npm run admin:create`
7. `GET /api/admin/users` (paginate + filter) + list UI with tabs
8. `GET /api/admin/users/:id` + detail page
9. `POST /api/admin/users/:id/points` + ±points modal
10. `PATCH /api/admin/users/:id/account-type` + modal
11. `PATCH /api/admin/users/:id/test-settings`
12. `PATCH /api/admin/users/:id/blacklist` + reason modal
13. `PATCH /api/admin/users/:id/entertainment-code` (admin override)
14. `GET /api/admin/users/:id/draw-history` + sub-tab UI
15. `GET /api/admin/redemptions` + list filter UI
16. `GET /api/admin/redemptions/:id` + detail + sub-draws
17. `PATCH /api/admin/redemptions/:id/status` + status modals
18. `PATCH /api/admin/me/password` + form
19. `GET /api/admin/action-logs` (cursor + filters) + list UI
20. Member / Redemption / code search component
21. Full suite smoke
22. Production build wiring (CORS, cache headers, vite preview verification)

### Plan 2 — Admin Modules B + C + D (16 tasks)

**Rationale:** Once Plan 1 is live, settings / pages / templates change relatively rarely. Splitting here lets Plan 1 ship without waiting on the image upload story.

**Tasks:**

23. `GET /api/admin/prizes` + inline-edit list
24. `POST /api/admin/prizes` (new inline row)
25. `PATCH /api/admin/prizes/:id`
26. Disable toggle (soft)
27. `POST /api/admin/prizes/:id/image` + multipart upload using TemplateStorage adapter
28. `GET /api/admin/settings` dump
29. `PATCH /api/admin/settings/thresholds` + row editor + validations
30. `PATCH /api/admin/settings/spin`
31. `PATCH /api/admin/settings/gates`
32. `PATCH /api/admin/settings/consolation`
33. `GET /api/admin/bottom-tabs`
34. `PATCH /api/admin/bottom-tabs` + drag UI
35. `TemplateStorage` interface + `LocalDiskStorage`
36. `GET /api/admin/templates` + per-slot UI
37. `POST /api/admin/templates/:slot` + validation + dropzone
38. `PATCH /api/admin/templates/:slot/active` + rollback grid

Plan 2 depends on Plan 1's `requireAdmin` middleware + audit helper + AppShell scaffolding. Plan 2 can also be sliced further into B / C / D if appetite changes — the modules don't depend on each other.

---

## 7. Open Questions / Decisions Surfaced

These were explicitly decided during brainstorming; recording them so future plans inherit context without re-deciding:

- **Admin uses email + password, not LINE OAuth.** Members are LINE-only; admins are internal staff (separate auth surface).
- **No role tiers in MVP.** Schema keeps `role` enum for future expansion; middleware only checks "is authenticated admin."
- **First admin via CLI** (`npm run admin:create`). No env-var auto-bootstrap; no migration seed defaults.
- **Template storage is local disk for MVP**, behind a `TemplateStorage` interface so an S3 adapter is a single-file addition later.
- **Prize images use the same storage adapter** as templates (different directory). One mental model, one upload code path.
- **Audit + business mutation in same tx**, always. No exceptions for "minor" actions.
- **401 from API is treated globally** by the SPA with a modal + redirect; no per-page 401 handling.
- **Member-search field on the logs page** is a navigation aid only — typing a Redemption code jumps to `/admin/redemptions/:id`; typing a nickname / lineUserId jumps to `/admin/users/:id`. It doesn't filter the logs table itself.
- **Multi-tier cooldown (carried from backend-core decision):** the Admin UI exposes the raw `cooldownDrawsAfterWin` integer. No UI affordance for "this multi-draw will skip the cooldown window" educational text — operators are expected to understand the semantics from spec.
- **Test draws are visible** in `/admin/users/:id/draw-history` and `/admin/redemptions?isTest=true`, but the default redemption list filter is `isTest=false` to keep daily ops focused on real draws.

---

## 8. Spec Self-Review (per brainstorming skill)

- **Placeholder scan:** no TBD / TODO / "implement later"; every cell in MVP IN/OUT and every API row is concrete.
- **Internal consistency:** route map (section 3) matches module scope (section 4) matches plan task list (section 6). Spot-checked: `PATCH /api/admin/redemptions/:id/status` shows up in section 3, section 4 (A IN), and Plan 1 task 17.
- **Scope check:** confirmed two-plan split is sensible at this granularity. Plan 1 stands alone as deployable; Plan 2 augments without breaking Plan 1.
- **Ambiguity check:** "rebind entertainment code" had two reasonable interpretations (Admin always overrides? Or member-initiated with admin signoff?) — resolved as "Admin overrides directly via `PATCH /api/admin/users/:id/entertainment-code`, member cannot self-rebind" (section 4 A IN, section 7).
