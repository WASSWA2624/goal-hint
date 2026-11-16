# 056 — Test forecasting evidence, fallback, invariants and queue scale

**Phase:** Testing  
**Key prerequisites:** [023 — Implement Worker 4: the durable prediction lifecycle](023-prediction-worker.md); [027 — Build one bounded, sourced evidence package per fixture](027-fixture-evidence.md); [028 — Implement direct and indirect triangulation features](028-relationship-features.md); [029 — Separate probability, confidence and evidence eligibility](029-probability-confidence-gates.md); [030 — Implement the regularized local result/goal baseline](030-local-goal-model.md); [031 — Derive goal-market probabilities from a coherent score distribution](031-coherent-score-distribution.md); [032 — Implement dependence-aware period and half models](032-period-and-half-models.md); [033 — Implement evidence-supported player outcome models](033-player-models.md); [034 — Implement separate cards, corners and statistic models](034-statistic-models.md); [035 — Integrate supported contextual effects into model features](035-context-adjustments.md); [036 — Validate, calibrate and version the forecasting models](036-model-calibration.md); [037 — Correct the API-Football forecast adapter](037-provider-prediction-adapter.md); [038 — Enforce AI → local → provider routing with validated fallback](038-engine-routing.md); [039 — Evaluate each supported parameterized market](039-market-evaluation.md); [040 — Enforce probability and settlement-state invariants](040-probability-invariants.md); [041 — Persist forecasts with immutable pre-match history](041-forecast-version-storage.md); [042 — Choose the match-card recommendation by win probability](042-top-pick-ranking.md); [043 — Preserve slips without misleading independence claims](043-slip-integrity.md); [054 — Show supported market forecasts and correctly sourced bookmaker prices](054-market-details.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Build and run the forecasting acceptance suite, including a resumable queue of at least 1,000 fixtures.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Required forecasting acceptance tests

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 408–415.*

11. Missing head-to-head data can use valid indirect evidence; a wholly unsupported market abstains with a reason.
12. A common-opponent chain and a player transfer affect estimates without becoming guaranteed conclusions or double-counted evidence.
13. AI failure/invalid output falls back to local, then API only for supported outputs; partial success is retained and source labels remain accurate.
14. Outcome-sum, double-chance, threshold, BTTS, joint-event, score-tail and push-settlement invariants hold.
15. A reliable prediction without odds is visible; another bookmaker's price never receives the preferred bookmaker's label.
16. New meaningful evidence triggers one fresh forecast; unchanged data and ordinary odds-only updates do not trigger unnecessary AI runs.
17. A queue of at least **1,000 fixtures** saves progress fixture by fixture, survives interruption, and does not stop after a subset or one bad fixture.
18. Pre-match results are evaluated against forecasts actually issued beforehand; historical reconstruction and live forecasts are not counted as pre-match wins.

## Scope boundary

This task tests the forecasting subsystem. Use mocked/replayed provider inputs and do not confuse a functional pass with statistical improvement.

## Acceptance checks

- [ ] Test indirect evidence without head-to-head, explicit abstention, common-opponent/transfer effects and no double counting.
- [ ] Exercise invalid/failed AI fallback to eligible local/provider outputs with retained partial success and honest source labels.
- [ ] Check all specified probability/tail/settlement invariants, odds-independent triggering and supported no-price forecasts.
- [ ] Interrupt and resume at least 1,000 fixture jobs; prove per-fixture progress, fairness and survival of a bad fixture.
- [ ] Verify that only genuinely issued pre-match forecast versions count in pre-match evaluation; report measured outcomes, not assumed accuracy.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [057 — Test complete public coverage and authoritative settlement](057-publication-settlement-tests.md).
