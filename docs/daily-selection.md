# Daily selection

Prompt 021 implements private selection and recovery. Publication, cutoff
locking, lifecycle detection and the prediction refresh handler remain with
022–025. Nothing in selection executes AI or starts score polling.

## Binding and schedule

Use `createMysqlDailySelectionStore(database, queue)` with the existing MySQL
queue on the **same database**, canonical importer, shared API-Football adapter
and quota gateway. Construct `createDailySelectionService` with an explicit
validated policy and trusted `SelectionAuthority`. Authority must verify current
runtime operation scope, retention rights, exact approved competition IDs and
trial-backed eligibility evidence. Test verifiers are never deployment approval.

`dailySelectionSchedule` configures **`0 21 * * *` in UTC**, midnight
`Africa/Kampala`. The hosting scheduler must retain its original scheduled
occurrence and POST JSON `{ "scheduledFor": <UTC epoch milliseconds> }` to the
host's private binding of `createDailySelectionTrigger`. It authenticates through
the existing workload identity adapter, parses a bounded body, and durably
enqueues `daily.selection` version 1. Supply approved attempt, expiry, timeout,
lease, fallback and backoff bounds. Duplicate deliveries have identical envelopes.
Register `defineDailySelectionJob(service)` with the existing durable worker.

For the **7 October 2026** run, `scheduledFor` is
`Date.parse("2026-10-06T21:00:00Z")`. Every retry keeps that occurrence, even
after the next EAT midnight. Non-midnight occurrences are rejected. Never derive
a retry's date from invocation time. Run sequence is the existing ordered EAT
`YYYYMMDD` identity, independent of job completion order.

The trigger is a reusable protected adapter; no route or hosting cron has been
mounted. OP-05/20 coverage and degradation decisions, OP-19 hosting/workload
identity, OP-11 workload bounds and later pipeline integrity checks still block
live scheduling. Select the authorized host and bind its private route/worker
before activation. The repository does not assume a hosting provider or create
a second Codex reminder/automation for this application workload.

## Imports and immutable membership

The policy explicitly supplies competition IDs, the pre-match `scheduled` status,
retention/evidence references, renewable selection lease duration, per-invocation
retry count, fixture cap, import bounds and refresh envelope settings/payload.
There are no default competitions, spending allocations or model selections.
Changing the policy on an existing run conflicts, including after commit.

Under a renewable database-UTC lease, import each of the seven EAT dates through
the canonical importer. Each original request is persisted in `DailyRunImport`
before I/O, including its import UUID and absolute deadline. Complete receipts
are reused; incomplete/failed dates get bounded new attempts. A catalog receipt
committed before a crash is reconciled without another fetch. Expired unfinished
requests are retained and replaced with a new attempt. The existing adapter owns
supported pagination: `/fixtures` currently returns a single page; unexpected
additional pages are incomplete, never an invented `page` loop or empty date.

Preserve current receipts, reasons, missing coverage and page provenance. Retained
canonical fixtures are also known data; an empty newer response cannot erase
them. An incomplete current import cannot borrow an older completeness claim.
Every required date must be complete before normal commit and dispatch.

Membership, original kickoff, cycle, deterministic rank, frozen job envelope,
coverage, exclusions, boundaries, policy hash and commit time are inserted into
the append-only `DailyRunManifest` and `RunFixture` records in one transaction.
Initial cycle creation uses the existing history writer **in that transaction**.
Canonical provider → fixture locks are retained after the selection run lock;
provider I/O stays outside all row locks. Transactions are bounded, and ownership
is rechecked before commit. A lease too short for the bounded database work
causes rollback; choose its duration from measured fixture capacity.

Nearest kickoff sorts first, with canonical fixture ID as the stable tie-breaker.
Queue priority decreases through the first 256 ranks; distinct original-window
availability milliseconds retain order among remaining equal-priority entries.
The fixture cap refuses an oversized cohort rather than silently dropping its
tail. Jobs expire at the selected kickoff minus five minutes. Later workers must
independently recheck publication eligibility and current schedule/status.

## Explicit degradation and cycle eligibility

An unchosen degradation policy does not prevent complete imports from committing.
It blocks partial finalization. An operator must supply `service.run(occurrence,
{ actor, evidenceRef, policyRef })` with the configured policy reference and a
trusted action verifier. Imports are retried first, then the action is reverified
before commit. The immutable manifest is marked partial and retains the action,
known subset and all missing dates/pages. It cannot be filled in later.

`selectionDateState` returns `data-unavailable` or `partial` for incomplete date
coverage. Only a complete date with no selected eligible fixtures can return
`no-fixtures`. Later feed services must use this distinction.

Reuse the current open cycle only when its schedule matches and cutoff remains
eligible. Closed cycles never reopen. `recordCycleEligibility` accepts a trusted,
recorded `void` or `postponed` input bound to the exact previous cycle/version,
fixture and new kickoff. A postponed input requires an already closed cycle and
the canonical postponed state; a void input requires an already void cycle.
Selection consumes that record once, only after the fixture is scheduled and its
new kickoff matches, and creates a new ordinal with the history primitive.
Prompt 024 owns observing formal postponements and supplying these transitions.
Selection does not infer lifecycle events from a changed kickoff or status.

## Dispatch, progress and recovery

The sealed manifest is the durable dispatch intent. `reconcile(lease)` walks its
entries in rank order and transactionally enqueues and links only missing jobs.
Each enqueue/link transaction uses one queue shard, avoiding multi-shard lock
ordering. Existing queue refresh uniqueness protects run/fixture/cycle identity;
the composite job FK prevents linking work from another refresh. Repeating a
committed run never imports again and never changes membership. Late discoveries
wait for another eligible daily run.

After a crash before manifest commit, acquire the expired lease and resume the
same run/import receipts. After commit or midway through dispatch, repeat the
same occurrence to reconcile the missing suffix. Original job envelopes and
deadlines remain unchanged; expired work becomes a durable terminal outcome
through the queue. A later watchdog may call the same recovery contract.

`progress(runId)` synchronizes queue outcomes into mutable `RunFixture.jobState`
and `terminalReason`, and persists total, successful-completed and terminal
counts on `DailyRun`. Reconciliation calls it; refresh-worker/recovery integration
should call it after terminal work. Queue outcomes are authoritative until that
projection is synchronized. Neither progress nor outcome updates alter membership.

## Application grants and verification

Deploy migration `20261009131134_daily_selection` with the separate migration
role. Preserve existing catalog/history/queue grants. Add:

- `DailyRunManifest`: SELECT, INSERT only; no UPDATE or DELETE.
- `DailyRun`: SELECT, INSERT and UPDATE for selection ownership/configuration,
  commit metadata and progress; identity/date/order columns remain immutable.
- `DailyRunImport`: SELECT, INSERT; UPDATE only `finishedAt`, `failure`.
- `RunFixture`: SELECT, INSERT; UPDATE only `jobId`, `jobState`, `terminalReason`.
- `SelectionCycleEligibility`: SELECT, INSERT; UPDATE only `consumedRunId`.

Native checks bind request dates, refresh identities, rank and state/outcome
projections. Manifest hashes and policy hashes are checked on reads; operational
updates cannot change sealed content. Never grant table-wide mutation of immutable
membership/evidence or deletion of these records to the application role.

Run `npm run test:selection` with `MYSQL_TEST_SERVER_BINARY` set to genuine MySQL.
The owned throwaway harness covers concurrent runs, pagination failure, renewable
ownership/fencing, transaction rollback, restart before/after commit, duplicate
enqueue, partial finalization, late discoveries, cycle inputs and outcome counts.
Synthetic provider bodies run through the real adapter and quota gateway without
network requests. They do not qualify live coverage, rights or budgets.

Rollback disables the binding/worker while preserving additive schema and all
manifests, imports, cycles and jobs. Inspect actual schema/migration state before
any forward repair; never regenerate an already committed cohort.
