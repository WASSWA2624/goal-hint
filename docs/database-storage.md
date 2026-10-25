# Database storage measurements

`npm run db:storage` inspects the configured MySQL 8.4 database through the same
private runtime, credentials, TLS and approval gates as existing database tools.
It makes no provider calls, selects no member records and returns no JSON bodies.
No schema migration, scheduler or external notification is enabled.

```powershell
# Inspect current engine metadata and up to 100 JSON records per supported table.
npm run db:storage

# Keep a private baseline; run again later to measure growth over the elapsed period.
npm run db:storage -- --record --target development

# Explicit operator-selected limits, in bytes and bytes/day. No default limits are invented.
npm run db:storage -- --record --target production --max-allocated-bytes <approved-cap> --max-growth-bytes-per-day <approved-rate>

# Allocation-only inspection, with payload sampling disabled.
npm run db:storage -- --sample-rows 0
```

Every report includes the database UTC measurement time, a hashed server/schema
identity, per-table data/index allocation, estimated rows and average row bytes,
and total allocation. The hash prevents comparisons between different servers or
schemas without printing their names or connection details. All visible base tables in
the current schema are included, including indexes, migrations and new publication
tables; at most 512 tables are accepted. Missing or unsafe metadata is unavailable,
never silently changed to zero.

MySQL metadata follows the inspection account's object visibility. Use an account
with SELECT visibility across the complete application schema before treating
the totals as a database-wide capacity baseline. Restricted-role totals can omit
tables that account cannot see; changing grants can also look like added/removed
tables in a growth comparison. The collector does not elevate its privileges.

Table labels preserve the spelling reported by MySQL. The fixed JSON sampling
allowlist matches case-insensitively so Windows `lower_case_table_names=1` metadata
still receives the same samples as case-preserving Unix deployments.

MySQL's [TABLES documentation](https://dev.mysql.com/doc/refman/8.4/en/information-schema-tables-table.html)
describes InnoDB row counts and average lengths as estimates, and data/index
lengths as engine-reported page allocation. These are not exact filesystem usage
or a full-row byte count. Free tablespace, redo/undo logs, temporary data, backups,
replicas and unrelated schemas are outside this report. The command temporarily
sets its session's `information_schema_stats_expiry` to zero to avoid stale cached
metadata, restores the original value in `finally`, and closes its owned runtime.
It does not run `ANALYZE TABLE`, change global settings or alter stored records.

For prediction, result, live-observation, evidence, odds and publication JSON,
the database computes a bounded primary-key-ordered sample's count, sum, maximum
and mean of `JSON_STORAGE_SIZE`. Raw contents and record IDs never leave the
database. This is a real size measurement of the stored binary JSON payload,
not its complete physical row, network encoding or all records. It is a bounded
sample rather than a statistically representative cohort. The
[JSON utility documentation](https://dev.mysql.com/doc/refman/8.4/en/json-utility-functions.html)
also distinguishes insertion storage size from space freed by partial updates.
Empty samples have zero count/bytes and an unavailable mean; permission/coverage
failures have an explicit `unavailable` sample with null values. Tables absent
before their migration are not fabricated as empty samples. Sampling is capped
at 1,000 rows per supported table and each SELECT has a five-second engine limit;
the complete inspection transaction is bounded to thirty seconds.

`--record` atomically retains the last thirty measurements in the ignored private
`.goal-hint/storage/<target>.json` file, capped at 16 MiB. A per-target exclusive
lock prevents concurrent baseline loss. A pre-existing lock is never removed by
another invocation; after an interrupted command, inspect the process and retain
the history before manually removing a stale lock. Target labels accept coded
names only. Keep the directory's operating-system permissions private; it is not
a public artifact or a replacement for a database backup.

Growth compares only increasing-time measurements of the same database identity.
Reports include elapsed time, total and per-table allocation changes, added and
removed tables, and a normalized bytes/day rate. Shrinkage remains negative.
This is a two-observation rate, not a forecast; page allocation and short intervals
can make it noisy. Choose an operating interval and limits from measured capacity.
Missing, changed-target or backward-time baselines leave growth unavailable.

Exit codes are `0` for measured inspection below configured limits (or with limits
disabled), `1` for disabled/unavailable measurement, `2` when a supplied limit is
reached, and `3` when a requested allocation/growth check lacks its measurement or comparable baseline.
Record the first baseline and run later before treating growth as measured. A
failure never overwrites a previous baseline or prints driver diagnostics.

## Existing operations monitoring

An approved `MonitoringBinding` may supply an optional `storage` source, analogous
to its backup-health source. `storageHealthFromReport(report, evidenceRef)` prepares
the numeric evidence from `databaseStorageReport`; the binding's `verify` must
independently approve the exact target, clocks, report provenance and limit values.
A reference string alone is insufficient. The inspector checks freshness and
verification before adding optional storage evidence to its snapshot.

The existing bounded, deduplicated outbox then evaluates `storage-cap` and
`storage-growth` under the `database` scope. No new destination or incident owner
is inferred. Missing, expired, future, unapproved or absent-baseline data stays
unknown and cannot clear a firing incident. Negative growth remains visible in
the storage report; an outbox resolution uses zero to preserve its nonnegative
alert-value contract. Without a supplied storage source, existing monitoring
snapshots retain their prior shape and storage rules remain unknown.

The focused contract tests are `tests/database-storage.test.mjs` and
`tests/database_storage_test.py`. Genuine MySQL query acceptance and actual
deployment growth series must be distinguished from synthetic arithmetic tests.

On 25 October 2026, the storage unit/integration run passed all eight tests against
an owned portable MySQL Community Server 8.4.13 instance, with no skips. This
verified real allocation/JSON aggregates and session-setting restoration using
SELECT-only table grants. Windows lowercase metadata sampling has its own
regression. The throwaway instance was stopped and removed by the ownership-aware
harness; this does not establish a production capacity or growth baseline.
