# 039 — Evaluate each supported parameterized market

**Phase:** Prediction mechanism  
**Key prerequisites:** [005 — Define the shared versioned market registry](005-market-registry.md); [024 — Reconcile bookmaker and separate pre-match/live market catalogs](024-odds-catalog-mapping.md); [029 — Separate probability, confidence and evidence eligibility](029-probability-confidence-gates.md); [031 — Derive goal-market probabilities from a coherent score distribution](031-coherent-score-distribution.md); [032 — Implement dependence-aware period and half models](032-period-and-half-models.md); [033 — Implement evidence-supported player outcome models](033-player-models.md); [034 — Implement separate cards, corners and statistic models](034-statistic-models.md); [036 — Validate, calibrate and version the forecasting models](036-model-calibration.md); [037 — Correct the API-Football forecast adapter](037-provider-prediction-adapter.md); [038 — Enforce AI → local → provider routing with validated fallback](038-engine-routing.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Implement the shared evaluator that visits every applicable registered market instance and selects its highest-probability supported outcome.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Required market-family evaluation

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 305–322.*

Evaluate these families wherever the required evidence and models support them:

| Family | Required variants to consider |
|---|---|
| Results | Full-time home/draw/away; supported first-half and second-half results. |
| Double chance | Home/draw, home/away, draw/away for supported periods. |
| Draw no bet/handicaps | Supported draw-no-bet, European and Asian lines, with push/partial-settlement rules. |
| Total goals | Over/under **0.5, 1.5, 2.5, 3.5, 4.5 and 5.5**, plus other legitimate registered lines; handle integer/quarter lines correctly. |
| Team goals | Each team's supported totals, scoring yes/no and clean-sheet markets. |
| BTTS / goal-goal | Yes/no at full time and supported half-specific variants. |
| Correct score/ranges | Full-time and supported half scores; exact totals and registered bands such as 1–2, 1–3 or 1–4. |
| Half relationships | Highest-scoring half including equal; half-time/full-time outcomes; supported scoring-in-both-halves variants. |
| Combined outcomes | Result/double chance with goals, BTTS with totals, and other mapped combinations using their joint probability. |
| Players | Anytime/first/last scorer, player goal totals, assists, shots or bookings only with suitable models and participation evidence. |
| Discipline/set pieces | Team/match corners, cards, red cards and relevant handicaps/periods where supported. |
| Other catalog markets | Register, map and evaluate with an appropriate model or give an explicit unsupported reason. |

For each supported **parameterized market**, compute its outcome distribution and choose the highest-probability supported outcome. For example, over/under 1.5 and over/under 2.5 are separate market instances. A recommended pick is not a claim that it is highly likely; correct-score markets can have low top probabilities.

### No artificial markets

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 334.*

Never fabricate unrealistic new goal lines solely to obtain near-100% recommendations. Legitimate registered markets can be predicted without current bookmaker odds, but must have clear, meaningful settlement definitions.

## Scope boundary

Implement per-market evaluation only. Match-card top-pick ranking is task 042, and outcome coherence is enforced by task 040.

## Acceptance checks

- [ ] Evaluate all requested result, goal, half, handicap, combined, player and statistic variants where evidence and validated capability support them.
- [ ] Treat each line/player/team/period as the correct separate parameterized instance; use joint probabilities for combinations.
- [ ] Retain explicit unsupported/unmapped/insufficient-evidence reasons rather than silently dropping catalog entries.
- [ ] Permit meaningful registered predictions without current bookmaker odds, without claiming a low-probability top correct-score pick is highly likely.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [040 — Enforce probability and settlement-state invariants](040-probability-invariants.md).
