# 055 — Test idempotent ingestion, recovery and quota coordination

**Phase:** Testing  
**Key prerequisites:** [006 — Implement durable job ownership and overlap protection](006-durable-job-control.md); [007 — Repair the shared server-side provider client](007-shared-provider-client.md); [008 — Persist responses and normalize them idempotently](008-transactional-ingestion.md); [009 — Coalesce requests and reuse fresh shared responses](009-shared-fetch-cache.md); [010 — Implement documented batching and resumable pagination](010-batching-pagination.md); [011 — Implement the shared quota budget and priority scheduler](011-quota-scheduler.md); [012 — Implement failure classification and quota-aware retries](012-retries-errors.md); [013 — Configure the supervised runtime for logical workers](013-worker-runtime.md); [014 — Implement reference and competition catalog ingestion](014-catalog-imports.md); [015 — Implement team and venue identity ingestion](015-entity-imports.md); [016 — Implement complete standings and team-statistics ingestion](016-team-context-imports.md); [017 — Implement complete fixture-scoped data ingestion](017-fixture-data-imports.md); [018 — Implement the complete player-data import handlers](018-player-data-imports.md); [019 — Implement coaching, transfer and career-history ingestion](019-career-data-imports.md); [020 — Implement Worker 1: live match updates](020-live-worker.md); [021 — Implement Worker 2: current-day refresh and reconciliation](021-daily-refresh-worker.md); [022 — Implement Worker 3: resumable historical backfill](022-historical-worker.md); [024 — Reconcile bookmaker and separate pre-match/live market catalogs](024-odds-catalog-mapping.md); [025 — Implement full, independent odds-price ingestion](025-odds-ingestion.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Build and run the replay-based ingestion/worker resilience test suite, repairing only failures within this task’s scope.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Required ingestion acceptance tests

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 398–405.*

1. Replaying the same response/job does not create duplicate fixtures, events, odds, jobs or predictions.
2. An authoritative correction updates records and settlement; an older in-flight response cannot overwrite newer state.
3. Fixture batches split correctly at **20/21 IDs**; an odds page size of 10 is not confused with the fixture batch limit.
4. All supported paginated endpoints continue to their last page; partial-page failures resume without repeating committed pages.
5. Shared fixture, player, league and team dependencies are fetched once per required freshness scope, not once per consumer.
6. A crash before/after response persistence and during normalization/checkpointing recovers without skipping work or corrupting completion status.
7. Minute-rate limits, daily exhaustion, HTTP-200 API errors and permission errors cause the correct pause/retry/alert behavior.
8. Today's and live jobs retain quota priority; backfill pauses and automatically resumes at the correct account reset.

### Test-before-quota requirement

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 419.*

Run tests with mocked/replayed provider responses before spending production quota. Measure proposed daily/minute request demand using actual fixture volumes and the configured plan. Report infeasible freshness targets instead of silently exhausting quota.

## Scope boundary

This task tests the ingestion subsystem. Forecasting, public/settlement behavior and visual regression have dedicated following test prompts.

## Acceptance checks

- [ ] Test duplicate replay, authoritative corrections, stale-owner/response rejection and crash points around receipt/normalization/checkpoint commits.
- [ ] Test 20/21 fixture batches, odds page size 10, every supported final page and exact partial-page resume.
- [ ] Prove shared dependencies fetch once per freshness scope and never once per consumer.
- [ ] Verify minute/daily limits, HTTP-200 errors, permission blocks, live/current priority and automatic backfill reset/resume using mocks/replays.
- [ ] Record actual commands/results and unresolved failures; do not spend production quota for the initial test suite.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [056 — Test forecasting evidence, fallback, invariants and queue scale](056-prediction-validation-tests.md).
