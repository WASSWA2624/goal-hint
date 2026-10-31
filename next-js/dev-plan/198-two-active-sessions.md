# 198 — Two active account sessions

Allow two authenticated, unexpired sessions per account, including administrators.
A successful third login deletes the oldest active session inside the existing
account-locked transaction. Rank age by authentication time, then creation time
and token hash for deterministic ties; daily activity does not change login age.
Rotate the current browser's token before counting other sessions. Expired,
verification-only and reset-only sessions do not consume active slots.

Keep the restricted-flow storage cap, password/phone-change revocation, paid
device grants and existing expiry/retention policies. Failed logins and failed
transactions must preserve current sessions. No eviction confirmation or popup.
Update current one-device wording and the feature audit. No schema migration is
needed: the historical one-login cleanup remains an already-applied migration.

## Verification

- Authentication service/HTTP suite: **53 passed**. Covers member/admin second
  and third logins, rejection of evicted tokens and profile writes, concurrent
  login attempts, exact expiry, deterministic ties, same-browser rotation and
  stale cookies. Activity touches do not change which login is oldest.
- Related Account/session/preferences/startup/deletion checks: **40 passed**.
  Wrong, blocked and throttled logins preserve both sessions; a failed insert
  rolls back eviction and returns no cookie. Restricted-session flooding does
  not displace either authenticated session. Password changes still revoke all
  old sessions; the independent one-device paid cap clears only entitlement.
- **Three genuine-MySQL integration tests skipped**: no genuine MySQL test-server
  binary is available. Updated integration cases exercise the two-session cap,
  concurrent logins at equal timestamps and independent paid-device grants when
  that prerequisite exists. Synthetic transaction serialization is not proof of
  real database locking, deployment or physical-device behavior.
- Root `npx tsc --noEmit`, changed-file ESLint and `git diff --check` passed.
  Audit row/status totals and all 63 local evidence links were validated.
- No production accounts, database migrations or external messages were used.
  No new browser acceptance or production build was run for this server policy
  and wording change; the shared form styling is preserved.
