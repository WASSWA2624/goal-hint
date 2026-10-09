# Cutoff locking

Prompt 023 implements private durable cutoff scheduling, irreversible closure
and an audited void operation. It uses the publication/history synchronization
boundary. Schedule detection and correction coordination belong to 024; result
settlement belongs to 027. No provider requests, prediction refresh, public route
or hosted scheduler is introduced.

## Service and binding

Construct `createCutoffLockingService({ database, queue, policy, authority })`
with the existing MySQL queue on the same database. Supply an explicit approved
`CutoffPolicy` containing the evidence reference and bounded job priority,
attempt, timeout, lease and backoff settings. There are no live policy defaults.

`CutoffAuthority` synchronously authorizes the workload/action and verifies the
policy, original early-play observations, correction actions and recovery
actions. False, throwing or asynchronous verifiers refuse new changes. Recheck
authority immediately before commit. A production binding must apply the
existing runtime operation/database/hosting gates and independently verify
provider and correction evidence. Synthetic approvals are test inputs only.
External verification and provider I/O finish before locks are acquired.

Pass this service as the required `cutoff` dependency of
`createDailySelectionService`. After refresh dispatch, selection calls
`scheduleRun(runId)` over the immutable committed membership. Each eligible
active open cycle receives a durable `prediction.cutoff:1` job. One transaction
per cycle acquires provider → fixture → queue shard/job locks and enqueues a
stable envelope. Repeating a selection or recovering a prefix reuses the job;
it does not generate another prediction refresh. Closed cycles need no new job.

Register `createCutoffJob(service)` in the existing `createJobRegistry` and use
the protected worker binding/command from [durable jobs](durable-jobs.md). No
permissive operator binding or cron is mounted by this implementation.

## Durable scheduling and downtime

`scheduleCycle({ fixtureId, cycleId })` sets `notBefore` to the accepted scheduled
kickoff minus five minutes. Job identity includes cycle and schedule version.
A schedule adjustment can enqueue the new version without rewriting the old
envelope. If an old delivery arrives before the revised cutoff, the handler
enqueues the current version and acknowledges the superseded job. A same-version
early delivery retries rather than acknowledging its only close job.

Closure is recovery work and does not expire at kickoff. Envelopes use the
supported maximum UTC instant as their expiry; bounded attempts, timeouts,
leases and exponential backoff still apply. Delayed jobs can execute after
downtime and after a fixture leaves the prediction window. They never request a
new forecast or use a result to select a revision.

`recoverCycle` requires a verified recorded action with a stable recovery key,
actor, reason and evidence reference. Its new envelope retains that proof;
repeating the action reuses the job. The operator/verifier must justify recovery
of missing/exhausted work and enforce approved operational bounds. 043 owns
watchdog discovery and invocation; no watchdog is activated here.

## Closure and eligibility

`close({ fixtureId, cycleId }, lease?)` and
`closeObservedPlay(originalProviderObservation)` use one domain operation.
Worker execution supplies its real lease. The service validates the owning job
identity and fences ownership before and after provisional writes. The direct
path is private, workload-authorized domain work for recovery/lifecycle callers.

Within the shared Read Committed transaction:

1. Lock the canonical provider/fixture boundary used by publication, imports
   and schedule changes, then the owning queue job if supplied.
2. Read the active open cycle, complete append-only schedule history, verified
   publication barrier and actual-start evidence. Sample `UTC_TIMESTAMP(3)`.
3. Reconstruct the effective deadline. A cutoff reached while a schedule was in
   force remains a safety boundary even if a later correction extends kickoff.
   Earlier kickoff corrections and verified actual starts can shorten it.
4. Traverse accepted publication receipts in descending run order and validate
   their sealed immutable revisions. Require publication strictly before the
   effective deadline and its original accepted schedule cutoff. Do not choose
   from the current pointer, scores, outcome labels, probabilities or source.
5. Close and set the selected reference once, or close without a prediction.
   Append history audit, increment fixture version, save the immutable closure
   receipt and durable change event together. Recheck authority, time direction
   and lease ownership before commit.

The shared `revisionEligibleForSchedule` rule also applies. Schedule rows must
be contiguous, chronological and agree with the cycle's accepted schedule.
Missing, future or contradictory history refuses closure. An eligible older-day
revision can serve a match just after midnight when the newer run cannot finish
before cutoff. An invalid newest reference is skipped in favor of eligible
accepted history. No eligible revision produces a stable closed/no-prediction
result, even if an ineligible current pointer remains available as history.

`closedAt` records the effective closure boundary; `lockedAt` records when a
revision was actually selected, including late execution. It remains null when
no prediction was eligible. If verified play predates cycle opening, the stored
`closedAt` is clamped to opening to preserve the history invariant; the receipt
keeps the earlier effective boundary and selection uses that earlier boundary.
Generation, publication, source retrieval/update and forecast payloads remain
unchanged. Publication still enforces its strict cutoff without waiting for
the job, as defined in [revision publication](revision-publication.md).

Verified early play writes the same immutable publication barrier used by 022
and immediately closes. Later scheduled responses cannot reopen eligibility.
An established closure retry returns its original receipt and revision without
moving references, advancing versions or changing lock timestamps, including
after acknowledgement or an ambiguous response following an actual commit.

## Void and reads

`voidLockedCycle({ fixtureId, cycleId, actor, reason, evidenceRef })` requires a
verified correction action and an already closed cycle. It preserves current
and locked references, closure time, lock time and the entire forecast; appends
an audit reason, void timestamp, receipt and event atomically; and increments
fixture version. Duplicate actions return the first established void result.
This is the operation 024 can call after independently proving invalidation.
It does not find or substitute another pick, infer rescheduling or settle a
result. Closed and void cycles cannot reopen through history or publication.

Use the existing coherent history/publication readers: open cycles expose
current forecasts; closed cycles expose their locked forecast or unavailable;
void cycles retain the original forecast with the void reason. A closure retry
returns the original closure receipt even after a later void; a current display
read reports the void state.

## Records, events and grants

Additive migration `20261009142724_cutoff_locking` introduces append-only
`PredictionCycleOperation` with sealed closure/void snapshots, one receipt per
cycle/operation kind, same-cycle revision FKs and native identity/state checks.
The application needs SELECT/INSERT only on this table, alongside existing
history/catalog/queue permissions. Migration credentials remain separate.

`PredictionChangeEvent` now binds exactly one refresh result or cycle operation
through a restrictive composite fixture/version FK. `cycle-closed` and
`cycle-voided` join the existing publication events in the same per-fixture
monotonic version stream. Existing publication rows remain valid. Consume them
with `changesForFixture` and a per-fixture cursor; caching/broker availability
is never required to commit or read a correct lock. 031 owns cache consumption.

Rollback disables service/worker bindings and retains additive schema, immutable
forecasts, schedules, audit, receipts and events. Inspect actual migration state
after DDL failures and repair forward; do not reset a target or erase history.

## Verification and live gates

Run `npm run test:cutoff`, publication/history/selection/job regressions and the
repository checks. Acceptance uses genuine isolated MySQL with competing
clients, real queue leases/worker execution and deterministic session clocks.
It covers strict cutoff boundaries, early play, previous-day forecasts, varied
schedule history, invalid current references, score-independent selection,
duplicate jobs, void immutability, rollback and ambiguous commit recovery.

Live hosting/workload approval, actual job bounds, provider/rights/model/budget
qualification and publication freshness gates remain pending. 024–025 must
complete lifecycle coordination and prediction-worker integration before
scheduled predictions can be enabled. Actual results and blockers are recorded
in [development progress](development-progress.md).
