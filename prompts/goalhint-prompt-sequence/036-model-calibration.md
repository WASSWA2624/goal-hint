# 036 — Validate, calibrate and version the forecasting models

**Phase:** Prediction mechanism  
**Key prerequisites:** [029 — Separate probability, confidence and evidence eligibility](029-probability-confidence-gates.md); [030 — Implement the regularized local result/goal baseline](030-local-goal-model.md); [031 — Derive goal-market probabilities from a coherent score distribution](031-coherent-score-distribution.md); [032 — Implement dependence-aware period and half models](032-period-and-half-models.md); [033 — Implement evidence-supported player outcome models](033-player-models.md); [034 — Implement separate cards, corners and statistic models](034-statistic-models.md); [035 — Integrate supported contextual effects into model features](035-context-adjustments.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R9, R10, R11** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Implement chronological model evaluation/calibration and versioned maintenance training without retraining the full system for each fixture.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Validation and maintenance requirements

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 295–297.*

8. **Calibration:** validate with time-ordered holdouts, appropriate probability calibration, reliability curves, Brier score and log loss, alongside coverage and abstention. Use only evidence available before the forecast time; avoid future-data leakage. [R10, R11]

Training/calibration may run as maintenance jobs managed by the prediction infrastructure; do not retrain the entire model for every fixture. Version all fitted models and feature definitions. A market without a tested model must not be advertised as validated.

### Evidence-gate validation

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 264.*

Define versioned, market-specific evidence gates and validate thresholds on held-out data. Do not require every optional field, use one universal minimum-match count, or consider team names and kickoff alone sufficient evidence.

### Learned or validated weighting

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 252.*

5. Weight relevance, recency, sample size, competition comparability, venue, roster continuity, source quality, and missingness. Learn or validate numerical weights; do not invent universal weights that merely produce confident-looking outputs.

## Scope boundary

Implement validation/calibration and report measured results only. Do not claim better accuracy because a model was implemented, and do not substitute historical reconstruction for contemporaneous pre-match evidence.

## Acceptance checks

- [ ] Use time-ordered holdouts and only information available before forecast time; compare supported baselines/alternatives without future leakage.
- [ ] Report reliability curves, Brier score, log loss, coverage and abstention with appropriate calibration.
- [ ] Validate/version evidence gates, fitted models and feature definitions; keep untested markets explicitly unvalidated.
- [ ] Schedule training/calibration as prediction-infrastructure maintenance work, not per-fixture retraining; report insufficient data honestly.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [037 — Correct the API-Football forecast adapter](037-provider-prediction-adapter.md).
