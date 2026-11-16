# 057 — Test complete public coverage and authoritative settlement

**Phase:** Testing  
**Key prerequisites:** [020 — Implement Worker 1: live match updates](020-live-worker.md); [021 — Implement Worker 2: current-day refresh and reconciliation](021-daily-refresh-worker.md); [022 — Implement Worker 3: resumable historical backfill](022-historical-worker.md); [026 — Select and label the correct displayed reference odds](026-odds-reference-prices.md); [041 — Persist forecasts with immutable pre-match history](041-forecast-version-storage.md); [044 — Publish valid fixtures independently of forecast and odds availability](044-publication-repair.md); [045 — Separate match, freshness, forecast, publication and settlement states](045-status-separation.md); [046 — Settle and correct predictions using exact market rules](046-settlement.md); [047 — Reconcile admin fixture totals and publication exclusions](047-admin-coverage-counts.md); [048 — Expose truthful worker, quota and completeness health](048-operational-dashboard.md); [049 — Correct performance metric denominators without changing the panel layout](049-performance-metrics.md); [053 — Apply shared server-side Live first sorting before pagination](053-sorting-filters.md); [054 — Show supported market forecasts and correctly sourced bookmaker prices](054-market-details.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Build and run public-listing/state/settlement integration tests against representative and corrected fixture records.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Publication and settlement acceptance cases

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 399, 406–407, 412, 415.*

2. An authoritative correction updates records and settlement; an older in-flight response cannot overwrite newer state.

9. An overdue fixture remains unresolved, not falsely cancelled; it continues receiving checks after midnight.
10. Public fixture coverage reconciles independently of missing predictions or odds; no arbitrary fixture-count cap remains.

15. A reliable prediction without odds is visible; another bookmaker's price never receives the preferred bookmaker's label.

18. Pre-match results are evaluated against forecasts actually issued beforehand; historical reconstruction and live forecasts are not counted as pre-match wins.

### Exact settlement conditions

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 354.*

5. Settle predictions from authoritative outcomes and exact market rules, including period boundaries, extra-time exclusions, pushes, VAR corrections and player participation conditions. Handle provider corrections idempotently.

## Scope boundary

This task tests publication and settlement behavior, not a UI redesign or a new forecast model.

## Acceptance checks

- [ ] Reconcile all valid public-scope IDs without requiring odds/predictions and without arbitrary fixture-count limits.
- [ ] Keep overdue fixtures unresolved across midnight and reject false cancellation/completion from kickoff arithmetic.
- [ ] Apply authoritative/VAR corrections, exact periods, pushes and player participation idempotently while retaining pre-match history.
- [ ] Verify no-price visibility, correct bookmaker/fallback labels, protected-content gating and truthful admin/performance counts.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [058 — Verify responsive layouts and existing application behavior](058-responsive-regression-tests.md).
