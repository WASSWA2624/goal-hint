# 059 — Measure request demand against the actual account plan

**Phase:** Rollout preparation  
**Key prerequisites:** [001 — Audit the existing application and record the baseline](001-audit-baseline.md); [002 — Build the versioned provider endpoint inventory](002-endpoint-inventory.md); [010 — Implement documented batching and resumable pagination](010-batching-pagination.md); [011 — Implement the shared quota budget and priority scheduler](011-quota-scheduler.md); [012 — Implement failure classification and quota-aware retries](012-retries-errors.md); [020 — Implement Worker 1: live match updates](020-live-worker.md); [021 — Implement Worker 2: current-day refresh and reconciliation](021-daily-refresh-worker.md); [022 — Implement Worker 3: resumable historical backfill](022-historical-worker.md); [023 — Implement Worker 4: the durable prediction lifecycle](023-prediction-worker.md); [024 — Reconcile bookmaker and separate pre-match/live market catalogs](024-odds-catalog-mapping.md); [025 — Implement full, independent odds-price ingestion](025-odds-ingestion.md); [048 — Expose truthful worker, quota and completeness health](048-operational-dashboard.md); [055 — Test idempotent ingestion, recovery and quota coordination](055-ingestion-resilience-tests.md); [056 — Test forecasting evidence, fallback, invariants and queue scale](056-prediction-validation-tests.md); [057 — Test complete public coverage and authoritative settlement](057-publication-settlement-tests.md); [058 — Verify responsive layouts and existing application behavior](058-responsive-regression-tests.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R8** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Produce an evidence-based before/after request budget and decide which configured freshness targets the actual account can sustain.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Capacity validation

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 419.*

Run tests with mocked/replayed provider responses before spending production quota. Measure proposed daily/minute request demand using actual fixture volumes and the configured plan. Report infeasible freshness targets instead of silently exhausting quota.

### Budget reserve and degradation

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 135–142.*

Read actual account limits and rate-limit headers. Support the application's actual subscription channel. Direct-dashboard daily resets and marketplace subscription resets may differ; do not assume Kampala midnight or one reset rule for every account. [R8]

Use the following proposed policy:

- Central rate limit: at most **80% of documented per-minute/per-second limits**, with all processes sharing the same accounting. Until limits are known/configured, use **5 requests/minute, one concurrent request**, and report degraded operation.
- Priority: **live status/final confirmation → current-day discovery and missing data → current-match enrichment/odds → historical backfill**. Use fair scheduling within a priority so one fixture cannot starve the rest.
- Recompute the request budget hourly and when live load or limits change. Reserve **120% of forecast remaining critical requests until reset**, plus **5% of the daily limit**. Backfill may consume only the positive remainder and at most **20% of the per-minute allowance**.
- If the plan cannot sustain the workload, pause backfill first, then reduce enrichment frequency. Degrade live polling from **60 → 120 → 300 seconds** only as needed; show actual freshness and raise an admin capacity warning. Do not claim unchanged accuracy/freshness under insufficient quota.

## Scope boundary

Validate operational capacity only. Do not silently exhaust quota, promise unchanged freshness under an undersized plan or purchase/change subscriptions.

## Acceptance checks

- [ ] Use actual fixture volumes, endpoint/page/batch counts, account limits and verified reset rules, not invented traffic assumptions.
- [ ] Measure daily and short-window demand across live, current, enrichment, recovery and backfill work with shared-request reuse.
- [ ] Report reserves, supported schedules and infeasible targets; apply only the documented degradation order with explicit warnings.
- [ ] Supply measured baseline/after estimates and configuration deviations for rollout and the final report.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [060 — Deploy reversibly and verify the first operating cycles](060-staged-rollout.md).
