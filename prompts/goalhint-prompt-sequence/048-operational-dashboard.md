# 048 — Expose truthful worker, quota and completeness health

**Phase:** Publication and administration  
**Key prerequisites:** [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [006 — Implement durable job ownership and overlap protection](006-durable-job-control.md); [011 — Implement the shared quota budget and priority scheduler](011-quota-scheduler.md); [012 — Implement failure classification and quota-aware retries](012-retries-errors.md); [013 — Configure the supervised runtime for logical workers](013-worker-runtime.md); [020 — Implement Worker 1: live match updates](020-live-worker.md); [021 — Implement Worker 2: current-day refresh and reconciliation](021-daily-refresh-worker.md); [022 — Implement Worker 3: resumable historical backfill](022-historical-worker.md); [023 — Implement Worker 4: the durable prediction lifecycle](023-prediction-worker.md); [024 — Reconcile bookmaker and separate pre-match/live market catalogs](024-odds-catalog-mapping.md); [025 — Implement full, independent odds-price ingestion](025-odds-ingestion.md); [047 — Reconcile admin fixture totals and publication exclusions](047-admin-coverage-counts.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Connect the existing admin health views to actual shared worker, quota, checkpoint and mapping state.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Operational reporting

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 356.*

7. Report worker heartbeat, last success/error, queue lag, next run, quota usage/reserve/reset, checkpoint, complete/partial/unavailable sections, odds freshness and market-mapping coverage. Do not claim a complete import when only its first page or fixture list was saved.

### Backfill progress truthfulness

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 210.*

12. Expose progress, next checkpoint, completed/partial dates, failures, quota wait, and an estimate of remaining work when the total is knowable. Use “not yet measured” instead of a fictional exact remaining count.

## Scope boundary

Implement operational observability in existing admin structures only. Do not redesign unrelated pages or expose account/credential details publicly.

## Acceptance checks

- [ ] Report heartbeat, last success/error, queue lag, next run, quota usage/reserve/reset and exact checkpoint.
- [ ] Show complete/partial/unavailable sections, odds freshness, mapping coverage, quota waits and failures.
- [ ] Use not yet measured when remaining work is unknowable and never label a first-page-only import complete.
- [ ] Use actual persisted state to replace misleading import/wait displays rather than hiding errors.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [049 — Correct performance metric denominators without changing the panel layout](049-performance-metrics.md).
