# 046 — Settle and correct predictions using exact market rules

**Phase:** Publication and administration  
**Key prerequisites:** [005 — Define the shared versioned market registry](005-market-registry.md); [017 — Implement complete fixture-scoped data ingestion](017-fixture-data-imports.md); [020 — Implement Worker 1: live match updates](020-live-worker.md); [021 — Implement Worker 2: current-day refresh and reconciliation](021-daily-refresh-worker.md); [040 — Enforce probability and settlement-state invariants](040-probability-invariants.md); [041 — Persist forecasts with immutable pre-match history](041-forecast-version-storage.md); [045 — Separate match, freshness, forecast, publication and settlement states](045-status-separation.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Implement or repair the settlement consumer for stored forecasts using authoritative fixture facts and the shared market registry.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Settlement requirement

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 354.*

5. Settle predictions from authoritative outcomes and exact market rules, including period boundaries, extra-time exclusions, pushes, VAR corrections and player participation conditions. Handle provider corrections idempotently.

### Final reconciliation and partial settlement

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 163, 331.*

6. After an authoritative final state, save results and enqueue settlement. Schedule final-detail reconciliation after **15 minutes** and **24 hours** to capture delayed data/corrections, then archive complete records. Still-missing sections remain tracked separately.

- Push/no-action/half-win/half-loss possibilities remain separate from outright win probability where applicable.

## Scope boundary

Implement settlement only. Do not change the original recommended pick or count hindsight forecasts as pre-match successes.

## Acceptance checks

- [ ] Apply exact period boundaries, extra-time exclusions, pushes/partial outcomes, player participation and market-specific conditions.
- [ ] Process authoritative results and VAR/provider corrections idempotently, preserving the original forecast history.
- [ ] Consume Worker 1 final/reconciliation jobs and handle later corrections without duplicate settlement effects.
- [ ] Keep unsupported or unresolved results unresolved rather than inventing a final outcome.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [047 — Reconcile admin fixture totals and publication exclusions](047-admin-coverage-counts.md).
