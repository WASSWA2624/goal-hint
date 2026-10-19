# 057 Owner admin foundation

**Feature:** A private, phone-first `/admin` shell behind the existing analytics owner login, with shared private HTTP helpers, one admin guard, a structural route-guard test and every private exclusion point.

**Depends on:** Phase 0 (specification version 1.9 and the 057–067 section of [000-index.md](000-index.md)); the existing first-party analytics owner login (`src/server/analytics/`); [042-seo-discovery.md](042-seo-discovery.md) for robots and proxy rules.

**Source:** [App specification](../app-write-up.md), sections 1 and 13 (version 1.9 paid access); [monetization plan](../prompts/monetization.md), sections 3 (owner auth), 5.2 (shared helpers), 5.6 (owner auth, private exclusion points), 8 (057) and 9 (route guards).

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing code before implementing this feature. Build the owner foundation only: no member tables, settings, sign-in or payment features.

- **Shared helpers.** Move `readCookie`, `cookie` (gains `sameSite`; analytics stays Strict), `isSameOrigin`, `clientAddress`, `readLimitedBody` (gains a deadline), `privateHeaders`, `json`, `empty` and `redirect` from `src/server/analytics/analytics-http.ts` to `src/server/http/private-http.ts`. `analytics-http.ts` re-exports them, so analytics behaviour does not change.
- **Owner auth.** `src/server/admin/owner-auth.ts` wraps `getAnalyticsServices().auth` and `requireAdmin`. `src/server/admin/admin-http.ts` holds the one guard: an owner session, plus `isSameOrigin` for every POST. Every `/admin` page and `/api/admin` route except login uses it.
- **Login and logout.** `createLoginHandler` and `createLogoutHandler` (`analytics-http.ts:161,189`) gain a fixed `home` option and an audit callback (058 connects the audit writer). Mount them at `/api/admin/login` and `/api/admin/logout`. `AnalyticsLogin` (`src/components/analytics/dashboard/analytics-login.tsx:28,33`) takes `action` and `title` ("Owner sign-in" on `/admin`), and its small print (line 38) describes the new throttle. Its fields keep the `username` and `current-password` autocomplete.
- **Throttle and verify.** In `analytics-auth.ts`, the login throttle locks per (username, IP) and per IP; a username-wide lock applies only after 50 failures an hour. `verify` gains `{ touch: false }`, which never extends the session. Keep the cookie, the 12 h / 2 h limits (`adminSessionRules`, `analytics-auth.ts:8-10`) and every env key; change the session length only if the owner records a choice (plan section 12).
- **Shell.** `src/app/admin/page.tsx` uses the server gate of `src/app/analytics/page.tsx` (`connection()`, `cookies()`, `auth.verify()`): the owner login when signed out, an empty shell when signed in. Phone-first: one column, 44 px targets and a top tab strip (later prompts add its pages and the pending count). Client parts reuse `src/components/analytics/dashboard/dashboard-styles.tsx`; owner copy is hard-coded English. The analytics TopBar links to `/admin` and back.
- **Private exclusion points** for `/admin`, `/api/admin/*`, `/en/account`, `/en/subscribe` and `/api/account/*`:
  - `src/app/admin/layout.tsx` sets robots noindex (the member pages use `pageMetadata`, default `index: false`, when they land);
  - `next.config.ts` `headers()` applies `privateHeaders` (no-store, noindex, DENY, frame-ancestors, `Referrer-Policy: same-origin`) to `/admin`, `/admin/:path*`, `/api/admin/:path*`, `/en/account`, `/en/subscribe` and `/api/account/:path*`;
  - in `src/server/seo/proxy.ts:44` the exact `/analytics` X-Robots-Tag check becomes a prefix list;
  - robots.txt (`src/server/seo/discovery-routes.ts:38`) adds `/admin` only, so crawlers can still read the member pages' noindex;
  - `src/components/analytics/analytics-tracker.tsx:23` also excludes `/admin`. The collector already drops requests carrying the owner cookie (`analytics-http.ts:125`).
- **Route guards.** `tests/admin-routes.test.mjs`, in the style of `tests/boundaries.test.mjs`, asserts that every `src/app/api/admin/**/route.ts` and `src/app/admin/**/page.tsx` except login uses the shared guard, and runs table-driven 401/403 cases (no session, cross-site POST). Every later prompt that adds an `/api/admin` route or `/admin` page extends it.

**Files.** New: `src/server/http/private-http.ts`, `src/server/admin/owner-auth.ts`, `src/server/admin/admin-http.ts`, `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/app/api/admin/login/route.ts`, `src/app/api/admin/logout/route.ts`, `tests/admin.test.mjs`, `tests/admin-routes.test.mjs`. Changed: `src/server/analytics/analytics-http.ts`, `src/server/analytics/analytics-auth.ts`, `src/components/analytics/dashboard/analytics-login.tsx`, `next.config.ts`, `src/server/seo/proxy.ts`, `src/server/seo/discovery-routes.ts`, `src/components/analytics/analytics-tracker.tsx`, `tests/discovery.test.mjs` (line 120), `package.json` (`test:admin`).

Add no env keys (an older release rejects unknown keys and returns 500) and no npm dependencies.

## Acceptance checks

Run `npm run test:analytics` and `npm run test:admin`, plus `npm run lint` and `npm run typecheck`.

- Sign-in from `/admin` lands on `/admin` under "Owner sign-in".
- `/analytics` is unchanged apart from its small print.
- `/admin` is no-store, noindex and DENY, and robots.txt disallows it.
- Failures from one IP do not lock the owner out from another.
- `verify({ touch: false })` leaves `lastSeenAt` unchanged.
- The route-guard test passes, and no new env key exists.
- Manual: owner sign-in and the empty shell work at 375 px in the Browser pane.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by marking this file's row ☑ Completed. While work or required checks remain incomplete, mark it ◐ Partial once implementation has started, and leave it ☐ Not started until then.

Update `docs/development-progress.md` with changed files, checks and results (including manual checks), and actual blockers. Record justified implementation choices in `docs/implementation-decisions.md`.
