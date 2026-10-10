# Backup and restore runbook

Prompt 045 is **local verification only**, as explicitly selected by the owner
on 10 October 2026. OP-31 ownership, recovery point objective (RPO), recovery time
objective (RTO), retention, hosted storage and PITR remain unresolved. No live
backup schedule, destination, production restore or deletion job is enabled.
Local restoration evidence does not establish production disaster recovery.

## Implemented tooling

`scripts/backup.mjs` provides private, one-shot `snapshot`, `archive`, `restore`
and `restore-pitr` commands. Each requires an absolute path to a trusted operator
module exporting `createBackupBinding(runtimePolicy)`. There is no public route
or permissive live binding. Run from the repository root:

```powershell
npm run backup -- snapshot --binding C:\Private\GoalHint\backup-binding.mjs
npm run backup -- archive --binding C:\Private\GoalHint\backup-binding.mjs
npm run backup -- restore-pitr --binding C:\Private\GoalHint\backup-binding.mjs
```

These paths illustrate the interface; no such configured binding is shipped.
A binding supplies `policy`, `authority`, an explicit fresh artifact `directory`,
32-byte `key`, `source`, optional private `emit`/`close`, and, for restore,
`prepareTarget` and `verifyRestored`. Archive additionally receives the successful
snapshot receipt. Authorization is rechecked at operation boundaries; storage
approval and source quiescence are mandatory. `verifyPolicy` checks the entire
parsed policy against current evidence. `authorize` covers the actual source,
operation, target isolation and runtime/database/rights/budget approvals; accepting
an evidence-reference string alone is insufficient. `verifyStorage` must check
actual OS ACLs, encrypted temporary storage, approved location and permissions.

The live policy requires an approved owner, RPO/RTO, key/grants/permissions/release
references and finite retention decisions for predictions, results, evidence,
audits, structured data, snapshots and binlogs. Local policy deliberately permits
null objectives/retention; it accepts only a process-owned disposable source.
No test policy is a live authorization. A scheduler can invoke the one-shot
snapshot command with a fresh unique directory and an approved binding; there
is no default frequency or installed scheduler. Complete hosted archive transport
and restore qualification before activating that scheduler.

## Consistency, encryption and compatibility

The MySQL 8.4/InnoDB snapshot streams `mysqldump --single-transaction
--source-data=2 --set-gtid-purged=OFF --no-tablespaces --hex-blob --triggers` through
gzip and AES-256-GCM. DROP-table and restore LOCK statements are disabled. The
commented source coordinate is checked against the fenced source. SQL goes
through process pipes, avoiding PowerShell output encoding and command-length
limits. Files are exclusive/immutable, written through a partial file and
renamed after completion. Private option-file paths replace command-line
passwords; child environments exclude application/provider credentials and
diagnostic options. Raw stderr/SQL/errors are withheld.

The operator must fence **all writers and DDL**, including migrations, workers,
pollers, manual tools and other account callers, while collecting this verifier's
reference inventory and snapshot. The binding must verify that fence, rather than
assume stopped web traffic proves it. Before/after inventories and coordinates
detect changes. Do not remove the fence until the snapshot receipt is complete.
For large installations, qualify a managed/physical online snapshot with an
equivalent consistent-coordinate verifier instead of extending this local drill.

Authenticated artifact metadata records the source UUID/version/database, exact
log coordinate and UTC observation, approval policy hash, release/grants refs,
Prisma migration names/checksums, schema/lockfile fingerprints and inventory.
Inventory includes each table's count and SHA-256 over sorted complete-row hashes,
columns/indexes/check constraints, foreign-key definitions and orphan checks,
and trigger definitions/definers. Original JSON payloads and timestamps stay in
the encrypted snapshot, not logs. Views, non-InnoDB tables, cross-schema keys,
stored routines/events, failed migrations and incompatible schema are refused.
The bounded reference collector fails above 64 MiB of query output; the local
raw-log collector refuses individual files above 64 MiB. These are tooling
bounds, not approved workload/retention limits.

Each `.ghb` artifact authenticates its format header, key reference and metadata
as AES-GCM additional data. Wrong keys, altered headers/bodies/tags and truncation
fail verification. A complete authentication pass precedes SQL execution. No
plaintext SQL dump is written. Decrypted binlogs exist only inside the owned
restore directory, are checked and removed after replay, and are removed with
that disposable instance on normal failure/exit. Restrict/encrypt this scratch
volume; secure deletion after a crash or physical disk erasure is not claimed.
Keys live in an approved secret manager or ACL-restricted external file, never
Git, the backup itself, CLI arguments or ordinary logs. An authorized operator
obtains the matching key version through the separately approved access process;
test keys are generated in memory, then zeroed. Key escrow/access/rotation proof
and off-host recoverability remain OP-31 gates. `.ghb` files are ignored by Git.

## Repeatable local proof

Use the existing genuine MySQL 8.4 binary discovery. MariaDB and installed services
are not restore targets:

```powershell
$env:MYSQL_TEST_SERVER_BINARY = "$env:LOCALAPPDATA/GoalHint/mysql-8.4.11/bin/mysqld.exe"
npm run test:backup
```

The test creates its own loopback MySQL source, migrates it, uses synthetic
policies/providers and representative canonical records, encrypts a snapshot,
then records result corrections and a counted uncertain dispatch across two
binary logs. It separately restores the base snapshot and the later committed
point. Nothing is imported into `goal_hint_db` or port 3306/3307. The shared
`scripts/lib/isolated-mysql.mjs` checks child ownership, datadir, UUID and port
before administrative operations or cleanup. Its test import remains available
through `tests/helpers/mysql-instance.mjs`.

Restoration accepts **no target URL**. It authenticates every artifact and checks
compatibility before allocating a new owned instance with the original database
name. MySQL events are OFF; the server binds only to loopback and has no app
accounts or upstream credentials. A reviewed `prepareTarget` can recreate only
required database-scoped principals/trigger definers using fresh secrets. Never
import `mysql.*`, root accounts or old authentication material. The verifier
compares all table hashes/counts, schema, FKs and triggers after snapshot import,
then again after replay. A trusted callback checks domain access and permissions;
the command refuses a restore without it. The target is stopped and removed in
`finally`; the tool has no promotion or production cutover operation.

Executed local evidence on 10 October 2026: `npm run test:backup` passed all
**9 checks**, with no skips, using MySQL Community Server **8.4.11**. The base
restore took **19,103 ms**, recovering through **2026-10-10T06:17:17.203Z**; the
two-log restore took **13,300 ms**, recovering through
**2026-10-10T06:17:22.724Z**. Both matched all **63 tables** (62 application models
plus Prisma migration history), their complete-row hashes/counts, schema, foreign
keys and triggers. Domain checks covered locked/current immutable forecasts,
original timestamps, manifests, schedule/result corrections, audits, evidence
revocation/expiry, least-privilege denial, duplicate receipts, stale jobs and
conservative quota recovery. Tampering was refused before account preparation.
RPO/RTO comparison is **unapproved**, because the owner supplied no objectives.
These timings are one local drill, not a capacity benchmark or hosted recovery
qualification. Private execution record: `.tmp/045-restore-final.log`.

## PITR and hosted infrastructure qualification

The owned drill explicitly uses ROW binlogs, `sync_binlog=1`,
`innodb_flush_log_at_trx_commit=1`, a `binlog` basename and disabled auto-purge
only for its short disposable lifetime. No persistent server setting is changed.
Archive closes the current log, encrypts contiguous segments and commits an
authenticated recovery-point catalog. Mixed source UUIDs, wrong snapshots,
missing/duplicate/reordered files, traversal and backwards positions are refused.
Replay validates binlog checksums and passes all files to **one** mysqlbinlog
process and **one** mysql session, with first-file start and last-file stop
positions. The end is the fenced source's completed-transaction position; an
arbitrary wall-clock cutoff is not accepted. Bulk data changes do not replay
outside that exact boundary.

Before a hosted release, the assigned operator must:

1. Select/approve hosting, backup budget, primary/backup owner, secret/access
   process, source rights and per-class retention. Record numeric RPO/RTO and
   snapshot/archive/restore-drill cadences. Confirm TLS identity and database
   isolation. Use a dedicated database server/log stream; the local replayer
   does not filter a shared multi-tenant stream into a different database name.
2. Configure and export evidence for automated consistent snapshots, backup
   encryption/key versions, independent storage/failure-domain access and PITR
   retention. Record provider restore API, permissions, supported MySQL version,
   transaction-consistent coordinate/GTID semantics and available recovery window.
   Verify snapshot and binlog overlap across rotations and instance replacement.
3. If using self-managed MySQL, review ROW logging and durable flush settings,
   choose the actual approved `binlog_expire_logs_seconds`, and continuously
   archive all required logs through verified TLS to independent encrypted
   storage. A private replication reader needs the reviewed replication/log
   privileges, separate from the app. Use the supported mysqlbinlog remote/raw
   transport or a qualified host agent; **this repository's owned-log exporter
   intentionally refuses hosted targets**. MySQL-encrypted source logs require
   server-mediated export, not raw ciphertext file copies. Qualify that transport
   and catalog format before reporting hosted PITR as working.
4. Restrict the dump account to database SELECT/SHOW VIEW/TRIGGER plus only
   necessary snapshot-coordinate privileges (REPLICATION CLIENT and reviewed
   RELOAD/FLUSH_TABLES). Exclude app/root credentials from the schedule. The
   restore account exists only on the isolated target; app grants remain scoped
   to current mutable columns and append-only history. Test actual permission
   denial and trigger-definer execution after restoring the selected host.
5. Prove an isolated restore from **off-host stored artifacts** with independently
   retrieved keys and the selected application release. Verify domain history,
   grants and safe restart below. Measure actual data loss and time through
   reconciliation/operator cutover against approved RPO/RTO. Keep the failed
   attempts and diagnostics private; a successful local import alone is not RTO.
6. Monitor scheduling failures/missing success, snapshot/log age, archive gaps,
   storage capacity, key availability and restore-drill age. Use independently
   supervised alerts under OP-30. Simulate a failed backup and missing segment.
   No production restore, live data deletion or paid provisioning is authorized
   by this local exercise.

Do not purge logs until every retained baseline has a verified continuous chain
through its required recovery window and independent copy. Do not adopt MySQL's
default expiration as an owner-approved retention decision. Full-chain failure,
unknown source permissions or missing hosted credentials remains a release
blocker. No arbitrary pruning/deletion function is shipped.

## Quarantine and safe resumption

Keep application/workload identities, outbound network access and schedules
withheld during restoration. The tool's `quarantined` result describes this
isolated topology, not a new flag that live worker code can bypass or clear.
An external incident fence is required for any future promotion: stop/fence all
old replicas and account callers, revoke old credentials and verify they cannot
resume against either database. No automatic resume/promotion is implemented.

Compare canonical manifests, accepted refresh receipts, immutable revisions,
current/locked references, schedule/result corrections, settlement history and
audit receipts first. Published receipts are final even if their job lease was
restored running. Use the existing authenticated watchdog/queue recovery with
expected versions and cutoff/run eligibility, not wholesale lease, attempt,
receipt, model-pin or cycle resets. Let valid leases expire; recover stale work
with existing fenced transitions. Reconcile cutoff locks and stored settlement
before retrying eligible unpublished work. An expired job/cycle stays expired;
a later delay cannot reopen a closed cycle. Discard/reconcile old public caches
through their existing expiry/invalidation tools while preserving canonical
receipts and original source/publication clocks.

A restored limiter may be older than requests already spent by any caller.
Before granting **any** outbound identity, obtain current, approved account-wide
capacity from an independent intact limiter/provider control plane. Do not use
the old restored allowance to fund an uncounted diagnostic probe. Reconcile via
the existing limiter's verified `initialize`: remaining capacity can only fall,
spent/uncertain requests remain charged and later larger headers cannot refill
it. Preserve subscription/credential failures, pacing, cooldowns, period IDs and
candidate state. If current capacity, other callers or an outstanding reset
probe cannot be established, remain fenced; do not mint another candidate probe.
At a verified next boundary use the existing single counted `reserveResetProbe`
and successful `claimLaunch`/response/`confirmReset` protocol. No bulk dispatch
before confirmation. Reconcile AI/research reservation liabilities, external
invoices and in-flight calls independently before granting their identities;
restoring their old ledgers is not restored spending authority.

## Rollback, retention and privacy

The default restore requires the repository's exact migration names/checksums,
schema hash and dependency-lock hash. Check out the recorded reviewed release
and inspect migrations before recovery. New/old schema or changed checksums
fail closed; this tool does not auto-upgrade/downgrade an artifact. For a release
rollback, prefer rolling application code back against proven compatible
additive schema. Use expand/contract migrations and preserve original revisions,
markets, evidence clocks, IDs, manifests, receipts and corrections. Destructive
down migrations, Prisma reset and editing migration history are not rollback
procedures. A partially applied MySQL DDL migration requires inspection and a
reviewed forward repair; DDL is not assumed transactionally reversible.

No prediction/result/evidence/audit/structured-data/backup deletion period has
been approved. This is not permission to retain source data forever. OP-08/13/31
must establish contractual reuse, archive and backup copies, legal holds and
deletion/suppression rules, including after restoration. Before promoting an old
backup, reapply current permission revocations/deletion obligations and current
log/telemetry retention from an independent record. Hash integrity alone cannot
authorize source reuse or revive expired display rights. The tests exercise the
existing evidence permission verifier after restoration.

The actual local artifacts contain synthetic football/history data and are
removed by the owned drill. Production backups could include shared response
caches with search strings, source mentions of players, private operational state
and immutable audit records. No visitor account/profile, analytics collector,
new recipient or changed public retention claim is introduced. The prelaunch
privacy summary continues to disclose unresolved backup/log/source retention;
final notice/release remains blocked. See [privacy inventory](privacy-page.md).

## Private health evidence

One-shot operations emit allowlisted `backup-health` success/failure events with
operation, UTC times, elapsed duration, recoverable UTC point, objective status
and coded reason. CLI defaults to private stdout; a binding can supply an approved
sink. There are no paths, source payloads, SQL, credentials or visitor identifiers.
Objectives are `unapproved` when unset. Local restore duration includes target
creation/import/verification/cleanup, but excludes future live incident response
and promotion. Demonstrated lag is measured from the source point to verification;
it is not a production RPO claim. Process termination still needs an independent
missing-success/age check.

The 044 private monitoring binding optionally supplies `backup.read/verify`
with approved aggregate evidence and explicit snapshot/archive/restore maximum
ages. The entire evidence object must be verified. Missing, stale, future,
revoked or malformed evidence yields pending metrics, not zeros. Fixed
`backup-failures`, `backup-stale`, `restore-verification-pending` alerts reuse
the durable deduplicated outbox. No live backup-health adapter/destination is
enabled. Retention of these events and independent failure notification still
need OP-30/31 approval.

Official references reviewed on 10 October 2026: [mysqldump consistency/options](https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html),
[PITR](https://dev.mysql.com/doc/refman/8.4/en/point-in-time-recovery.html),
[mysqlbinlog replay](https://dev.mysql.com/doc/refman/8.4/en/mysqlbinlog.html),
[binary-log retention](https://dev.mysql.com/doc/refman/8.4/en/replication-options-binary-log.html).
