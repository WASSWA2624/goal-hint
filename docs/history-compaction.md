# Result and lifecycle history compaction

**Status: dry-run only.** `npm run db:compaction-report` counts which result-sync
and lifecycle history rows a future, separately approved compaction could remove.
It never deletes, archives or rewrites a row, and no deletion path exists in the
application. No migration, grant, schema or UI change accompanies it. No
prediction/result/evidence/audit deletion period has been approved
([backup and restore](backup-restore.md), OP-08/13/31), and the lifecycle runbook
still says "never erase evidence" ([schedule lifecycle](schedule-lifecycle.md)).

## Why nonempty polls grow

Each nonempty result poll stores a sealed `ResultSyncBatch` (whose body also
copies every observation), one `ResultProviderObservation` per fixture and a
`FixtureLifecycleObservation` receipt. Material observations add a
`PredictionChangeEvent`; changed result content, including the elapsed minute,
adds a predecessor-linked `FixtureResult` with its own event and later a
settlement receipt. Successful empty polls already store nothing
([fixture-result sync](fixture-result-sync.md)).

The main transient growth is after full time: each date poll (one-minute spec
cadence) until EAT midnight adds a batch, an observation and a lifecycle receipt
with outcome `unchanged` for every final fixture of that date. Correction polls
then follow the policy's tiers until the horizon is exhausted.

## References

| From | To | Kind |
| --- | --- | --- |
| `ResultProviderObservation.batchId` | `ResultSyncBatch` | FK, RESTRICT |
| `ResultProviderObservation.(lifecycleId, fixtureId)` | `FixtureLifecycleObservation` | FK, RESTRICT |
| `PredictionChangeEvent` | lifecycle receipt, `FixtureResult`, refresh result, cycle operation or settlement batch | FK, RESTRICT |
| `SettlementEventReceipt` | `PredictionChangeEvent` | FK, RESTRICT |
| `MarketSettlementRevision`, `ExtendedMarketSettlementRevision`, `ImpliedMarketResultEvidence` | `FixtureResult` | FK, RESTRICT |
| `FixtureResultState.resultId` | head `FixtureResult` | FK, RESTRICT |
| `FixtureLifecycleObservation.cycleId` | `PredictionCycle` | outgoing FK; does not block deletion |
| `FixtureResult.body.observationId` | the observation that created it | JSON only |
| `ResultProviderObservation.body.resultId` | the head result when it was applied | JSON only |
| `FixtureResult.body.previousId` | the predecessor result | JSON only |
| `ImpliedMarketResultEvidence.body.sources[].sourceRef` | private stored responses | JSON only |

JSON references are not enforced by the database. The census follows the first
two; implied-evidence fixtures are retained wholesale because their source
references are not resolvable here. A new JSON reference needs a classifier
update before any deletion. None of the three history tables has a trigger;
append-only is enforced by grants (the application has no DELETE on them).

## What counts as transient

A row is a candidate only if every condition holds. An observation is an
`outcome = "unchanged"` confirmation in a completed batch, for a fixture whose
result is final and whose polling horizon is exhausted
(`firstFinalAt` set and `nextCheckAt` NULL). The fixture is not settlement-pending,
has no implied evidence, and the row is not the fixture's latest observation and
did not create a result. A lifecycle receipt also has no change event, came from
result sync, is not shared with a retained observation, and is neither the latest
receipt nor the receipt at the lifecycle cursor. A batch is complete and
error-free, and all its members are candidates.

Kept invariants, so a later deletion of candidates would lose no state:

- `FixtureLifecycleState` can be rebuilt from accepted, event-bound, cursor and latest receipts.
- `FixtureResultState.lastSyncAt` is still supported by the fixture's latest observation.
- Batch replay identity matters only while a batch is pending; any pending batch withholds every candidate.
- The change-event cursor, settlement and correction chains and the sealed
  `FixtureResult` predecessor links are never candidates.

Settlement-pending mirrors every arm of `settlement-service.pending()`: an
unreceipted change event of `settlementSourceKinds` (the exported list, so the two
cannot drift), a cycle with fewer than four `MarketSettlement` rows, and the goal
and implied extension arms when those tables exist. With extension tables present
but extended settlement disabled, those fixtures stay settlement-pending (fail
closed). Horizon exhaustion is relative to the current policy: a later policy with
longer tiers re-polls exhausted fixtures. Fixtures removed from coverage are never
marked exhausted, so they are retained forever.

## Reasons

Each row takes the first reason that applies, in this order.

| Table | Reasons |
| --- | --- |
| `ResultProviderObservation` | `pending-batch`, `result-source`, `non-confirmation-outcome`, `settlement-pending`, `fixture-still-tracked`, `implied-evidence`, `latest-confirmation`, `transient-candidate` |
| `FixtureLifecycleObservation` | `change-event`, `non-confirmation-outcome`, `no-result-sync-source`, `referenced-by-retained-observation`, `settlement-pending`, `fixture-still-tracked`, `implied-evidence`, `latest-confirmation`, `cursor-receipt`, `transient-candidate` |
| `ResultSyncBatch` | `pending-batch`, `error-receipt`, `requested-ids-without-observation`, `unmatched-observations`, `retained-batch-member`, `transient-candidate` |

Two global reasons then apply to all three tables. `reference-coverage-unavailable`
takes every candidate when `ImpliedMarketResultEvidence` or any of the four
extension tables is not visible to the inspecting account. Otherwise
`pending-recovery-global` takes them when any `ResultSyncBatch` is still pending.

`no-result-sync-source` receipts (catalog and direct lifecycle observations) are
out of scope. The receipt of the latest observation is retained as
`referenced-by-retained-observation`. An empty date/live batch is a candidate only
when its error is null, it requested no ids and dispatched at least one request.
The sealed batch body has no completeness field, so this relies on the adapter
invariant that a response is complete exactly when its error is null. Any other
empty date/live batch is `error-receipt`. A batch whose stored observation count
differs from its body (a duplicate fixture skipped on apply) is
`unmatched-observations`.

`FixtureResult`, `PredictionChangeEvent`, `SettlementEventReceipt` and every other
table in `NEVER_COMPACTED` (forecasts, settlements and corrections, extension and
implied evidence, publications, durable jobs, provider odds and cache journals)
are listed in the report and never classified. `retainedChains` reports the size
of the `FixtureResult` chain, with its `live` (in-play) part, and of in-play
lifecycle receipts, for later Phase 3 sizing.

## Running the census

```powershell
# Up to 2,000 fixtures with result state and 5,000 batches, 200 per read transaction.
npm run db:compaction-report

# Smaller pages if a statement reaches its 5-second limit.
npm run db:compaction-report -- --page-size 50

# Resume a partial report from its printed cursors.
npm run db:compaction-report -- --after-fixture <resumeAfterFixture> --after-batch <resumeAfterBatch>
```

Flags are `--max-fixtures` (1–20,000), `--page-size` (1–500), `--max-batches`
(0–100,000), `--after-fixture` and `--after-batch`. There is no apply, delete or
execute option. The command writes no file and takes no lock. Exit codes: `0`
complete coverage, `3` partial coverage (a bound or the 300-second budget was
reached; resume with the cursors), `1` disabled or unavailable.

Run it off-peak with an account that has only `SELECT` on the application schema,
through the same private runtime as `db:health` and `db:storage`. SELECT on the
application schema is enough; no grant or migration is added. Table visibility
follows the account's privileges: a missing core table makes the report
unavailable, and a missing implied-evidence or extension table reports
`referenceCoverage: "incomplete"` with no candidates rather than wrong ones.

Each read transaction (a ReadCommitted context read, then one RepeatableRead
snapshot per keyset page) sets a 5-second statement limit on its own connection
(`max_execution_time` on MySQL, `max_statement_time` on MariaDB) and restores the
previous value before it ends. A timed-out statement makes the whole report
unavailable. The snapshot is per page, not global: concurrent polling can move
rows between reasons, so the report is advisory and any deletion must recheck
under the fixture lock.

Only counts, byte sums and the two resume cursors leave the database. The fixture
cursor is a fixture UUID, which is already public in match URLs; the batch cursor
is a provider-batch hash with no member data. Bytes are the serialized JSON text
length (`OCTET_LENGTH(CAST(body AS CHAR))`, the text the integrity seal hashes),
not InnoDB page allocation. Deleting rows does not return filesystem space
without a table rebuild; measure allocation with [`db:storage`](database-storage.md).

The SQL avoids MySQL-only functions and is written to be portable to MariaDB
11.4, but it has been exercised only on MySQL 8.4. On MariaDB, JSON collation or
session-variable differences would surface as an unavailable report, never as
candidates.

## Phase 2: deletion (design only, not implemented)

Gates, all required:

1. An owner retention decision (OP-08/13/31) that names these tables.
2. An owner amendment of the "never erase evidence" invariant in [schedule lifecycle](schedule-lifecycle.md).
3. A `db:storage` baseline and this census on the target.
4. A verified encrypted backup newer than the census.

Maintenance account: a separate role, never the application account. Deleting
under the existing lock order needs more than DELETE on the three tables:
`history.withFixtureTransaction` runs `INSERT … ON DUPLICATE KEY UPDATE` on
`FootballCatalogLock` and `SELECT … FOR UPDATE` on `FootballFixture`, and MySQL 8
locking reads need UPDATE, DELETE or LOCK TABLES besides SELECT. Excluding
concurrent recovery needs `ResultPollerLease … FOR UPDATE`, or a stopped poller.
The application account stays unchanged.

Procedure:

- Per fixture, take the fixture lock and recompute every predicate under it.
- Delete at most 100 rows per transaction, observations first, then lifecycle receipts and batches.
  FK RESTRICT rejects any row that is still referenced.
- Abort on any pending batch.
- Write a counts-only audit record.

Do not add unconditional `BEFORE DELETE` SIGNAL triggers as a guard. They would
also block the approved maintenance path, and a session-flag bypass protects
nothing. Grants remain the guard, with the existing DELETE-rejection tests. If
triggers are ever proposed, follow the latest pattern
(`20261020000100_repair_extension_triggers`, its `prisma/mariadb` overlay and
`tests/append_only_trigger_migration_test.py`).

## Phase 3: write-path options (each needs its own review)

- Stop appending `FixtureResult` revisions that change only the elapsed minute.
  This changes the result chain.
- Do not persist post-final `unchanged` date-poll confirmations. This interacts
  with the `lastSyncAt`-driven correction cadence in `result-sync-service.ts`.

Size both with the census `retainedChains` and candidate counts first.

## Verification

- `tests/history-compaction.test.mjs`: option bounds, read-only statement class,
  per-transaction session-limit restore (including MariaDB's DOUBLE value and
  failures), missing core and reference tables, pending-batch withholding, keyset
  resume, reason order, the settlement-arm mirror and the never-compacted list.
- `tests/history-compaction.integration.mjs` (genuine MySQL via
  `npm run test:compaction`; it skips unless `MYSQL_TEST_SERVER_BINARY` is set): a locked cycle with in-play ticks, a final and three
  confirmations, through settlement and horizon exhaustion, plus legacy empty,
  requested-id, error and pending batches. It runs the census as a SELECT-only
  account and checks that row counts, `CHECKSUM TABLE` and the session limit are
  unchanged.
- `tests/database_compaction_report_test.py`: the command has no write option,
  validates cursors, uses a 600-second service timeout and its exit codes.

On 25 October 2026 the integration test passed against an owned MySQL Community
Server 8.4.11 instance with no skip. The census has not been run against any
configured or production database.
