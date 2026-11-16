# 044 — Publish valid fixtures independently of forecast and odds availability

**Phase:** Publication and administration  
**Key prerequisites:** [001 — Audit the existing application and record the baseline](001-audit-baseline.md); [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [020 — Implement Worker 1: live match updates](020-live-worker.md); [021 — Implement Worker 2: current-day refresh and reconciliation](021-daily-refresh-worker.md); [022 — Implement Worker 3: resumable historical backfill](022-historical-worker.md); [026 — Select and label the correct displayed reference odds](026-odds-reference-prices.md); [041 — Persist forecasts with immutable pre-match history](041-forecast-version-storage.md); [042 — Choose the match-card recommendation by win probability](042-top-pick-ranking.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Repair the public listing/query/cache path so every valid in-scope fixture is visible and ready sections are published incrementally.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Independent incremental publication

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 350–351.*

1. **Fixture visibility and prediction availability are separate.** Publish every valid fixture in the intended public scope even when optional data, odds or a reliable forecast are missing. Show the appropriate unavailable/awaiting-data state while preserving subscription restrictions on protected content.
2. Do not block all publication until all 1,000 fixtures have been predicted. Publish and update incrementally as each fixture/data section becomes ready.

### Prediction without a price

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 232.*

7. A supported forecast remains visible without a price: **“Odds unavailable.”** A bookmaker offering a price does not prove that GoalHint has enough evidence to forecast that market.

## Scope boundary

Repair visibility/publication only. Do not hardcode the screenshot counts or disable subscriptions. Counters are reconciled in task 047.

## Acceptance checks

- [ ] Remove inappropriate prediction/odds/optional-data prerequisites and arbitrary fixture-count caps from public fixture visibility.
- [ ] Expose awaiting/unavailable states without blocking the entire batch until all predictions complete.
- [ ] Preserve authentication and paid-content restrictions; visible fixture metadata must not expose protected predictions.
- [ ] Invalidate affected caches and show supported forecasts with Odds unavailable when no price exists.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [045 — Separate match, freshness, forecast, publication and settlement states](045-status-separation.md).
