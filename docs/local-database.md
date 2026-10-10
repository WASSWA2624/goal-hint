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
