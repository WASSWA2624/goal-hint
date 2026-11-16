# 033 — Implement evidence-supported player outcome models

**Phase:** Prediction mechanism  
**Key prerequisites:** [005 — Define the shared versioned market registry](005-market-registry.md); [017 — Implement complete fixture-scoped data ingestion](017-fixture-data-imports.md); [018 — Implement the complete player-data import handlers](018-player-data-imports.md); [019 — Implement coaching, transfer and career-history ingestion](019-career-data-imports.md); [027 — Build one bounded, sourced evidence package per fixture](027-fixture-evidence.md); [029 — Separate probability, confidence and evidence eligibility](029-probability-confidence-gates.md); [030 — Implement the regularized local result/goal baseline](030-local-goal-model.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Implement or verify player-scoring capability and explicitly assess the other registered player markets against suitable model and participation evidence.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Participation-aware player modeling

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 292.*

5. **Player scoring:** model expected participation/minutes, role, scoring contribution, penalties where evidenced, team scoring environment and opposing defense. Represent lineup uncertainty. Do not force a player forecast when participation or historical evidence is insufficient.

### Requested player variants

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 318.*

| Family | Required variants to consider |
|---|---|
| Players | Anytime/first/last scorer, player goal totals, assists, shots or bookings only with suitable models and participation evidence. |

## Scope boundary

Implement player-market modeling only. Do not derive unsupported assists/shots/bookings from the goal model or label current squads as historical lineups.

## Acceptance checks

- [ ] Model expected participation/minutes, role, scoring contribution, supported penalty roles, team scoring environment and opponent defense.
- [ ] Represent lineup uncertainty and refuse forced player forecasts when participation or historical support is insufficient.
- [ ] Support anytime/first/last scorer, goal totals, assists, shots or bookings only where the specific appropriate model exists; retain explicit reasons otherwise.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [034 — Implement separate cards, corners and statistic models](034-statistic-models.md).
