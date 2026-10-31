# Local development database

The owner approved a separate MySQL 8.4 installation on 10 October 2026 after
inspection identified XAMPP's port 3306 service as MariaDB 10.4.32. The application
uses **MySQL Community Server 8.4.11** at **127.0.0.1:3307**, database
**goal_hint_db**. The existing MariaDB instance and its empty database are separate.

The private installation is `%LOCALAPPDATA%\GoalHint`. Its server binaries live
in `mysql-8.4.11`; `mysql.ini` configures the persistent `data` directory, UTC,
loopback-only TCP, a 128 MiB InnoDB buffer pool and 40 maximum connections.
MySQL X Protocol is disabled. TLS-disabled access is restricted to local
development; this configuration does not qualify a hosted or production target.

The ignored `.env.local` enables the database boundary and selects this target.
The app uses `goal_hint_app` with the owner-supplied application password.
`goal_hint_migration` uses a separate generated secret and database-scoped DDL
privileges. Root administration uses a generated secret in the private
`admin.cnf`; application processes do not use root. Never commit, publish or
copy these credentials into documentation. Windows ACLs restrict the installation
and environment file to the current user and SYSTEM.

The application can read all 62 schema models after prompt 044. Append-only forecast, evidence,
outcome and audit tables permit INSERT/SELECT; mutable projections receive
table- or column-scoped UPDATE grants. DELETE is granted only for disposable
`PublicResponseCache` rows. Application access excludes DDL, migration-history
reads and server-account administration. The actual local grants are recorded
in the private installation's `application-grants.sql`. Revisit grants whenever
a future migration adds a table or mutable column. Production role verification
remains a separate deployment requirement.

Prompt 052 adds five odds tables, bringing the schema to 67 models. The local
`application-grants.sql` does not cover them yet. Add the grants listed in
[provider-odds.md](provider-odds.md#application-grants) to that file:

- INSERT and SELECT on the three append-only tables;
- column-scoped UPDATE on `FixtureOddsState` and `FixtureOddsPrice`;
- no DELETE.

Apply them **after** `npm run db:deploy` has run migration
`20261010200505_provider_odds_import`, because MySQL refuses grants on tables that
do not exist yet (ERROR 1146). Then run `npm run db:status`, `npm run db:verify`
and `npm run db:health`. Apply the grants before starting `npm run live`: from
the moment the migration is deployed, the runner's every-tick `expire()` and the
monitoring collector both read the odds tables, even with imports off.

Odds imports remain off (`GOAL_HINT_ODDS_IMPORT_ENABLED=false`).

Migration `20261025180538_prediction_quotes` adds the append-only
`PredictionQuote` table (the public price captured beside each published family
prediction). Grant the application role SELECT and INSERT only, recorded beside
the odds grants in `application-grants.sql`:

```sql
GRANT SELECT, INSERT ON goal_hint_db.PredictionQuote TO 'goal_hint_app'@'<existing host>';
```

The order is: `npm run db:deploy`, then the grant, then `npm run db:status`,
`npm run db:verify` and `npm run db:health`, and only after that, with the owner's
odds-display decision, the `providerOdds` flag. While the flag is off the
application neither writes nor reads the table. Neither the migration nor the
grant has been applied to the local 3307 database yet.

`FootballImport` and `FootballFixtureAudit` stay insert-only: the catalog importer
writes each receipt and audit once, with final values, so the live runner needs no
additional grant.

Prompt 058 adds the nine paid-access tables (migration
`20261019142209_subscriptions`), bringing the schema to 89 models. The
application receives:

- SELECT, INSERT and UPDATE on `MemberAccount`, `MemberSession`,
  `SubscriptionPlan`, `PaymentSubmission`, `PaymentScreenshot`, `AccessCode`,
  `SubscriptionSettings`, `RateLimitBucket` and `OwnerAuditEvent`;
- DELETE on `MemberAccount` (the never-paid purge and permanent deletion), `MemberSession`
  (sign-out, eviction and expiry), `PaymentScreenshot` (screenshot purge and
  erasure), `RateLimitBucket` (throttle purge), and `PaymentSubmission`,
  `AccessCode` and `OwnerAuditEvent` (admin-confirmed permanent account deletion).

Plans and settings are retained; plans are deactivated instead of deleted.
Personal-data erasure retains accounting history. The separate permanent account
deletion action removes the account and all its related records, including
payments, codes and account-linked audits. Apply the additional DELETE grants in
`docs/deployment/manual-account-grants.sql` before deploying this action. As with the odds tables, apply the
grants after `npm run db:deploy`. They were applied locally on 19 October 2026
and are recorded as section (H) of `application-grants.sql`. Paid access stays
off (`paywallMode = off`, the default when `SubscriptionSettings` has no row).

Member password and SMS authentication adds `MemberVerification` and nullable password/authentication fields in
`20261020193000_member_password_sms`. Apply that migration before running the new account flows, then grant the
application role SELECT, INSERT, UPDATE and DELETE on `MemberVerification`. The migration was applied to the local
MySQL target on 20 October 2026 and schema verification passes. The existing local administration credentials were
initially read from an MSIX-shadowed configuration; the real saved administrative configuration worked from an
out-of-package helper. The narrow application grant is now applied and recorded in the real private
`application-grants.sql`. Application SELECT/INSERT/UPDATE/DELETE were verified with a rolled-back synthetic transaction,
the verification table stayed empty, and database health reports `ready`. No production database was changed. See
[member-authentication.md](member-authentication.md) for manual recovery and expiry rules. Message delivery is retired.

The manual account release was applied locally on **22 October 2026**:
`20261021090000_payment_screenshot_approval`,
`20261021103000_standard_subscription_packages`,
`20261021110000_saved_slips` and `20261021120000_manual_password_recovery`.
`npm run db:verify` confirms the applied history and exact schema; no reset,
credential changes or migration-history rewrite was needed.

The application role has SELECT, INSERT and DELETE on `SavedSlip`, and SELECT
and INSERT on `SavedSlipFixture`, as documented in
[manual-account-grants.sql](deployment/manual-account-grants.sql). Snapshots and
links are never updated; erasing an account deletes its snapshots and cascades
to their links. Existing table-scoped account/session grants cover the new
recovery columns. The application still has no database-level DDL privileges.
The actual private `application-grants.sql` records the new grants.

The account-update SMS outbox (`20261025230000_payment_notification_outbox`) adds
`PaymentNotificationOutbox`. After `npm run db:deploy`, grant the application role SELECT,
INSERT, UPDATE and DELETE on it, as in
[manual-account-grants.sql](deployment/manual-account-grants.sql), before starting
the release: payment approvals, rejections, credit approvals and auto-renewals
insert a row in their own transaction, so without the grant every such decision
fails. DELETE serves the members purge, erasure and the owner's Dismiss; permanent
deletion removes rows by cascade. The table holds no phone number or message
text. The migration and grants were applied locally on 26 October 2026, with
column-scoped dispatch-state UPDATE. See the
[integration and migration record](reports/checklist-integration-2026-10-26.md).

Before deployment, an AES-256-GCM encrypted consistent InnoDB dump was saved
under the private installation's
`manual-account-rollout-20261021T211327Z-3df1f4c5` directory, with its key in
the separate sibling key directory. Full authenticated decryption and the
plaintext SHA-256 comparison passed. No plaintext SQL dump was written. This
is a local pre-migration checkpoint, not a PITR or restore qualification. The
encrypted artifact, manifest and separate key were also copied to the real
native private installation outside the desktop application's cache, with all
three copied files checked against their source hashes.

The expected server UUID, local listener and normal recovery mode were checked.
Application and migration credentials authenticate without changes. The saved
admin file visible from the packaged desktop application is an older AppData
shadow, so grants were applied by a one-time interactive scheduled helper using
the real native administrator file; the helper verified the actual file path,
UUID and datadir before granting anything. All temporary scheduled tasks were
removed afterward. The normal `GoalHintMySQL84` startup task was preserved.

Local subscriptions remain in `test` mode, with the existing Test Daily, Weekly
and Monthly packages, both configured receiving wallets, support contact and
environment-managed administrator login. An application-role transaction
verified registration, duplicate-number handling, admin recovery, one-use
temporary passwords, forced password change, JPEG proof upload, manual approval,
subscriber access and saved-slip grants/cascade. It was rolled back and checked
to retain no test accounts, payments, sessions or access periods. Audit sequence
numbers can have harmless gaps after rolled-back inserts. The running local
Account, Subscribe and Admin pages returned HTTP 200 without storage errors.
No production database or deployment was changed.

### 23 October 2026 account availability repair

Admin sign-in and member registration failed because the local database had not
applied `20261023090000_member_message_verification` and
`20261023130000_single_member_login`. The connection-only health probe still
reported ready while account queries failed on missing columns.

A consistent encrypted backup was created and its full authenticated decryption
verified before applying both migrations to the existing local MySQL instance.
`npm run db:status`, `npm run db:verify` and `npm run db:health` now pass.
Administrator login/authorization and registration's restricted verification
session were checked in a transaction whose test writes were rolled back.

The health command now checks the current account, session and verification
columns with zero-row reads. Missing columns or account-table SELECT permissions
return `schema-unavailable` and migration/permission guidance.

Prompt 044 adds the seeded `OperationsMonitorState` singleton and time-window
indexes. The local application receives only SELECT and UPDATE (`stateJson`) on
that table; INSERT/DELETE/DDL remain denied. Its empty initial state enables no
monitoring, owner, destination, retention policy or telemetry recipient. Live
monitoring remains blocked by the owner's local-verification-only decision; see
[operations-monitoring.md](operations-monitoring.md).

## Start, stop and verify

The per-user Windows scheduled task `GoalHintMySQL84` starts the server when the
current user signs in. It runs `start-mysql.ps1` in a hidden PowerShell window,
without administrator privileges or a stored password. This starts after Windows
sign-in, rather than before sign-in as a Windows system service would.

The task allows startup on battery, has no execution time limit, prevents
overlapping task runs and retries a failed launch up to three times at one-minute
intervals. The launcher serializes concurrent starts, waits up to 60 seconds for
port 3307, verifies that the listener belongs to the configured MySQL binary and
configuration, and records readiness in the private `startup.log`. The previous
duplicate Windows `Run` entry was removed after the task passed an actual
shutdown/start check on 20 October 2026. This remains a local development process.

Start it manually:

```powershell
Start-ScheduledTask -TaskName 'GoalHintMySQL84'
```

The same private launcher can also be run directly:

```powershell
& "$env:LOCALAPPDATA/GoalHint/start-mysql.ps1"
```

Stop only this local instance:

```powershell
& "$env:LOCALAPPDATA/GoalHint/mysql-8.4.11/bin/mysqladmin.exe" `
  "--defaults-file=$env:LOCALAPPDATA/GoalHint/admin.cnf" --no-login-paths shutdown
```

From the Next.js application root (`next-js/`), use the existing private database commands:

```powershell
npm run db:health
npm run db:deploy
npm run db:verify
npm run dev
```

Migrations deploy through the migration account. `db:verify` checks applied
migration state and schema drift. Test commands continue to use their own
throwaway MySQL instances; no `TEST_DATABASE_URL` points to this application
database. The existing development watcher reloads `.env.local` changes.

Keep the data directory across code updates. Do not use a migration reset or
delete the installation to resolve a connection failure. Inspect the private
server log and credentials, check port ownership and use reviewed forward
migrations. Prompt 045 adds encrypted backup/restore tooling and a disposable
local drill; see [backup runbook](backup-restore.md). The owner keeps recovery
objectives, ownership, retention and hosted PITR unresolved. No backup schedule,
binlog setting, source-data deletion or restore is applied to this instance.
Database readiness does not approve provider calls, forecasts, publication,
recovery credentials, indexing or production release.

The verified local application serves `/en` successfully. Its match API retains
the existing unavailable response while the required competition list is
unselected; this happens before feed SQL executes. Configure only owner-approved
competitions and complete the existing provider/forecast prerequisites before
expecting populated feeds. No sample fixture or prediction rows were inserted
to conceal that missing configuration.


### Member retention worker (065)

The retention worker deletes from `MemberAccount`, `MemberSession`,
`MemberVerification`, `PaymentScreenshot` and `RateLimitBucket`. Saved-slip erasure
also needs DELETE on `SavedSlip`; fixture links cascade. The admin's separate
permanent deletion flow additionally needs DELETE on `PaymentSubmission`,
`AccessCode` and `OwnerAuditEvent`, provided by `docs/deployment/manual-account-grants.sql`.
The live maintenance loop and cPanel cron invoke the same hourly, conditional
`lastMembersPurgeAt` claim; authenticated admin page loads and
`npm run members:purge` are fallback triggers. The command performs deletion;
run it only on the intended database with the owner's approval. This feature's
checks use owned throwaway engines; no purge was run against the developer or
production database.

Batches contain at most 100 rows, with a 100,000-row cap per category per claim;
any remainder is handled by a later hourly run. Screenshot selection is
rechecked while holding account locks. Pending images are never eligible;
approved/reversed images use the configured decision-age retention (90 days by
default), rejected/superseded images use seven days. Metadata remains.

Throttle writers now record at least the fixed-window end in the existing
`lockedUntil` column, preserving any longer lock. Purge waits a day after both
the window and this marker. Older null markers conservatively retain a full
24-hour window plus a day, since their hashed key cannot reveal the purpose.
This uses the existing schema and records no raw address or session token.


## Paid access (066)

Owner erasure updates phone/support/payer/image fields and deletes sessions; amounts, transaction IDs and code/audit history remain. Real-data purge and erasure need owner authorization. Tests use isolated disposable databases only. See [subscriptions.md](subscriptions.md).

## 20 October 2026 forward repair

The owner authorized repair without deleting existing data. Existing
`FixtureFacts`, `FootballVenue` and `SeasonStandings` tables are represented in
Prisma and adopted by `20261020000000_adopt_match_facts`. The next forward
migration recreates ten append-only triggers with dump-safe compound bodies.
An encrypted private checkpoint was verified before DDL. No reset, data deletion
or migration-history rewrite occurred. All 29 historical migration rows and 91
durable application tables matched the pre-repair inventory; normal page reads
can update the response cache. Two new forward history rows were added.
`npm run db:verify` reports no drift. The 93-table backup drills include populated
adopted tables, successful legacy history and its rolled-back attempt.

Development uses `next dev --webpack` through nodemon. Next owns source HMR;
nodemon restarts for environment changes. This avoids the reproduced Turbopack
Edge-instrumentation hang. Paid access remains off; nothing was deployed.


**Later owner instruction, 20 October:** nothing should remain closed locally. The confirmed receiving-wallet name was saved privately; local test mode is open, with the existing daily plan preserved and approved Weekly/Monthly plans added through the plans service. Settings/mode changes are audited. No existing data was deleted. Production activation/deployment did not occur; release/legal notices remain drafts.

## 20 October 2026 database recovery

The owner authorized recovery after MySQL stopped accepting connections. The
original directory contained older system metadata and redo logs alongside newer
application tables. A complete cold copy was preserved with a SHA-256 manifest
before recovery work; no reset or deletion of original database files was used.

Recovery used the authenticated 93-table checkpoint from 05:27 EAT and copies of
15 newer physical tables on isolated MySQL targets. Full row hashes matched the
checkpoint for 87 tables, including all member and payment tables. The six
analytics differences were reconciled: one expired administrator session was
absent after the recorded purge; later events, pageviews and sessions were
preserved, with monotonic counter/time updates. All 93 extended table checks,
114 CHECK constraints and foreign-key checks passed. A fresh encrypted checkpoint
containing 54,514 rows authenticated successfully and matched a second isolated
restore. These findings establish agreement with the checkpoint and recovered
readable files, rather than an absolute guarantee about unavailable history.

MySQL now runs normally on `127.0.0.1:3307`, with `innodb_force_recovery=0`.
Documented table and column grants were restored for all 92 application models;
migration-history access remains excluded. The existing launcher and credentials
remain in use. The local subscribe page reads the three existing plans in test
mode. Nothing was deployed.

The recovered directory
`%LOCALAPPDATA%\GoalHint\repairs\subscribe-recovery-20261020T093154Z\extracted-data`
and its evidence remain preserved. A later native file-handle and SQL identity check established that the current
unvirtualized server actually uses **`%LOCALAPPDATA%\GoalHint\data`**, with server UUID
`2f3984e9-c6e2-11f1-9e3a-6c2408f48ddb`. Its real `mysql.ini`, existing startup task and administrative credentials agree
with that instance. Do not move or replace either directory based on a packaged application's apparent file contents.
The original preservation manifests, encrypted checkpoints and recovery evidence remain private.

## MSIX filesystem virtualization during local administration

The Microsoft Store Codex app can read an older private AppData shadow before the real directory. The same apparent
`%LOCALAPPDATA%\GoalHint` path then resolves into
`%LOCALAPPDATA%\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\GoalHint`. This shadow contained different config,
credentials, server identity and physical database files; a clone of it was not the live database. See Microsoft's
[AppData virtualization behavior](https://learn.microsoft.com/en-us/windows/msix/desktop/flexible-virtualization).

For administration, tie the exact IPv4 listener to its executable/monitor process and verify SQL port, UUID and datadir.
Use native final file-handle paths to distinguish real files from a package shadow; matching path text alone is
insufficient. Run the existing `GoalHintMySQL84` scheduled launcher to start the unvirtualized instance. An explicitly
authorized one-time scheduled helper under the same interactive user can read its real private administrative config
without exposing a password. Remove that temporary task after it finishes; preserve the normal startup task.

On 20 October, the actual instance was restored through its existing launcher and verified against the pre-shutdown
inventory: the same UUID/datadir, all 93 application table definitions, 32 migration-history rows and unchanged member,
session, verification, payment, access-code and settings counts. Normal startup has no init-file flag. The SMS table's
narrow grant was then applied directly using the real saved credentials, without changing passwords, data, schema or
the real startup configuration. Shadow clones were shut down cleanly and their cold copies/evidence preserved.

## XAMPP phpMyAdmin access

XAMPP's Apache serves [phpMyAdmin](http://127.0.0.1/phpmyadmin/index.php?server=2).
Choose **GoalHint MySQL 8.4 (3307)** and sign in with `goal_hint_app` and its existing
private database password. The cookie-authenticated server entry in
`C:\xampp\phpMyAdmin\config.inc.php` points to `127.0.0.1:3307`; no password is
stored in that entry. Its application permissions also apply in phpMyAdmin.

On 20 October 2026, a browser login with the existing application credentials
listed `goal_hint_db`, including its member, session, payment and settings tables.
Application database health returned `ready`, and `/en/account` displayed its
account form again. XAMPP's separate MariaDB service continues to use port 3306.

## 31 October 2026 authorized migration update

The owner requested all pending migrations and current database readiness. The
existing administrator configuration was recovered through the native-path
workflow above, using same-user limited temporary helpers. Native file handles,
SQL port/UUID/datadir and disabled recovery mode matched the existing instance.
No administrator password, server directory or startup configuration changed.

A private, access-restricted pre-migration logical backup included routines,
triggers and events. Its SHA-256 and restore on a separate disposable MySQL
server matched all 109 base tables and 47 completed migration records. The
backup and private grants record remain outside the repository.

All eight pending migrations, from `20261028120000_compact_feed_recommendation`
through `20261031120000_referral_rewards`, applied successfully. Required
SharedSlip, SlipConfiguration and MemberReferral application permissions were
added and checked; the application still has no DDL privileges. MemberReferral
allows SELECT/INSERT/UPDATE, not DELETE. The migration role remains separate.

Final checks found 112 base tables, 55 completed migrations and zero pending or
unfinished migrations. `npm run db:verify` passed without schema drift and
`npm run db:health` reported ready. A rollback-only application-role smoke test
verified referral registration/verification/award and password/session rotation;
no synthetic accounts/referrals remained and no external messages were sent.
Temporary administration tasks were removed; the normal startup task remains.
This update applies to the configured local MySQL instance, not remote production.
