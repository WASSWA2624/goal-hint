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
