# 201 — Invite Friends

Extend the existing Account Referrals panel with Copy link, WhatsApp, Telegram
and capability-aware native Share. Add quiet Invite friends entry points in the
Account summary and main More menu. Reuse the existing canonical personal link,
eligibility, attribution and reward machinery; no schema or reward changes.

Use shared Account/app controls and theme spacing on desktop and wrapping,
touch-friendly actions on phones. Explicit social links contain a concise
invitation and encoded referral link. Native sharing is user initiated; cancel
is quiet, failures preserve the explicit alternatives and clipboard denial
keeps manual selection. Do not claim successful message delivery.

Keep web UI/business logic in Next.js. Where the mobile WebView lacks Web Share,
add a minimal same-origin, document-bound native bridge to the standard platform
share sheet. Validate bounded public text/referral URLs, invalidate requests on
navigation and provide the required iPad popover anchor. No account/session
secrets enter the bridge. Desktop browsers use Web Share where supported.

Verify encoding and native outcomes, desktop/phone layouts and entry points,
clipboard fallback, native host checks, typing/lint and focused regressions.
Update the audit with actual results, then commit/push main while preserving
existing stashes and linked worktrees.

The user's follow-up additionally authorizes filling missing local member codes
and improving the screen's hierarchy. Issue new codes during registration, retain
safe lazy compatibility, provide bounded preview/apply provisioning and preserve
existing links. Put invitation actions first, give native sharing a clear primary
action, balance social controls on phones and place rewards/history below.
The next follow-up requests faint borderless app-bar Theme/Account buttons, with
clear hover/focus effects. Use one shared icon-control treatment in both buttons.

## Verification

- Strict TypeScript, changed-file ESLint, Flutter analysis and final targeted Dart
  analysis passed. The production Account fixture built and passed its complete
  HTML/API checks, including sharing controls, expired access and private guards.
- The final focused auth/referral/invitation/shared-slip suite passed 85 cases
  without skips, including eager registration codes and concurrent, bounded,
  repeat-safe legacy provisioning. Account read regressions also passed. The new
  menu entry required updating the old expected list; all 17 navigation cases
  passed on rerun.
- Eight Flutter native-bridge/navigation tests passed: bounded canonical payloads,
  document nonces, ownership, concurrent requests, navigation invalidation,
  cancellation/failure, popover anchor and external-link policy.
- Playwright passed 20 width/theme/capability combinations (1440/1024/768/390/320;
  light/dark; Web Share available/unavailable), with no horizontal overflow,
  desktop actions on one row and 44px-or-larger sharing controls. Desktop/phone
  More navigation and Account entry, expired access, guest privacy gates,
  WhatsApp/Telegram handoffs, native payload/cancel/failure, copying and blocked
  clipboard selection all passed. Actual bridge JavaScript also completed a
  synthetic platform-channel handshake and cancellation in the browser.
- External social requests were intercepted, clipboard/native APIs were mocked,
  and fixture storage was synthetic. No invitations/messages were sent. Physical
  devices, installed social-app handoffs and signed release builds remain
  unverified. Captures and helper logs remain ignored output.
- Android debug packaging initially hit the MSIX Java loopback error. A hidden,
  limited same-user helper got past it, but normal dependency resolution stalled
  despite bounded HTTP timeouts/IPv4. An offline diagnostic failed on uncached
  `com.android.tools.build:gradle:8.12.1` and Kotlin plugin 2.2.0 artifacts needed
  by share_plus. APK packaging and installed-app behavior remain unverified;
  Dart/bridge analysis/tests passed. No global Java/Gradle setting changed.
- A private code-only snapshot preceded the authorized local backfill. One
  registered member was missing a code; one was assigned. Existing links remained
  unchanged, all assigned codes were valid/unique and repeat preview found none
  missing. The account count stayed unchanged and no rewards were granted.
  Database migration status passed; sharing/provisioning adds no schema changes.
- Both genuine MySQL referral integration cases passed, including simultaneous
  legacy code provisioning and the full registration/award/access/deletion flow.
- Final shared-header browser checks passed for Theme and Account at desktop/
  phone widths in light/dark themes (eight hover cases), with a faint fill,
  stronger hover feedback and zero-width borders. Keyboard focus stays visible
  and reduced-motion preference disables the transitions. Final production
  fixture HTML/API checks, TypeScript and changed-file lint passed.
- The temporary native build task was removed and the normal MySQL startup task
  retained. Private code snapshots, build logs and generated outputs are ignored.


## Historical audit evidence before the notifications batch

Archived from the 31 October audit when the active report was reduced to remaining work. These are earlier verification results, not new checks for notifications.

- **Invite Friends (current task):** strict TypeScript and changed-file ESLint passed. The production Account fixture built and HTML/API checks passed, including sharing, expired access and private guards. The final auth/referral/invitation/shared-slip suite passed **85 tests**; Account read regressions and all **17 navigation cases** also passed. Flutter analysis and **eight bridge/navigation tests** passed. The revised invitation-first UI passed **20 layout/capability/theme combinations** at 1440/1024/768/390/320 pixels, with desktop actions on one row, 44px sharing targets and no horizontal overflow. Browser checks verified desktop/phone entry, encoded social handoffs, native payload/cancel/failure and copy/manual selection. External social requests were intercepted; no invitations were sent. See [plan 201](../dev-plan/201-invite-friends.md). Android APK packaging remains unverified: normal Gradle resolution stalled, and an offline diagnostic identified uncached AGP 8.12.1/Kotlin 2.2.0 artifacts required by share_plus. Dart/bridge checks passed; installed-app handoffs still need device qualification.
- **Existing invitation codes:** new registrations now receive persistent codes immediately. The bounded preview/apply command in [worker](../src/workers/referrals.ts) and [service](../src/server/members/referrals.ts) preserves existing links. A private before-snapshot preceded the authorized local update: **one missing registered member code assigned, zero remaining**, unchanged account count, valid/unique codes and existing links preserved. Provisioning grants no reward or verification eligibility. Database migration status passed; no new schema migration was needed.
- **Follow-up verification:** both genuine MySQL referral cases passed, covering concurrent legacy provisioning and the complete award/access/deletion flow. Shared Theme/Account icon controls now use one [borderless faint-fill treatment](../src/components/ui/header-controls.ts). Eight desktop/phone light/dark hover checks, keyboard focus and reduced-motion checks passed; final production Account HTML/API checks passed. The temporary native build task was removed; the normal database startup task and private backup evidence remain intact.

- **Source/tooling:** Prisma generation/validation, strict TypeScript and changed-file ESLint passed. The isolated production Account fixture built and HTML/API assertions passed for all nine sections, referral empty/unavailable states, privacy, guards and signed-in recovery redirects. See [plan 199](../dev-plan/199-referral-rewards.md) and [plan 200](../dev-plan/200-signed-out-password-recovery.md).
- **Focused auth/referral/deletion tests:** **78 passed, no skips**, covering attribution, idempotent awards, scheduling, ownership, recovery guards, password changes without current password, concurrent changes and old-session revocation. Account/activity/database-health and related focused regressions also passed during implementation.
- **Genuine MySQL:** **37 unique integration cases passed** across authentication, wallet, subscriber management/deletion, Custom Filters and referrals. The first batch exposed stale test API assertions; all six affected cases passed after updating those assertions. Tests used separate disposable servers. Referral coverage includes concurrent verification, database immutability/FKs, erase/delete/re-register, exact scheduling, reward extension rejection and the earned-to-credit renewal boundary. Formerly skipped session/configuration races are now exercised.
- **Browser:** **24 width/theme combinations** passed for Referrals, Overview and Password at 1440/1024/390/320 pixels in light/dark themes without horizontal overflow. Playwright verified copying and blocked-clipboard selection, phone section navigation, signed-in recovery redirection, password mismatch and successful change. The fixture used synthetic storage and sent no messages; real revocation was checked separately. Expected fixture-only missing-route/service-worker 404s were observed.
- **Configured local database:** existing private administrator access was traced through the documented MSIX/native-path distinction; no password or startup configuration changed. A private backup's checksum/isolated restore matched **109 tables and 47 completed migrations**. All **eight pending migrations**, through `20261031120000_referral_rewards`, applied successfully. Final metadata: **112 base tables, 55 completed migrations, zero pending/unfinished**, `db:verify` no drift and `db:health` ready. New-table grants were verified; the application still has no DDL privileges. See [local database record](../docs/local-database.md).
- **Application-role smoke check:** a rollback-only transaction on the configured local database verified attribution → registration → phone verification → one reward, plus password change without current password retaining the new session and rejecting both old sessions. No synthetic accounts/referrals were retained; no external messages were sent.
- **Earlier UI evidence retained:** [plan 194](../dev-plan/194-explicit-custom-filter-application.md) records explicit-use/CRUD/default/no-generation checks; [plan 197](../dev-plan/197-admin-classic-account-workspace.md) records shared chrome and earlier 64 layout/32 panel combinations. Those full earlier matrices were not rerun here.
- **Not established:** remote production deployment, real-user delivery, social handoffs, provider truth, physical-device release behavior or production load performance. The MariaDB overlay was reviewed and checksum-matched; this task executed MySQL, not MariaDB.
