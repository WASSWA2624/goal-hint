# 035 — Integrate supported contextual effects into model features

**Phase:** Prediction mechanism  
**Key prerequisites:** [019 — Implement coaching, transfer and career-history ingestion](019-career-data-imports.md); [027 — Build one bounded, sourced evidence package per fixture](027-fixture-evidence.md); [028 — Implement direct and indirect triangulation features](028-relationship-features.md); [029 — Separate probability, confidence and evidence eligibility](029-probability-confidence-gates.md); [030 — Implement the regularized local result/goal baseline](030-local-goal-model.md); [032 — Implement dependence-aware period and half models](032-period-and-half-models.md); [033 — Implement evidence-supported player outcome models](033-player-models.md); [034 — Implement separate cards, corners and statistic models](034-statistic-models.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Integrate verified contextual information into the appropriate model using learned or validated effects and explicit limits.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Context and weighting requirements

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 252, 294.*

5. Weight relevance, recency, sample size, competition comparability, venue, roster continuity, source quality, and missingness. Learn or validate numerical weights; do not invent universal weights that merely produce confident-looking outputs.

7. **Context adjustments:** integrate verified injuries, transfers, formations and related features with learned or validated effects and limits. Derived referee/coach trends need real historical support; no invented provider ratings.

### Context-source boundary

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 89.*

Do not claim that API-Football supplies news, weather, tactical assessments, manager ratings, or psychological states as standard fields. Use existing authorized external sources only when genuinely available, attributable, and timestamped. Derived metrics must be labeled derived. Never invent a player's mental state.

## Scope boundary

Implement contextual feature integration only. Do not create unauthorized external feeds or universal coefficients chosen to produce confident-looking predictions.

## Acceptance checks

- [ ] Account for relevance, recency, sample size, competition comparability, venue, roster continuity, source quality and missingness through defensible learned/validated behavior.
- [ ] Use supported injuries, transfers, formations and related context with provenance and bounded effects.
- [ ] Require real historical evidence for derived referee/coach trends; disclose derived features rather than inventing provider ratings or mental states.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [036 — Validate, calibrate and version the forecasting models](036-model-calibration.md).
