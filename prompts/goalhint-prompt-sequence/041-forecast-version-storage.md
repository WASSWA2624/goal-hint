# 041 — Persist forecasts with immutable pre-match history

**Phase:** Prediction mechanism  
**Key prerequisites:** [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md); [005 — Define the shared versioned market registry](005-market-registry.md); [023 — Implement Worker 4: the durable prediction lifecycle](023-prediction-worker.md); [027 — Build one bounded, sourced evidence package per fixture](027-fixture-evidence.md); [029 — Separate probability, confidence and evidence eligibility](029-probability-confidence-gates.md); [038 — Enforce AI → local → provider routing with validated fallback](038-engine-routing.md); [039 — Evaluate each supported parameterized market](039-market-evaluation.md); [040 — Enforce probability and settlement-state invariants](040-probability-invariants.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Connect final forecast persistence to the durable worker, preserving every published pre-match version and all market-level diagnostics.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Stored forecast schema

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 338.*

For each supported market save: fixture ID, market key/parameters, recommended selection, outcome probabilities, confidence/support diagnostics, optional uncertainty interval, explanation/evidence references, engine/model version, evidence hash/cutoff, generation time, forecast type, and status. Join odds separately with source and timestamp. Save unavailable-market reasons as well.

### Historical integrity

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 344.*

Freeze and retain each published pre-match forecast version. If live forecasting exists or is added within the approved scope, store and label it separately, conditioned on current time/score. Never overwrite a pre-match forecast with hindsight, silently change its outcome after kickoff, or count post-event forecasts as successful pre-match predictions.

### Idempotency and finished-fixture handling

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 220–222.*

Use an idempotency key including `fixtureId + forecastType + evidenceHash + engine/modelVersion + marketRegistryVersion`. Reuse valid stored outputs. A failed attempt may be retried; an unchanged successful attempt should not be regenerated. Missing-data jobs wake when dependencies change, not through repeated futile AI requests.

Implement the detailed decision logic in Section 6. Finished fixtures are used for settlement and training; do not create post-result “pre-match predictions” and count them as successes.

## Scope boundary

Implement forecast persistence and lifecycle wiring only. This task does not authorize adding live forecasting beyond existing/approved scope or changing published outcomes after kickoff.

## Acceptance checks

- [ ] Save every required market output field, evidence/source references, cutoff/hash, engine/model/market versions, type, status and unavailable reason transactionally per fixture.
- [ ] Join prices separately with source/time rather than embedding a stale or mislabeled bookmaker value into probability history.
- [ ] Retain frozen published pre-match versions; label any approved live forecasts separately and never rewrite them with hindsight.
- [ ] Wire the orchestration/storage interfaces, reuse valid unchanged outputs and prevent post-result pre-match generation.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [042 — Choose the match-card recommendation by win probability](042-top-pick-ranking.md).
