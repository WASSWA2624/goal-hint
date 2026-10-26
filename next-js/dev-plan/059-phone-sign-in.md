# 059 Phone sign-in and member sessions

**Feature:** Phone-number-only sign-in with a live-formatted phone field, member sessions and their cookie, throttles, sign-out, signing out other devices, and the first account page states.

**Depends on:** [058-subscription-data-model.md](058-subscription-data-model.md).

**Source:** [App specification](../../app-write-up.md), sections 1, 2 and 13 (version 1.9 paid access); [monetization plan](../../prompts/monetization.md), sections 3 (identity, member cookie), 5.2, 5.3 (throttles), 5.8, 6 (account page, controls), 8 (059) and 9.

## Prompt

Read `next-js/dev-plan/000-index.md`, the source sections and existing code before implementing this feature. Code entry and unlocking come in 060; a session here identifies an account but never shows picks or subscription details.

- **`PhoneInput`** in `src/components/ui/controls.tsx`: `type=tel`, `inputMode=tel`, `autoComplete=tel`, starts with `256`. A paste replaces the whole value. Each change runs `normalizePhone` and shows "256 772 123 456" under the field, or the hint. No confirm step. Without JavaScript the server normalizes and answers `?status=invalid-phone`. Mark it `data-analytics-ignore`.
- **`POST /api/account/sign-in`**: same-origin check (403 otherwise); refused while `paywallMode = off`; normalize. Insert the account, or re-read it after a unique conflict. Delete the session named by any member cookie the browser sent, create a session and set the cookie. JS callers get JSON. Plain form posts get a 303 to `account` or `subscribe`, plus an optional `return` that must match `/en` or `/en/matches/<id>/<slug>`. A number never appears in a URL. (060 adds the signed-out phone-plus-code path to this route.)
- **Sessions** (`src/server/members/member-sessions.ts`): token `randomBytes(32).toString("base64url")`; store only its SHA-256, as `src/server/analytics/analytics-auth.ts` does. Expiry is `lastSeenAt + 90 days`, touched at most once a day. At most 10 sessions per account: a new sign-in evicts the oldest session that is not unlocked and has no pending or superseded submission, else the oldest that is not unlocked. No user agent is stored.
- **Cookie:** `__Host-goal-hint-member` in production, `goal-hint-member` in development; HttpOnly, Secure in production, SameSite=Lax, Path=/, Max-Age 400 days (the stored expiry slides; Server Components cannot set cookies). The name must not match `goal-hint-analytics*`, which the collector drops. Anonymous GETs set no cookie.
- **Sign-out:** the button first removes the payment draft from `sessionStorage`; `POST /api/account/sign-out` deletes the row, clears the cookie, sends `Clear-Site-Data: "cache"` and 303-redirects (full navigation).
- **Devices:** `POST /api/account/devices` signs out the account's other sessions. Any unlocked session may use it (a session with `codeEnteredAt` set), even after its period ended; others get 403.
- **Throttles** (`src/server/members/rate-limit.ts`) on `RateLimitBucket` with keys from `config.key(purpose, value)` (`src/server/analytics/analytics-config.ts`) and an atomic upsert. Sign-ins per IP: 1,000 an hour; new accounts: 1,000 a day. Per-IP limits are skipped when `clientAddress` returns `unknown`. Throttle HMACs use `GOAL_HINT_ANALYTICS_SECRET`; when it is missing, member features report "unavailable".
- **Member HTTP** (`src/server/members/member-http.ts`): the shared same-origin check, mode-off refusal, cookie handling and the generic refusal "We couldn't complete this. Please contact us." used for blocked accounts and other refusals. A block deletes every session; sign-in still works.
- **Account page** (`src/app/[locale]/account/page.tsx`, thin; `src/app/_components/account-route.tsx` in `PublicShell` as a non-app page like `information-shell.tsx`). States: mode off ("Subscriptions are not open yet."); signed out (phone field, `256` prefilled); signed in, not unlocked ("Signed in as 256 772 123 456", Get access link, Sign out, nothing else about the account). The fixed title is "Account"; noindex through `pageMetadata`; out of sitemaps and `informationPages` (`src/domain/navigation-paths.ts`). In-app browsers (Facebook, Instagram) get "Open this page in Chrome or Safari", from a render-time user-agent check that is never stored. Add the `account.*` copy keys to `src/i18n/messages/en.ts`.
- **Route guards:** extend `tests/admin-routes.test.mjs`. `POST /api/account/sign-in` accepts a session that is not unlocked but refuses cross-site requests (403) and mode `off`; `POST /api/account/devices` gives 403 to no session, a cross-site request and a session that is not unlocked.

**Files.** New: `src/server/members/member-sessions.ts`, `src/server/members/rate-limit.ts`, `src/server/members/member-http.ts`, `src/app/api/account/sign-in/route.ts`, `src/app/api/account/sign-out/route.ts`, `src/app/api/account/devices/route.ts`, `src/app/[locale]/account/page.tsx`, `src/app/_components/account-route.tsx`. Changed: `src/components/ui/controls.tsx`, `src/i18n/messages/en.ts` (`account.*`), `tests/members.test.mjs`, `tests/members.integration.mjs`, `tests/admin-routes.test.mjs`.

## Acceptance checks

Run `npm run test:members`.

- Every input in the plan section 9 table normalizes or is refused as listed, including inputs typed after the `256` prefill, through `PhoneInput` and the sign-in route.
- Cookie flags: HttpOnly and Lax; Secure and the `__Host-` prefix in production.
- A cross-site POST gets 403, and anonymous GETs set no cookie.
- On real MySQL, two concurrent first sign-ins of one number both succeed, as do two concurrent first throttle hits.
- `unknown` addresses skip per-IP limits.
- A sign-in flood evicts sessions with a pending or superseded submission last.
- The analytics collector still counts member visitors.
- Devices refuses a session that is not unlocked and accepts an unlocked one whose period ended.
- Manual: the account states work at 375 px in the Browser pane.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by marking this file's row ☑ Completed. While work or required checks remain incomplete, mark it ◐ Partial once implementation has started, and leave it ☐ Not started until then.

Update `docs/development-progress.md` with changed files, checks and results (including manual checks), and actual blockers. Record justified implementation choices in `docs/implementation-decisions.md`.
