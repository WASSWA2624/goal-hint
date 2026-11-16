# 029 — Separate probability, confidence and evidence eligibility

**Phase:** Prediction mechanism  
**Key prerequisites:** [005 — Define the shared versioned market registry](005-market-registry.md); [027 — Build one bounded, sourced evidence package per fixture](027-fixture-evidence.md); [028 — Implement direct and indirect triangulation features](028-relationship-features.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Define and implement market-specific evidence gates and output semantics that keep estimated outcome probability distinct from model reliability and internal ranking.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Probability and confidence requirements

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 258–264.*

- **Win probability:** the model's estimated chance of the specified outcome under that market's settlement rules.
- **Evidence/model confidence:** reliability of that estimate, considering support, completeness, freshness, disagreement, domain fit and measured calibration.
- **Ranking score:** an internal selection aid, if needed; never label it probability or use it to silently override the required ranking order.

Low confidence does not automatically mean a low probability. For example, a likely outcome can still have an uncertain probability estimate. Do not multiply probability by a made-up confidence percentage. Store uncertainty/support diagnostics; label any confidence score as a model-reliability measure, not another chance of winning.

Define versioned, market-specific evidence gates and validate thresholds on held-out data. Do not require every optional field, use one universal minimum-match count, or consider team names and kickoff alone sufficient evidence.

### Sparse evidence behavior

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 253.*

6. Missing head-to-head history alone must not block a prediction. Evidence for an apparently missing team may exist in opponent fixtures, player histories or the wider model. If there is genuinely no reliable signal for that team/market, use a validated prior with disclosed uncertainty or abstain.

## Scope boundary

Implement eligibility/diagnostic contracts and checks, not arbitrary confidence percentages or claims of validation before held-out results exist.

## Acceptance checks

- [ ] Store probability, support/uncertainty diagnostics and any internal ranking score as distinct concepts.
- [ ] Version evidence gates by market family and make their thresholds subject to chronological held-out validation in task 036.
- [ ] Permit valid indirect evidence or validated priors with disclosed uncertainty; abstain when there is no reliable signal.
- [ ] Reject confidence-multiplied probabilities, one universal minimum-match count and team-name/kickoff-only evidence.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [030 — Implement the regularized local result/goal baseline](030-local-goal-model.md).
