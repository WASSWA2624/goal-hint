# Market settlement

Prompt [027](../dev-plan/027-market-settlement.md) adds stored settlement around
the existing regulation market rules. It does not calculate hit rates, activate
workers, fetch provider data or introduce optional exact scores.

## Service and recovery

`createMarketSettlementService({ database, queue })` exposes:

| Method | Contract |
| --- | --- |
| `settleFixture(fixtureId, lease?)` | Atomically evaluates every cycle's locked selection and consumes outstanding source events for the fixture. An optional durable-job lease must belong to this fixture and handler and remain owned through commit. |
| `pending(limit = 100)` | Finds fixtures with unconsumed durable result/lifecycle/cutoff/publication events or cycles lacking four explicit family projections. Bounded to 1–1,000 fixtures. |
| `reconcile(limit = 100)` | Processes one bounded batch without network calls; call repeatedly while batches are full. A failed fixture remains discoverable for retry. |
| `forFixture(fixtureId)` | Coherent read of the applicable cycle, all historical cycles and one active projection per family. Includes freshness and downstream counting eligibility. |
| `audit(cycleId, family)` | Predecessor-ordered immutable revisions, including original verified result versions, badges, reasons and correction times. |

Register `createMarketSettlementJob(service)` in the existing private job
registry with type `prediction.market-settlement`, handler version `1`, payload
`{ fixtureId }`, and `refresh: null`. Use the existing job envelope's explicit
execution bounds and unique delivery key. This is result processing and does
not enqueue AI refreshes. The existing `worker:jobs -- --binding <absolute-path>`
entry point executes registered definitions. See [durable jobs](durable-jobs.md).

An approved private scheduler/watchdog can call `reconcile` directly, including
after a crash, missed enqueue, lost job acknowledgement or exhausted attempts.
No scheduler cadence or production binding is invented here; 043 owns watchdog
activation. Durable per-event receipts, rather than a global time watermark,
ensure a late commit cannot disappear behind a newer event. Source events are
acknowledged in the same transaction as their projection. Settlement's own
invalidation events are excluded from discovery, preventing a feedback loop.

## Evidence and outcomes

Each available family uses only its selected pick in `PredictionCycle.lockedSetId`.
The history reader checks the full immutable forecast and all four market rows;
settlement never writes forecasts, probabilities, locks or alternatives.

The result reader validates the sealed append-only FixtureResult body, identity,
version, indexed score fields and content hash. Settlement also requires the
current canonical status, regulation score and evidence reference to agree with
that version, with no unresolved lifecycle issue. Canonical verification may
advance when the same score is confirmed again; the original sealed verification
time remains evidence and must not be newer than canonical verification.
Canonical/live reported goals, extra-time totals and penalty totals never supply
a regulation score. Scheduled/live remains Pending, even if a score exists.
Finished regulation, extra-time and penalty fixtures require separately verified
regulation including stoppage time; missing/unverified scores remain Pending.

The shared domain evaluates match result, double chance, over/under 2.5 and BTTS
independently. Missing families remain Unavailable with their original reason.
An open cycle has Unavailable/awaiting-locked-selection projections. A closed or
void cycle with no valid lock has Unavailable/no-locked-selection projections;
its cycle state and void reason remain visible. A retained pre-lock forecast is
not promoted into a prediction. Available locked markets on postponed,
canceled, abandoned, awarded or cutoff-invalidated cycles are Void. Exact cycle
void reasons are retained alongside the domain reason.

Once a void projection is recorded, later result versions do not rewrite its
historical evidence. A later eligible cycle has its own four projections.

## Corrections and concurrency

`MarketSettlement` has a `(cycleId, family)` primary key and holds only a mutable
revision pointer. `MarketSettlementRevision` is append-only, with same-cycle
foreign keys to the lock, result, batch and predecessor. `SettlementBatch` binds
one atomic fixture change to one incremented `dataVersion` and one durable
`PredictionChangeEvent(kind=market-settlement, settlementId)`.

The service takes the established provider then fixture lock, shared with
publication, cutoff and result application. Concurrent replicas serialize there.
An input fingerprint includes the domain rule version, locked selection/source/
probability, result version, evidence usability, outcome and cycle eligibility.
Identical input leaves history, version and invalidation unchanged. A changed
result version is audited even when its resulting badge remains the same.

Revisions are initial, transition or correction. A change following Correct or
Incorrect against the same lock is a correction when its result or verdict
changes. It retains the predecessor's badge, reason and sealed result reference
and records database UTC correction time. Later transitions preserve the last
visible correction time. Multiple changes within one millisecond retain exact
chain order. A pending result becoming settled for the first time is a normal
transition. Transaction rollback leaves neither partial families nor receipts;
lost commit acknowledgement can safely retry the same projection.

## Applicable-cycle repository contract

`forFixture` returns `applicableCycleId` from the canonical fixture pointer and
marks exactly that cycle `applicable`. It exposes selected picks only; prior
settlement revisions are available through `audit`, never as active predictions.

`isCurrent` compares the stored input fingerprint with current locked/result/
eligibility evidence in a repeatable-read snapshot. `eligibleForCounting` is true
only for a current Correct/Incorrect selected pick on the applicable closed
cycle. Pending, Void, Unavailable, stale projections, historical postponed
cycles and superseded revisions are excluded. Consumers must use this field for
the downstream settled denominator contract; aggregation itself belongs to 030.

## Migration, grants and verification

Apply `20261009181240_market_settlement` with the migration role. Tables use
InnoDB and binary identity collation; composite FKs bind events to their exact
fixture/version and enforce a single source binding. Runtime roles require
SELECT/INSERT on SettlementBatch, MarketSettlementRevision and
SettlementEventReceipt; SELECT/INSERT and UPDATE **only revisionId** on
MarketSettlement, in addition to existing catalog/history/job access. No DELETE
or history-body UPDATE is required. The shared genuine MySQL harness exercises
these grants. Stop the private binding for rollback and retain additive tables
and audit evidence; inspect actual DDL state and repair forward.

Run `npm run test:settlement` with the owned isolated MySQL test binary configured
as documented by the existing database harness. Synthetic approval and score
evidence verify mechanics only. Existing provider rights, verified regulation
mapping, model/operating approvals, database grants and hosting bindings still
govern live activation.
