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

`FootballImport` and `FootballFixtureAudit` stay insert-only: the catalog importer
writes each receipt and audit once, with final values, so the live runner needs no
additional grant.

Prompt 058 adds the nine paid-access tables (migration
`20261019142209_subscriptions`), bringing the schema to 89 models. The
application receives:

- SELECT, INSERT and UPDATE on `MemberAccount`, `MemberSession`,
  `SubscriptionPlan`, `PaymentSubmission`, `PaymentScreenshot`, `AccessCode`,
  `SubscriptionSettings`, `RateLimitBucket` and `OwnerAuditEvent`;
- DELETE only on `MemberAccount` (the never-paid purge), `MemberSession`
  (sign-out, eviction and expiry), `PaymentScreenshot` (screenshot purge and
  erasure) and `RateLimitBucket` (throttle purge).

Payments, codes, plans, settings and audit rows are never deleted by the
application; plans are deactivated instead. As with the odds tables, apply the
grants after `npm run db:deploy`. They were applied locally on 19 October 2026
and are recorded as section (H) of `application-grants.sql`. Paid access stays
off (`paywallMode = off`, the default when `SubscriptionSettings` has no row).

Prompt 044 adds the seeded `OperationsMonitorState` singleton and time-window
indexes. The local application receives only SELECT and UPDATE (`stateJson`) on
that table; INSERT/DELETE/DDL remain denied. Its empty initial state enables no
monitoring, owner, destination, retention policy or telemetry recipient. Live
monitoring remains blocked by the owner's local-verification-only decision; see
[operations-monitoring.md](operations-monitoring.md).

## Start, stop and verify

`GoalHintMySQL84` in the current user's Windows `Run` registry key starts the
server when that user signs in. It runs `start-mysql.ps1` with a hidden PowerShell
window. The launcher returns when the same server already owns port 3307 and
refuses to start over an unrelated listener. This is a local development process;
it is not a Windows system service or hosted worker.

Start it manually:

```powershell
& "$env:LOCALAPPDATA/GoalHint/start-mysql.ps1"
```

Stop only this local instance:

```powershell
& "$env:LOCALAPPDATA/GoalHint/mysql-8.4.11/bin/mysqladmin.exe" `
  "--defaults-file=$env:LOCALAPPDATA/GoalHint/admin.cnf" --no-login-paths shutdown
```

From the repository root, use the existing private database commands:

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

The application/worker account needs DELETE only on `MemberAccount`,
`MemberSession`, `PaymentScreenshot` and `RateLimitBucket`, as already listed in
section (H) of the grants. No DELETE is granted on submissions, codes or audit.
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
