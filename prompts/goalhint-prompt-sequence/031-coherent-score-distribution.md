# 031 — Derive goal-market probabilities from a coherent score distribution

**Phase:** Prediction mechanism  
**Key prerequisites:** [005 — Define the shared versioned market registry](005-market-registry.md); [029 — Separate probability, confidence and evidence eligibility](029-probability-confidence-gates.md); [030 — Implement the regularized local result/goal baseline](030-local-goal-model.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Implement the joint home/away goal distribution and its compatible result/goal-market derivations.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Joint goal-distribution requirement

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 290.*

3. **Coherent goal distribution:** generate a joint distribution of home/away goals. Extend the score grid until omitted probability mass is below **0.000001**, or explicitly retain a tail bucket. Derive result, double chance, totals, team totals, BTTS, correct scores, goal ranges and compatible handicap markets from this shared distribution.

### Core coherence rules

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 326–332.*

- Every probability is finite and within [0, 1]. Mutually exclusive, exhaustive outcomes sum to 1 within numerical tolerance.
- `P(1X) = P(home win) + P(draw)`. The three double-chance selections overlap; do not normalize them to sum to 1.
- Goal-threshold probabilities are monotone: `P(over 1.5) >= P(over 2.5) >= P(over 3.5)`.
- Under the same period/settlement rules, BTTS implies at least two goals, so `P(over 1.5) >= P(BTTS yes)`.
- Combination probabilities cannot exceed either component probability.
- Push/no-action/half-win/half-loss possibilities remain separate from outright win probability where applicable.
- Correct scores, ranges, half results and player-related forecasts must not contradict the underlying modeled scenario definitions.

## Scope boundary

Implement goal-distribution calculations, not independent guessed probabilities for each market. The cross-engine invariant suite is task 040.

## Acceptance checks

- [ ] Extend the score grid until omitted mass is below 0.000001 or retain an explicit tail bucket.
- [ ] Derive result, double chance, totals, team totals, BTTS, correct scores, ranges and compatible handicaps from the same distribution.
- [ ] Retain push/no-action/partial-settlement states separately and check outcome sums, thresholds and related-event bounds.
- [ ] Expose probability outputs with explicit market/period/line/settlement semantics for the shared evaluator.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [032 — Implement dependence-aware period and half models](032-period-and-half-models.md).
