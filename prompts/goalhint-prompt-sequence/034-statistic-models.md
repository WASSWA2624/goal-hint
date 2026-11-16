# 034 — Implement separate cards, corners and statistic models

**Phase:** Prediction mechanism  
**Key prerequisites:** [005 — Define the shared versioned market registry](005-market-registry.md); [017 — Implement complete fixture-scoped data ingestion](017-fixture-data-imports.md); [018 — Implement the complete player-data import handlers](018-player-data-imports.md); [027 — Build one bounded, sourced evidence package per fixture](027-fixture-evidence.md); [029 — Separate probability, confidence and evidence eligibility](029-probability-confidence-gates.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Implement or verify suitable count/event models for registered non-goal statistical markets.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Separate statistic-model requirement

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 293.*

6. **Cards/corners/other statistics:** use separate suitable count/event models with their own historical inputs and validation. Do not estimate cards, corners or player bookings from the goal model. Missing relevant models/data means unsupported, not fabricated coverage.

### Requested statistic markets

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 319–320.*

| Family | Required variants to consider |
|---|---|
| Discipline/set pieces | Team/match corners, cards, red cards and relevant handicaps/periods where supported. |
| Other catalog markets | Register, map and evaluate with an appropriate model or give an explicit unsupported reason. |

## Scope boundary

Implement statistic-market modeling only. Do not fabricate coverage or estimate bookings/corners from goal probabilities.

## Acceptance checks

- [ ] Use relevant historical inputs and separate validated capability for match/team corners, cards, red cards and supported periods/handicaps.
- [ ] Register market-specific unsupported reasons where the needed model or data does not exist.
- [ ] Keep statistic-model versions and diagnostics distinct from the goal model.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [035 — Integrate supported contextual effects into model features](035-context-adjustments.md).
