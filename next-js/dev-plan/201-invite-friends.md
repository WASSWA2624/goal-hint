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

## Remaining-work audit — 31 October 2026

Read-only review of application source, routes, UI, schema and implementation
evidence at `c3719024`, following the feature audit prompt and subsequent scope
instructions. No application code, schema, configuration or access rules changed;
no build, migration deployment, provider request or external message was made.
Only the report and these historical notes were updated. Source classifications
below describe implemented behavior, not live deployment or device certification.

### Source review

- **1 — Fully implemented within the approved scope:** [configuration contracts](../src/domain/slip-configurations.ts), [account-scoped storage](../src/server/slips/slip-configurations.ts) and [Custom Filters dialogs](../src/components/slips/saved-slip-configurations.tsx) retain the ten-item cap, optional default, revision-safe CRUD and explicit Use Selected Filter. Time ranges persist; loading uses today without generation. The user's later instruction deliberately keeps management in Slip Builder and removes the separate Account interface; do not restore that original prompt requirement as a gap.
- **2 — Fully implemented locally:** the [Account route](../src/app/_components/account-route.tsx), [workspace](../src/components/members/account-workspace.tsx), [overview](../src/components/members/account-overview.tsx) and [private dashboard projection](../src/server/members/account-dashboard.ts) provide compact subscription, renewal, referral and activity views. Earlier layout evidence remains in plans 197/199/201; the full Account browser matrix was not rerun during this audit.
- **3 — Core reward behavior fully implemented; broader abuse review belongs to 7:** [referral service](../src/server/members/referrals.ts) and [period scheduling](../src/server/members/referral-periods.ts) award one day at first eligible phone verification without payment, retain keyed phone deduplication after deletion, prevent self-referral and queue earned access after paid periods. Tests exercise repeated/concurrent verification and earned-to-credit renewal boundaries. No new lifetime reward cap or payment condition is recommended.
- **4 — Sharing flow implemented; real-device qualification remains Unverified:** [invitations](../src/components/members/account-referrals.tsx) reuse the personal link and [native/fallback helper](../src/components/members/invitation-share.ts). Earlier browser/Flutter evidence and the last Android packaging dependency failure remain above and in plan 203. This audit did not attempt a new APK build or contact a social target.
- **5 — Partially implemented, remaining decisions:** [slip Share](../src/components/slips/slip-share-action.tsx), [drawer](../src/components/slips/sharing/slip-share-drawer.tsx) and [server access checks](../src/server/slips/shared-slips-http.ts) support full-slip sharing; [recipient route](../src/app/_components/shared-slip-route.tsx) retains generic previews, access gates and safe return paths. Individual-prediction sharing and changing the existing expanded shared-page default remain undecided, rather than authorized implementation work. Device/deployment checks are recorded only in the release group.
- **6 — Fully implemented locally:** [session issuance](../src/server/members/member-sessions.ts) evicts the oldest excess authenticated session under the account lock. Fresh tests cover third/concurrent login, exact expiry, restricted-session floods, failed replacement rollback and old-session rejection. Phone verification and signed-in password-change/session-rotation regressions passed.
- **7 — Partially implemented; high-priority standalone review:** [authentication](../src/server/members/member-auth.ts), [OTP consumption](../src/server/members/verification-codes.ts), [durable limits](../src/server/members/rate-limit.ts) and referral eligibility checks exist and pass focused tests. The [24-hour code lifetime](../src/domain/member-verification.ts) remains intentional current behavior. [Address extraction](../src/server/http/private-http.ts) depends on the nearest proxy's forwarded-address provenance; actual host sanitization was not established here. Broader bot/suspicious-registration handling and fraud review/reversal need a proportionate policy, without assuming CAPTCHA is mandatory or weakening existing rewards.
- **8 — Partially implemented; 9 — Implemented core/reminders:** the [six-kind notification contract and reminder schedule](../src/domain/account-notifications.ts), [persistent reconciliation](../src/server/members/account-notifications.ts), [private HTTP route](../src/server/members/account-notifications-http.ts) and [Account feed](../src/components/members/account-notifications.tsx) cover approved account events, ownership, read/dismiss state and deduplication. [Schema](../prisma/schema.prisma) enforces the account/event key. Prediction/result alerts still need an audience/trigger decision. Subscription math uses uninterrupted paid/trial/queued/referral periods and exact boundaries. WhatsApp preferences remain a separate existing delivery choice; no external reminders were added.
- **10 — Unable to verify provider truth:** [match detail projections](../src/domain/match-details.ts), [detail route](../src/app/_components/match-detail-route.tsx) and [player evidence](../src/server/evidence/player-football.ts) preserve stored revision/result/source boundaries. Synthetic arithmetic tests cannot establish current provider accuracy, freshness, player coverage or display rights. Verify authorized real evidence before claiming those properties.
- **11 — Partially implemented; evaluation decision and real-data verification pending:** [public performance](../src/server/performance/public-performance.ts) intentionally supplies no production evaluation policy; [metric gates](../src/server/performance/performance-service.ts) withhold unapproved/insufficient-quality values while retaining counts. [Evaluation requirements](../docs/forecast-evaluation.md) still call for approved cohorts, periods, horizons, market/sample/quality gates and reporting windows. Passing synthetic calculations is not performance qualification; no personal betting/profit tracking is proposed.
- **12 — Partially implemented:** [Builder](../src/components/slips/slip-builder.tsx) still enables match polling only on desktop; the polling test explicitly confirms disabled mobile polling. This is the remaining known mobile code gap. Latest approved status/spacing/access changes are documented in plan 205. Live deployment, existing worker/delivery operation, Android packaging and signed physical-device journeys remain release checks, not duplicate sharing or notification feature gaps.

### Actual checks for this audit

- **261 tests passed, zero failures/skips**, using Node's test runner with
  `--conditions=react-server --test --test-concurrency=1` across 21 focused files:
  Account dashboard/notifications, member auth/session/HTTP, referrals/invitations,
  Custom Filters, shared slips/auth returns/images/downloads, slip polling,
  subscription summary/expiry, match detail projections/pages and performance
  calculations/quote binding. These use synthetic or in-memory fixtures; no new
  genuine-MySQL integration run or browser/device matrix was performed.
- Configured local `python scripts/database.py verify` **passed**, checking
  migration status and schema diff without applying migrations. Read-only
  `python scripts/database-health.py` returned **ready**. This does not verify
  remote grants, production deployment or production worker/delivery operation.
- Prior evidence is retained, not represented as a fresh audit run: plan 202
  records notification persistence/isolation MySQL and Account UI checks; plan
  203 records phone sharing, recipient privacy/returns, exports and Flutter
  checks. Plan 205 supersedes earlier 44px mobile slip-Share geometry with the
  user-requested 24px compact button. It records 24 layout combinations, an
  18-case access matrix, disclosure/focus checks and expiry during failed
  session requests. Ordinary slips remain collapsed; shared-page expansion is
  unchanged. App/referral sharing remains independent of subscription.
- No real provider response, remote environment, external recipient or physical
  device was checked. Do not promote those historical or outstanding checks to
  Verified based on these local results. No implementation was authorized by
  this audit; registration/referral security remains the recommended next batch.
