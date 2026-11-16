# 040 — Enforce probability and settlement-state invariants

**Phase:** Prediction mechanism  
**Key prerequisites:** [005 — Define the shared versioned market registry](005-market-registry.md); [031 — Derive goal-market probabilities from a coherent score distribution](031-coherent-score-distribution.md); [032 — Implement dependence-aware period and half models](032-period-and-half-models.md); [033 — Implement evidence-supported player outcome models](033-player-models.md); [034 — Implement separate cards, corners and statistic models](034-statistic-models.md); [038 — Enforce AI → local → provider routing with validated fallback](038-engine-routing.md); [039 — Evaluate each supported parameterized market](039-market-evaluation.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Implement shared numerical validation that rejects incoherent model/adapter/evaluator outputs before storage or ranking.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Required invariants

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 324–332.*

Keep the following probability invariants:

- Every probability is finite and within [0, 1]. Mutually exclusive, exhaustive outcomes sum to 1 within numerical tolerance.
- `P(1X) = P(home win) + P(draw)`. The three double-chance selections overlap; do not normalize them to sum to 1.
- Goal-threshold probabilities are monotone: `P(over 1.5) >= P(over 2.5) >= P(over 3.5)`.
- Under the same period/settlement rules, BTTS implies at least two goals, so `P(over 1.5) >= P(BTTS yes)`.
- Combination probabilities cannot exceed either component probability.
- Push/no-action/half-win/half-loss possibilities remain separate from outright win probability where applicable.
- Correct scores, ranges, half results and player-related forecasts must not contradict the underlying modeled scenario definitions.

### Score-tail requirement

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 290.*

3. **Coherent goal distribution:** generate a joint distribution of home/away goals. Extend the score grid until omitted probability mass is below **0.000001**, or explicitly retain a tail bucket. Derive result, double chance, totals, team totals, BTTS, correct scores, goal ranges and compatible handicap markets from this shared distribution.

## Scope boundary

Implement shared numerical guards and their tests only. Do not repair invalid outputs by inventing replacement percentages.

## Acceptance checks

- [ ] Check finite [0,1] probabilities and unit sums for mutually exclusive exhaustive outcomes.
- [ ] Validate double-chance addition without renormalizing overlapping selections, goal-threshold monotonicity, BTTS bounds and joint-event bounds.
- [ ] Keep pushes/no-action/half-wins/half-losses distinct from outright win probability and check score/half/player scenario compatibility.
- [ ] Cover score-grid tail mass and coherent coupled outputs, with explicit rejection reasons and focused automated tests.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [041 — Persist forecasts with immutable pre-match history](041-forecast-version-storage.md).
