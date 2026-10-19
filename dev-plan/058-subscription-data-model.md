# 058 Data model, settings, plans and audit

**Feature:** The nine paid-access tables, phone normalization, the dashboard settings service with the paywall switch, subscription plans, the owner audit writer, and the Plans and Settings pages.

**Depends on:** [057-owner-admin-foundation.md](057-owner-admin-foundation.md), [003-mysql-prisma.md](003-mysql-prisma.md), [045-backup-restore.md](045-backup-restore.md).

**Source:** [App specification](../app-write-up.md), sections 1, 10 and 13 (version 1.9 paid access); [monetization plan](../prompts/monetization.md), sections 3, 5.1, 5.2 (`phone.ts`), 5.6 (Plans, Settings, owner auth), 5.7, 5.8, 8 (058) and 9 (phone table).

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing code before implementing this feature. The switch stays `off`: this prompt adds storage and owner settings, not member features.

- **Tables** (plan 5.1): `MemberAccount`, `MemberSession`, `SubscriptionPlan`, `PaymentSubmission`, `PaymentScreenshot`, `AccessCode`, `SubscriptionSettings`, `RateLimitBucket` and `OwnerAuditEvent`, with the columns, indexes and constraints listed there.
  - Phones are canonical digits in `VarChar(15)`; `MemberAccount.phone` is unique and not hashed, and becomes NULL on erase. It also carries `trialRequestedAt` and `trialDismissedAt` (plan 5.10).
  - `PaymentSubmission` carries `source` (`report`/`owner`), the claim columns including `claimedTxnKey`, and `approvedTxnKey` (`network:txnKey`), which is unique, nullable, set only at approval and kept after reversal.
  - `AccessCode.source` is `payment`, `manual`, `reissue`, `number-change` or `trial`. `AccessCode` carries `replacedById`, the plan snapshot, a unique `paymentSubmissionId`, and `activatedAt`, `startsAt` and `endsAt`, which are set when the code is created (access runs from payment confirmation, OP-38).
  - Every `CREATE TABLE` states `ENGINE=InnoDB`. Instants are `DATETIME(3)` UTC; phones, hashes and codes use `utf8mb4_bin`. Each Prisma model gets a privacy comment in `prisma/schema.prisma`.
  - `RateLimitBucket` is written only by an atomic `INSERT … ON DUPLICATE KEY UPDATE`; never copy the read-then-create of `AnalyticsLoginThrottle`. `OwnerAuditEvent` never holds a subscriber phone, a full code or an image.
- **Migration** (plan 5.1 workflow):
  1. `npm run db:migrate -- --name subscriptions` (diffs `prisma/schema.snapshot.prisma`); add `ENGINE=InnoDB` and collations to every `CREATE TABLE`; commit migration and snapshot together.
  2. `prisma/mariadb/<stamp>_subscriptions.sql`, in order: a failing guard (`BEGIN NOT ATOMIC … SIGNAL SQLSTATE '45000'` inside a `DELIMITER` change) that stops the import if any of the nine tables exists with another engine; `CREATE TABLE IF NOT EXISTS … ENGINE=InnoDB` with FKs inline or `ADD CONSTRAINT … FOREIGN KEY IF NOT EXISTS`; the `_prisma_migrations` insert copied from `20261014131920_first_party_analytics.sql` with the final checksum; a closing check of engines, collations and the FK count.
  3. `tests/subscription_migration_test.py` (run by `test:scripts`) asserts `ENGINE=InnoDB` on every `CREATE TABLE` in both files. Integration tests cannot catch it: the isolated MySQL starts with `--no-defaults` (`src/server/backup/isolated-mysql.mjs:180`).
  4. Local grants in `docs/local-database.md`: SELECT, INSERT and UPDATE on all nine tables; DELETE only on `MemberAccount`, `MemberSession`, `PaymentScreenshot` and `RateLimitBucket`.
  5. `tests/backup-restore.integration.mjs:68` asserts 68 tables; the real count is 81 and becomes 90.
- **Phones** (`src/domain/phone.ts`, pure): `normalizePhone` in the five steps of plan 5.2, including inputs typed after the `256` prefill, and the hint "For a number outside Uganda, delete 256 and type the full number with its country code". Also `formatPhone` (`256 772 123 456`), `maskPhone` ("ending 456"), `localUgandaPhone` (`0772123456`), `networkForPrefix` (from a canonical prefix table the owner confirms, OP-38), `waHref`, `smsHref` (text encoded with `encodeURIComponent`) and `telHref` (adds `+` inside the link only).
- **Settings** (`src/server/members/settings.ts`): one typed row, `id = 1`, with the fields of plan 5.7. A missing row means defaults, `paywallMode = off`. Cache per process for 30 s; a failed read uses the last good value, and with none, access resolves to free.
  - `test` or `on` requires an active plan, one payment number with its registered name, and a contact or WhatsApp number. `on` also requires `privacyNotice.releaseReady` and `termsNotice.releaseReady`.
  - Menu shortcuts accept `[0-9*#]` and `{amount}`, at most 60 characters; changing a payment number clears its shortcut. Copy format is `international` (default) or `local`. Max unlocked devices 1–5 (default 2); screenshot retention 7–365 days (default 90); free trial for new numbers 0–7 days (default 2; 0 hides the offer).
  - Eight fields are protected: the MTN and Airtel numbers, both registered names, both menu shortcuts, the contact phone and the WhatsApp number. Changing one needs password re-entry (the login check and throttle, without a session) and is audited with old and new values; `paymentNumbersChangedAt` records number changes. Mode changes need a second tap.
- **Plans** (`src/server/members/plans.ts`): name up to 40 characters, 1–366 days, UGX 100–10,000,000, active flag and order. Create, edit, deactivate and reorder; never delete. The owner's plans (OP-38) are Daily (24 hours from activation, UGX 1,000), Weekly (7 days, UGX 5,000) and Monthly (30 days, UGX 20,000), entered on the Plans page rather than seeded by the migration. `durationDays` counts 24-hour blocks from activation, never calendar days. Plans differ only in length and price: every plan unlocks every feature, so add no feature tiers.
- **Audit** (`src/server/admin/audit.ts`): the `OwnerAuditEvent` writer, connected to the 057 sign-in callback, so owner sign-ins and every settings or plan change are audited. The Audit page comes in 065.
- **Pages and routes** behind the 057 guard: `src/app/admin/plans/` and `src/app/admin/settings/` (including diagnostics of which client-address headers arrive), `src/app/api/admin/plans/route.ts` and `src/app/api/admin/settings/route.ts`, all JSON POSTs, same-origin checked and audited. Extend `tests/admin-routes.test.mjs` for each.

**Files.** New: `prisma/migrations/<stamp>_subscriptions/`, `prisma/mariadb/<stamp>_subscriptions.sql`, `tests/subscription_migration_test.py`, `src/domain/phone.ts`, `src/server/members/settings.ts`, `src/server/members/plans.ts`, `src/server/admin/audit.ts`, `src/app/admin/plans/`, `src/app/admin/settings/`, `src/app/api/admin/plans/route.ts`, `src/app/api/admin/settings/route.ts`, `tests/phone.test.mjs`, `tests/members.test.mjs`, `tests/members.integration.mjs`. Changed: `prisma/schema.prisma`, `prisma/schema.snapshot.prisma`, `docs/local-database.md`, `tests/backup-restore.integration.mjs` (line 68), `tests/admin-routes.test.mjs`, `package.json` (`test:members`).

## Acceptance checks

Run `npm run test:members`, `npm run test:admin` and `npm run check`.

- `db:deploy`, `db:status`, `db:verify` and the engine test pass.
- `tests/phone.test.mjs` covers every row of the plan section 9 phone table, `formatPhone`, `maskPhone`, `localUgandaPhone`, `telHref` and `networkForPrefix`; `waHref` and `smsHref` round-trip a message with `#code=`, `&` and line breaks (`new URL(waHref(p, m)).searchParams.get("text") === m`).
- A missing settings row reads `off`, with a 2-day free trial.
- `test` and `on` are refused without their preconditions, and `on` is refused until privacy and terms are release-ready.
- Settings numbers are stored as canonical digits.
- The eight protected fields need the password, are throttled, and are audited with old and new values.
- A payment-number change clears its menu shortcut.
- Plans are never deleted.
- Manual: the Plans and Settings pages work at 375 px in the Browser pane.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Update `docs/development-progress.md` with changed files, migrations, checks and results (including manual checks), and actual blockers. Record justified implementation choices in `docs/implementation-decisions.md` and the overlay steps in `docs/database.md`.
