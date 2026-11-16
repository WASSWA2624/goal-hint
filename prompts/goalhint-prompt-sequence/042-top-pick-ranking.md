# 042 — Choose the match-card recommendation by win probability

**Phase:** Prediction mechanism  
**Key prerequisites:** [026 — Select and label the correct displayed reference odds](026-odds-reference-prices.md); [029 — Separate probability, confidence and evidence eligibility](029-probability-confidence-gates.md); [039 — Evaluate each supported parameterized market](039-market-evaluation.md); [040 — Enforce probability and settlement-state invariants](040-probability-invariants.md); [041 — Persist forecasts with immutable pre-match history](041-forecast-version-storage.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Implement the deterministic match-card recommendation selector over eligible supported market predictions.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Top-pick ordering

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 340.*

Choose the match-card recommendation from eligible supported predictions by **estimated win probability descending**, then **confidence**, then available comparable odds only as a final tie-break, followed by a stable market/selection key. Do not force double chance, artificial diversity, minimum odds, or fixed 90% probabilities. Diversity should follow the evidence, not a quota for different market labels.

### Probability versus ranking semantics

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 258–262.*

- **Win probability:** the model's estimated chance of the specified outcome under that market's settlement rules.
- **Evidence/model confidence:** reliability of that estimate, considering support, completeness, freshness, disagreement, domain fit and measured calibration.
- **Ranking score:** an internal selection aid, if needed; never label it probability or use it to silently override the required ranking order.

Low confidence does not automatically mean a low probability. For example, a likely outcome can still have an uncertain probability estimate. Do not multiply probability by a made-up confidence percentage. Store uncertainty/support diagnostics; label any confidence score as a model-reliability measure, not another chance of winning.

## Scope boundary

Implement top-pick selection only. Do not replace probability with an internal ranking score or confuse this comparator with the page-level Live first fixture sort.

## Acceptance checks

- [ ] Rank by estimated win probability descending, then confidence, then available comparable odds only as a final tie-break, then stable market/selection key.
- [ ] Remove forced double chance, fixed 90% outputs, artificial diversity and minimum-odds selection rules wherever the audit confirms them.
- [ ] Keep the selected outcome, actual probability, confidence and source consistent with the stored market forecast.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [043 — Preserve slips without misleading independence claims](043-slip-integrity.md).
