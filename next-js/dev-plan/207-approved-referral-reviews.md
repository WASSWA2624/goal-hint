# 207 — Approved referral reviews and unused-reward reversal

Implement the owner-approved manual policy using exact grant identity and existing
account locks/scheduling. Keep one-day registration rewards independent of payment;
do not infer fraud from shared IP/household/device or low/no payments. An uncertain
case closes without changing access. Record private supplementary evidence apart
from immutable controlled-code events and actual financial amounts.

## Backend design

- `ReferralReviewCase` links the original referral/grant/opening account and a
  controlled reason; optimistic revisions protect operator edits. Bounded keyset
  lists expose all cases. Admin operations recheck the actual member session,
  current allowlisted phone and current admin credential version inside the
  transaction; member appeals recheck verified account/phone/session ownership.
- `ReferralGrantReversal.grantId` is the primary key: different cases/admins cannot
  reverse the same grant twice. Record only the exact unconsumed milliseconds,
  revoke that original grant without changing its dates/attribution, rechain other
  earned periods and retarget unlocked sessions through any remaining live period.
  Paid/trial rows, consumed time, credits/money and unrelated rewards are preserved.
- A successful appeal attaches one unique compensating grant to that ledger.
  The shared creation primitive accepts an exact, positive, at-most-one-day earned
  duration before it writes the ordinary access audit. Retry/concurrent decisions
  return the existing transition; they cannot mint another compensation.
- An immutable original reversal account and a mutable `holderAccountId` separate
  accounting identity from an existing verified number transfer. Claims move only
  after the same transaction records `AccountMove`; restoration and private member
  scope follow that holder, preserving original grant/referral history. Blocked or
  erased accounts cannot receive a restoration; the appeal/claim stays pending
  without automatically unblocking an independently restricted account.
- Requested, confirmed/no-action, reversed, appealed, appeal-upheld/restored and
  restored events contain actor IDs/timestamps and amounts, never supplementary
  prose. Database triggers forbid history deletion/rewrite and enforce exact
  original/compensating durations. Member notifications are transactionally inserted
  with stable case/transition keys and safe controlled reason projections.
- Closing the initial review starts the 90-day supplementary-evidence clock.
  An appeal has no invented deadline: it reopens the case, retains any fresh
  statement separately, and restarts retention on its final decision. Purged old
  prose is never recreated. Purge locks/rechecks the case before scrubbing, while
  appeal uses the same case lock before writing; concurrent reopening is safe.
  Account erasure scrubs evidence associated with either referral participant,
  the current grant holder or a transferred reversal claim. Accounting/events stay
  as pseudonymous records under existing account/audit retention rules.
- The MySQL migration is `20261031135652_referral_review`; the MariaDB 11.4 overlay
  has guarded installation, delimiter-safe trigger definitions and the exact source
  checksum. Application grants are DML only; review events get SELECT/INSERT.
  The current 24-hour account/recovery OTP lifetimes are unchanged.

## Verification

- Seven backend unit cases passed: strict contracts/privacy, exact active remainder,
  mixed paid/earned schedules and distinct cases, consumed/uncertain outcomes,
  permissions/private projections, transaction rollback and exact retention/late
  appeal/erasure. Tests use in-memory transactional fixtures, not external delivery.
- Ten genuine MySQL tests passed (one parent and nine subcases), zero skips, on one
  disposable server: actual session/role isolation; active/queued/consumed/mixed
  paid/trial; two admins and distinct cases targeting one grant; one appeal grant;
  simultaneous paid purchase; blocked restoration/uphold; rollback of all financial,
  event and notification writes; audited claim transfers; forced purge/appeal
  interleaving; late appeals and referred-participant evidence erasure.
  The first native run exposed an overstrict initial-ledger snapshot conflict;
  accepting a newly created ledger only for the already-locked holder fixed it.
- Database triggers were exercised against history/amount rewrites. Supplementary
  evidence remains separate; no OTP, raw IP, recipient data or real messages entered
  the trail. The owned disposable database was stopped. Configured local migration,
  UI/HTTP/build/combined results and deployment/device limits are recorded by the
  coordinating agent after integration.

## Integrated application and interface verification

- Added **Admin → Referral review** using the existing compact list/detail
  workspace, shared controls and centered, non-backdrop-dismissable dialogs.
  Administrators can find an exact earned grant, record corroborated evidence,
  retain the reward or confirm removal, inspect immutable history and decide
  appeals. The affected holder is identified separately after a number move.
- **Account → Referrals** shows private review status, controlled reasons,
  actual removed/restored time and an appeal action. Ordinary members never
  receive evidence, invitee details, administrator identities or accounting IDs.
  Notification links resolve to these owned cases; erasure hooks scrub evidence
  before account/grant/referral associations can disappear. Review events remain
  append-only, and overdue evidence cleanup uses the existing in-app maintenance.
- Integrated Node regressions passed **281 tests** (63 review/notification/
  dashboard/polling tests plus 218 registration/authentication/access/payment/
  sharing/Builder/guard tests), without failures or skips. The 63-test set was
  rerun after fixing the actual-service `all` status filter. Existing 24-hour
  expiry, session limits and one-day payment-independent referral rules passed.
- Integrated genuine MySQL runs passed **23 tests**, without failures or skips:
  the final ten review tests, three notification/referral regressions and ten
  authentication/session/trial/payment-review tests. This includes the final
  deleted-grant nonfinancial closure assertion. Disposable instances were used;
  these tests did not alter configured member rewards or send messages.
- Both migration structural tests, schema validation, full ESLint, route
  generation/strict TypeScript and the full production Next build passed.
  The offline manifest built with 27 pinned assets. The production review UI
  fixture also passed build, HTML and response/Flight privacy assertions.
- Chromium passed **24 admin/member width/theme combinations** at
  1440/1024/768/390/360/320px, with no horizontal overflow or runtime errors;
  phone controls meet 44px targets. Eight new-case dialog width/theme checks
  stayed inside the viewport. Backdrop clicks retained dialogs, Escape closed
  them, and evidence confirmation gated creation/reversal/restoration.
- Synthetic UI interactions passed create, remove unused reward, reload,
  appeal, restore, retain reward, uphold and injected-conflict retry flows.
  Captures were visually inspected and list/footer geometry corrected to match
  shared desktop/phone controls. Fixture-only missing routes/service-worker
  requests produced expected 404s; they were not hydration/runtime failures.
  These UI-only state mutations do not substitute for the real financial SQL
  and account-isolation tests above.
- The independent phone-polling result is in [plan 208](208-phone-builder-polling.md).
  [Plan 209](209-release-data-verification.md) records actual provider/hosting,
  Flutter, packaging and outstanding owner decisions. Performance metrics stay
  withheld, and both approved 24-hour OTP lifetimes remain unchanged.

## Configured local database rollout

- Verified the existing loopback `goal_hint_db` MySQL 8.4.11 target against
  its native server UUID and private configuration, using the existing separate
  migration/application roles. An authenticated, encrypted 35,921,994-byte logical
  checkpoint restored on a separate owned MySQL instance and matched all **113
  base-table counts**, including the 56 completed migration records.
- The first restore exposed the documented existing SharedSlip SIGNAL trigger
  delimiter issue. One subsequent disposable initialization also failed; no
  migration was attempted then. A fresh instance restored successfully with one
  delimiter normalization in restore input only. The original encrypted checkpoint
  stayed unchanged; its plaintext SHA-256 is
  `c2ffe10a5e6429e5b52d4bd846306f0311bbc121acdea98d54c4de89f0f5a657`.
  Private keys, artifacts and diagnostics remain outside Git. No live trigger,
  password, data directory or normal startup configuration was changed.
- Applied only `20261031135652_referral_review`, then installed the narrow
  application grants. All **116 application tables** were readable; seven
  zero-row insert/update privilege probes passed. Five forbidden event-update/
  review-history-delete probes were denied. The application has no DDL/grant
  privilege; event history remains SELECT/INSERT only.
- Final status: **57 completed migrations, zero pending/unfinished**, matching
  schema verification and database readiness **ready**. The local in-app
  maintenance command ran twice, each with one eligible account and zero failures;
  repeat notification count stayed **3 → 3**. No actual reward was reversed,
  synthetic account persisted or external message dispatched by this rollout.
- Applied migration bytes/checksum are preserved. The staged whitespace check
  flags its generated trailing blank line; all other staged files pass. Removing
  that cosmetic separator after deployment would change recorded migration bytes.
- Temporary native administration tasks were removed; the normal GoalHintMySQL84
  startup task and existing stashes/detached worktrees were preserved. This is a
  local rollout only. Production hosting/SSH, ingress, scheduled workers/delivery,
  signed Android installation and physical-device checks remain **Unverified**,
  with precise blockers in plan 209 and the remaining-work audit.
