# 199 — Referral rewards

Add compact Account Referrals navigation, summary, personal link copying and
bounded reward history using the existing Admin classic components. Invitation
links use an opaque persistent code, first-valid-link attribution and a signed
HttpOnly 30-day cookie. Registration stores attribution once; phone verification
awards one 24-hour access period, independent of payment. No claim step or popup.

Record registration identity with a keyed phone digest, including un-referred
registrations, so erasure/re-registration cannot earn another reward. Link each
eligible registration to at most one award. Reject self/existing-account claims,
blocked/erased/unverified inviters and repeated verification. Reuse current phone
verification and rate limits without another required registration field.

Reuse account access periods with a referral source, after all existing paid,
queued or trial access. Paid purchases take precedence and preserve exact unused
reward milliseconds. Credit auto-renew waits until earned access ends. Rewards
have no lifetime accumulation cap or unused-balance expiry; scheduled access runs
continuously, like paid access. Preserve normal device grants and security checks.

Include MySQL migration, MariaDB overlay, least-privilege grants and rollout docs.
Update the audit from verified results. Acceptance uses isolated storage and sends
no external messages. The user's subsequent request explicitly authorizes bringing
the configured local database up to date after verification, including a private
backup, pending migrations, application grants and schema/health checks.

## Verification

- Prisma generation/validation, strict TypeScript and changed-file ESLint passed.
  The production Account fixture built and passed HTML/API checks for nine views,
  referral empty/unavailable states, privacy and security guards.
- The final focused auth/referral/deletion suite passed 78 tests without skips;
  related Account/activity/database-health regressions also passed.
- Genuine isolated MySQL tests passed 37 unique cases across authentication,
  wallet, subscriber management/deletion, Custom Filters and referrals. Initial
  stale integration assertions were updated to current service APIs and all six
  affected cases passed on rerun. The referral case covers concurrent exactly-once
  awards, immutable identities, deletion/re-registration, fractional scheduling,
  rejected paid extension of rewards and earned-to-credit renewal boundaries.
- Playwright passed 24 width/theme combinations across Referrals, Overview and
  Password (1440/1024/390/320; light/dark), plus copy/manual fallback, phone section
  navigation and password form/recovery behavior. Captures are ignored output.
- The authorized local update preserved a private pre-migration backup; checksum
  and isolated restore matched 109 tables and 47 applied migrations. Eight pending
  migrations then applied successfully. Final local metadata: 112 base tables,
  55 completed migrations, zero pending/unfinished. `db:verify` passed without
  drift; `db:health` is ready. Application grants were verified without DDL access.
- A rollback-only application-role local smoke test verified registration through
  first verification/reward and password/session rotation, retaining no synthetic
  accounts/referrals and sending no external messages. Administrator credentials
  were read privately through the documented native-path workflow, never changed.
- Remote production deployment, message receipt, physical devices and MariaDB
  execution remain unverified. The MariaDB overlay checksum matches reviewed
  MySQL migration SQL; the executed engine was MySQL 8.4.
