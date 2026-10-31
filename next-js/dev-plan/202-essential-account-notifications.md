# 202 â€” Essential in-app notifications and subscription reminders

Implement tasks 8/9 together in Account â†’ Notifications. Persist account-owned
payment approval/rejection, activation, approaching-expiry, expired-access and
referral-award notifications. Use stable event keys, read/dismiss state, bounded
pages and a subtle unread indicator. Keep WhatsApp preferences clearly separate;
no new external delivery or changes to payment/referral/security rules.

Materialize recent durable payment/access/referral facts under the account lock,
on authorized reads and in the existing maintenance/renewal worker paths. Reuse
`activeSubscriptionUntil` and the existing one-hour renewal lead across every
access source. Replace stale reminders when the effective schedule changes.
Retain notification state for 90 days; stable keys/tombstones prevent duplicate
regeneration within that window. Never treat gaps or queued future access as
current entitlement. Recheck session/phone/ownership before reads and mutations.

Use shared Account panels, compact controls and theme tokens. Verify isolation,
durability, idempotency/concurrency, exact timing, renewed/earned schedules and
desktop/phone behavior on genuine isolated MySQL and production UI fixtures.
Apply the authorized local migration/grants after a private backup, then check
schema and health. Preserve historical audit evidence in existing implementation
notes and reduce the active report to the requested three-column work groups.
Keep unresolved prediction/result alerts, individual sharing and performance
evaluation visible; release/device checks belong only in the verification group.

## Verification

- Prisma client generation/validation and schema snapshot checks passed. The MariaDB overlay checksum matches the LF MySQL migration; MariaDB execution was not performed. The applied MySQL SQL retains its generated trailing blank line (the sole diff whitespace warning) to preserve the deployed checksum.
- The final notification/health/Account/auth/referral unit suite passed **112 tests, no skips**. It covers exact one-hour and expiry boundaries, contiguous paid/trial/queued/referral schedules and gaps, delayed activations, reversal deduplication, concurrent reconciliation, persisted read/dismiss state, pagination/retention (including blocked-account cleanup), restricted/foreign/stale identities and strict HTTP input/origin/privacy guards.
- **18 genuine MySQL integration cases passed**: the new persistence/isolation/concurrency/reminder/FK/check-constraint case, plus 17 subscriber-management/referral regressions. The final notification integration rerun also passed after maintenance retention was extended to inactive accounts. Disposable servers were used; no external messages were sent.
- Strict TypeScript and changed-file ESLint passed. The production Account fixture built and all HTML/API assertions passed, including the six notice kinds, separate WhatsApp preferences, empty/unavailable states and existing account/security guards.
- Playwright passed **10 width/theme combinations** at 1440/1024/768/390/320px in light/dark themes: no horizontal overflow and all inbox buttons at least 44px. Desktop and mobile read/dismiss/reload/mark-all checks passed, counts cleared correctly and WhatsApp consent stayed unchanged. Mobile section navigation, relevant links, empty/unavailable states and guest isolation passed. Captures were visually inspected. Expected fixture-only missing-route/service-worker 404s occurred; no hydration errors were observed.
- The configured local MySQL notification migration applied successfully after a private backup. Its checksum and separate restore matched the prior **112-table / 55-migration** inventory; the test restore normalized a mysqldump delimiter in the existing single-statement SharedSlip SIGNAL trigger, while retaining the original backup unchanged. Application CRUD grants on MemberNotification are verified, with no application DDL privilege or password/startup change. `db:verify` reports no pending migrations or schema drift and `db:health` is ready.
- The local notification worker completed twice with **one eligible account, zero failures**; repeat reconciliation preserved the notification count. The temporary administrator task was removed and the normal database startup task retained. Two private failed-restore directories remain ignored/protected because automatic approval review blocked their recursive cleanup; their processes are stopped.
- Historical audit verification moved into plan 201. The active audit contains only remaining gaps in the requested five work groups and one recommended sharing/mobile batch. Prediction/result alerts, individual sharing and performance evaluation remain explicit decisions. Remote deployment, worker/external-delivery qualification and physical-device checks remain in the release-verification group.
