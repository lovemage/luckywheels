# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install            # install deps
npm run dev            # vite dev server on http://127.0.0.1:5173
npm run build          # tsc (type-check) + vite build → dist/
npm run preview        # serve the built bundle on 127.0.0.1
```

No linter, no test runner. `playwright` is in `devDependencies` but no tests exist yet; running tests is not part of the pipeline. Type errors fail the build because `npm run build` runs `tsc` first.

Dev/preview hosts are pinned to `127.0.0.1` deliberately — do not change to `0.0.0.0` or expose externally without asking.

## Current state vs. target system

This repo is the **frontend prototype** of a larger product (`LINE 會員抽獎系統`). The shipped code is intentionally a single-page demo with mock data and an inline Admin pane; the real product is specified in:

- `docs/design-spec.md` — visual / UX specification (phone-first, 紫金色 lucky-wheel theme)
- `docs/fullstack-spec.md` — backend architecture, DB schema, API contracts, security rules

**Always read those two docs before making non-trivial changes.** They are the source of truth for what the product *should* be, even though much of the backend is not yet implemented. When the user says "Admin", "會員", "抽獎 API", "獎品", etc., the meaning is defined there — don't reinvent.

## Architecture

Tiny by design — everything user-facing lives in `src/App.tsx` (~530 lines) plus `src/styles.css`. There is no router, no state library, no API layer. Layout is a side-by-side `showcase`: phone shell on the left (`.phone-shell`), Admin Console on the right (`.admin-console`), sharing one `useState` tree.

A few things worth knowing before editing:

- **The wheel is two stacked layers.** `public/assets/wheel-frame.png` is the outer gold frame / bulbs / pointer and never rotates. Only the inner `.wheel` element rotates — it contains a CSS `conic-gradient` face (`wheelGradient()`) plus absolutely-positioned `.prize-label` nodes computed from `360 / prizes.length`. If you add prizes, both the gradient and the label angles update automatically; if you change the wheel image, the inner radius (`--label-radius` in CSS) is what keeps labels from clipping the frame.
- **The current `pickPrize()` is a placeholder.** `src/App.tsx:67` does client-side weighted random for demo purposes only. Per `docs/fullstack-spec.md`, in production the result MUST come from `POST /api/draw` and the frontend only animates to `prize.wheelPosition`. Do not build features that assume client-side determination of results.
- **`spinDurationMs` is hard-coded to 4300ms** in two places (`setTimeout` in `spin()` and matching CSS). The spec calls for this to be Admin-configurable via `app_settings` — if you touch the spin timing, change both sites and consider whether it should become a prop.
- **Prize ordering vs. weight are different concepts.** `weight` controls win probability; `wheelPosition` (not yet modelled in the prototype's `Prize` type — the prototype just uses array order) controls where on the wheel it appears. Don't conflate them when extending the Admin pane.
- **Asset convention.** Fixed visual assets go in `public/assets/` and are referenced as `/assets/foo.png`. Generated / draft / experimental PNGs (`prototype-*.png`, `視覺草稿.png`, `public/assets/*-key.png`, etc.) are gitignored — don't commit them.
- **Mobile-first frame.** The phone shell targets `430×932` and the design assumes a `390–430px` viewport for the phone column; the desktop layout shows phone + admin in parallel only as a development affordance, not the real Admin route.

## 報價單/

The `報價單/` directory holds a sales-quote HTML/PDF for the project. It is not part of the build and not referenced by app code — leave it alone unless the user specifically asks about pricing or the quote document.
