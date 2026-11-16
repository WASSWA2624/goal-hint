# 023 — Implement Worker 4: the durable prediction lifecycle

**Phase:** Coordinated workers  
**Key prerequisites:** [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md); [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [005 — Define the shared versioned market registry](005-market-registry.md); [006 — Implement durable job ownership and overlap protection](006-durable-job-control.md); [008 — Persist responses and normalize them idempotently](008-transactional-ingestion.md); [009 — Coalesce requests and reuse fresh shared responses](009-shared-fetch-cache.md); [013 — Configure the supervised runtime for logical workers](013-worker-runtime.md); [020 — Implement Worker 1: live match updates](020-live-worker.md); [021 — Implement Worker 2: current-day refresh and reconciliation](021-daily-refresh-worker.md); [022 — Implement Worker 3: resumable historical backfill](022-historical-worker.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Implement the resumable fixture-level prediction orchestration interface that later model and output tasks will connect to the existing engines.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Prediction worker requirements

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 214–222.*

**Purpose:** read database evidence, coordinate the existing three engines, evaluate markets, and save results fixture by fixture. It must not independently duplicate provider fetching.

**Triggers:** a new eligible fixture; a meaningful evidence change; an explicit model/market-version change; or an **hourly recovery sweep** for missing/failed/stale jobs. Merely checking unchanged data is not a prediction trigger.

Process the complete eligible queue, whether it contains 10, 1,000, or more fixtures. Default to **one active fixture prediction at a time**, save each fixture transactionally, and continue after an individual failure. Coalesce repeated changes for a fixture for **60 seconds** before starting another run. Preserve fairness and resumability. If a run takes longer than an hour, the hourly sweep must not restart it; continue the durable queue and report lag. Permit explicitly configured, measured concurrency increases with one lock per fixture and the same resource limits.

Use an idempotency key including `fixtureId + forecastType + evidenceHash + engine/modelVersion + marketRegistryVersion`. Reuse valid stored outputs. A failed attempt may be retried; an unchanged successful attempt should not be regenerated. Missing-data jobs wake when dependencies change, not through repeated futile AI requests.

Implement the detailed decision logic in Section 6. Finished fixtures are used for settlement and training; do not create post-result “pre-match predictions” and count them as successes.

### Odds-only evidence changes

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 233.*

8. An odds-only change updates prices. It must not rerun an odds-independent probability model unless its declared inputs actually include odds.

## Scope boundary

Implement and test orchestration against explicit engine/storage interfaces or existing adapters, not invented production forecasts. Keep new forecast publication gated until tasks 027–042 supply validated evidence, engines and persistence. Do not enable post-result pre-match forecasting.

## Acceptance checks

- [ ] Use the stated triggers, hourly recovery, 60-second coalescing and default one-active-fixture limit with a per-fixture lock.
- [ ] Process the full eligible queue fairly, save progress per fixture and continue after one failure; never restart a long run at each hourly sweep.
- [ ] Use the full fixture/type/evidence/model/market-version idempotency key and reuse successful unchanged outputs.
- [ ] Wake missing-data jobs on dependency changes rather than futile AI requests; keep provider fetching out of this worker.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [024 — Reconcile bookmaker and separate pre-match/live market catalogs](024-odds-catalog-mapping.md).
