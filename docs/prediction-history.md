# Immutable prediction history

Prompt [019](../dev-plan/019-prediction-history.md) adds private persistence and
read repositories. It extends the canonical catalog, evidence snapshots and
model registry. It creates no public endpoint, schedule, provider request or
seeded forecast. Live evidence/model qualification remains with 011/012/014.

## Schema and identity

Migration `20261009121009_prediction_history` is additive and uses InnoDB,
binary string comparisons, restrictive foreign keys and native checks.

| Entity | Storage contract |
| --- | --- |
| `DailyRun` | One immutable identity per EAT date. `sequence` is the exact numeric `YYYYMMDD` ordering key, so backfilled creation order cannot supersede a later daily run. This is identity scaffolding; 021 adds manifests and cohort state. |
| `PredictionCycle` | Canonical fixture, caller creation key/hash, fixture-local ordinal, mutation version, schedule version, kickoff/cutoff, open/closed/void state, current/locked references, opening/closure/lock/void times and void reason. |
| `PredictionSchedule` | Append-only versioned schedule observations, original provider-observation/actual-start timestamps where known, actor, reason and evidence reference. |
| `PredictionSet` | Immutable fixture/cycle/run/job identity; exact fixture version/run order; fixture/cycle revision order; predecessor; schedule/model/evidence references; evidence cutoff, generation-completion, publication and recording times; shared market/settlement rule version and sealed full candidate. |
| `MarketPrediction` | Exactly four rows through supported writes, including explicit unavailable families. Complete probabilities, deterministic pick, source, fallback reason, full provenance, unknown-time flags and source clocks are retained. |
| `PredictionAudit` | Append-only ordered cycle events with idempotency key, command hash, actor/reason/evidence, recording time and sealed before/after snapshots. Snapshots include active-cycle references and the new revision identity for revision events. |

`FootballFixture.activeCycleId` is nullable and binds to a cycle belonging to
that same fixture. Composite foreign keys similarly bind current/locked sets,
predecessors and schedules to the correct cycle/fixture, runs to their order,
and evidence to the exact request/fixture/cycle/run/version/content hash. Model
references reuse the existing `ModelVersion`. Legacy evidence with null cycle/run
references stays intact; it is not guessed into a published revision.

The unique `(runId, fixtureId, cycleId)` refresh key permits at most one accepted
set, regardless of a retry's job/model changes. Matching replay returns the
original record; a changed command returns `conflicting-request`. Revision order
within a cycle increases with chronological run order. Older new output is
rejected, while exact replay of an already stored older set remains readable.
Predecessors form the same cycle's immutable revision chain. Fixture revision
numbers provide additional stable ordering across that fixture's cycles.

Probability values remain the shared domain's binary64 numbers in native DOUBLE
columns and canonical JSON; no percentage rounding is persisted. JSON also
preserves provenance, reasons, uncertainty, source links, calibration/evaluation
state and source clocks. Shared validation enforces exact approved bounds,
complete groups, deterministic picks and cross-market consistency. Native checks
add bounds, group sums, selections, projection seals and time ordering. Their
sum check allows binary floating-point error around the domain's exact 0.001
tolerance; application validation remains authoritative at that boundary.

Match result and derived double chance must have identical source provenance,
fallback reason, flags and timestamps, with the exact domain-derived values.
Each new set supplies all four families: unavailable families never inherit
earlier markets. All-unavailable candidates cannot become accepted sets.

Evidence cutoff, workflow generation completion, actual publication, storage
recording, and each source's generation/retrieval/provider-update times remain
distinct. Unknown provider clocks stay null with their original flags. Stored
publication time never substitutes for source generation. The shared
`regulation-markets-v1` also versions the current settlement rules.

## Storage API and transactions

`createMysqlPredictionHistoryStore(database, { catalog?, clock? })` lives in
`src/server/predictions/history-mysql-store.ts`. It uses the existing guarded
database runtime and catalog lock order: provider, then canonical fixture.
Writes are serialized with catalog imports. Readers use one Repeatable Read
transaction for each coherent projection; they acquire no write locks.

- `createRun(eatDate, createdAt)` creates or returns one daily identity, including
  concurrent callers. It selects no fixtures and dispatches no work.
- `createCycle(input)` is an idempotent storage primitive keyed by the caller's
  durable creation key. It allocates an ordinal, records the initial schedule
  and audit, and optionally activates the explicitly requested cycle. Changed
  retry input fails. It does not infer postponement or choose when to create one.
- `withFixtureTransaction(fixtureId, async (writer, transaction) => ...)` supplies
  the same primitives and a scoped Prisma transaction for later services.
  Await writes sequentially; keep network/provider work outside the callback.
  No arbitrary callback is automatically retried. Escaped writers cannot be
  used after the callback. Any writer failure poisons the transaction even if
  a caller catches it, preventing partial snapshots from committing.
- `writer.appendRevision(input)` validates and appends one accepted immutable
  candidate with its four markets and audit. It does not automatically move
  current/locked references. An exact accepted replay remains idempotent after
  closure; new revisions require an open cycle and matching schedule version.
- `writer.changeCycle(input)` applies an explicit full reference/state decision
  at the expected mutation version, optionally appends a schedule observation
  and activates a newer cycle, then appends audit. Closure and locked references
  cannot be reopened or replaced. Schedule corrections may still be recorded,
  including a caller-decided void reason. A new active cycle cannot replace an
  open cycle or restore an older ordinal.

Cycle/set/reference mutations increment the catalog fixture's exact data
version in the same transaction. Reads and exact replays do not increment it.
Cycle mutation versions also advance when a new revision is recorded, so later
services must use the transaction's current cycle version before moving refs.
Audit `recordedAt` comes from the storage clock; supplied decision/observation
and closure times retain their original meaning. Future cycle decisions,
observations and forecast publication times are refused.

These are server storage interfaces, not publication authorization. A later
publication service must perform manifest membership, current canonical state,
freshness/rights, pinned model/job ownership, lease fencing, rolling-window,
run-order and strict kickoff-minus-five-minutes/early-start checks inside the
same transaction before appending and moving the current reference. Storage
validation cannot prove source rights, semantic grounding or forecast quality.
[023 cutoff locking](cutoff-locking.md) chooses the eligible lock from history
and provides an audited void operation; 024 decides rescheduling/voiding and
coordinates canonical kickoff changes; 027 appends settlement/correction data.

## Read rules

`findCycle` and `findRevision` perform validated immutable lookup.
`currentRevision` and `lockedRevision` read their respective references
atomically for private callers. Visitor-facing services should use
`displayForCycle` or `displayForFixture` for the product rule:

- Open: current set or unavailable.
- Closed: locked set or unavailable, even if an unlocked current set exists.
- Void: retain the locked set, otherwise current or last accepted set, with the
  void reason. Empty void cycles retain their reason and no invented forecast.

`earlierRevisions` orders by descending cycle revision, using exclusive
`beforeRevision`. `cyclesForFixture` uses descending ordinal/`beforeOrdinal`.
`auditHistory` uses descending version/`beforeVersion`; `scheduleHistory` uses
ascending version/`afterVersion`. Defaults are 30 and limits are capped at 100.
These lookups never move references, mutate fixture versions or settle picks.
Readers revalidate sealed candidate/market payloads and their native projections;
corrupt or incomplete archived snapshots fail closed. Private diagnostics are
sanitized through `PredictionHistoryError` and the existing database boundary.

## Permissions, migration and rollback

Use separate migration and application credentials under the existing
[database policy](database.md). Application access needs SELECT and INSERT on
`DailyRun`, `PredictionSet`, `MarketPrediction`, `PredictionSchedule` and
`PredictionAudit`, alongside the existing read access to evidence/models.
These immutable tables need no application UPDATE, DELETE or DDL grants.
The cycle writer additionally needs INSERT/SELECT and column-scoped UPDATE on
`PredictionCycle` for `version`, `scheduleVersion`, `kickoffAt`, `cutoffAt`,
`state`, `currentSetId`, `lockedSetId`, `closedAt`, `lockedAt`, `voidedAt` and
`voidReason`. Its identity, creation key and ordinal remain protected. Use the
existing approved catalog privileges for fixture locking, `activeCycleId` and
data-version updates. Public read services can use SELECT-only credentials.

Generate/review the migration and schema snapshot together; deploy with the
explicit migration target, then run drift verification. There are no migration
seeds, inferred cycles, destructive column changes or history rewrites. New
tables start empty and existing fixture active references default to null.

Rollback disables the new writers and restores compatible application code
while retaining the additive tables, columns, permissions and immutable history.
Use a reviewed forward migration for corrections. Never drop forecast/evidence
history to roll back code. MySQL DDL can commit incrementally: after a failed
deployment, inspect actual schema and migration records, complete/repair the
reviewed migration under the migration credential, and verify drift before
resuming. Do not reset the database or mark an unverified partial migration
applied. Backups/retention and production grant verification keep their existing
operating owners.

## Acceptance

```text
npm run test:history
npm run check
```

The database harness owns a fresh loopback MySQL instance, uses separate
migration/application users, applies every committed migration and verifies
drift. Set `MYSQL_TEST_SERVER_BINARY` to a genuine MySQL 8.4 binary if needed.
It never modifies an installed service or application target. Tests cover
independent-client retries, conflicting keys/bindings/probabilities, precision,
provenance and unknown clocks, partial history, immutable grants, full rollback,
read ordering, closure/void/empty states and schedule/audit append behavior.
Results and any blockers are in [development progress](development-progress.md).

The implementation follows the version-matched
[Prisma 7 transaction API](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions),
[MySQL locking reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html),
[foreign keys](https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html)
and [native check constraints](https://dev.mysql.com/doc/refman/8.4/en/create-table-check-constraints.html).
