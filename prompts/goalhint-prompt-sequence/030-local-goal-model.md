# 030 — Implement the regularized local result/goal baseline

**Phase:** Prediction mechanism  
**Key prerequisites:** [016 — Implement complete standings and team-statistics ingestion](016-team-context-imports.md); [017 — Implement complete fixture-scoped data ingestion](017-fixture-data-imports.md); [027 — Build one bounded, sourced evidence package per fixture](027-fixture-evidence.md); [028 — Implement direct and indirect triangulation features](028-relationship-features.md); [029 — Separate probability, confidence and evidence eligibility](029-probability-confidence-gates.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R9** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Audit and improve the existing local goal-model fit, retaining proven components or documenting a validated equivalent.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Baseline and sparse-data requirements

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 286–289.*

Audit the existing local mechanism. Retain proven working components, but ensure the following explicit modeling capabilities or document a validated equivalent:

1. **Result/goal baseline:** fit regularized, time-weighted attack/defense parameters with opponent strength, competition context and home advantage. Use a Poisson score model with an appropriate low-score dependence correction, such as Dixon–Coles, as the baseline—not a guarantee of superior performance. Compare alternatives through chronological validation. [R9]
2. **Sparse-data handling:** use hierarchical/league priors and shared-opponent information with uncertainty. Connected history should influence team strengths; do not turn a single indirect chain into certainty.

## Scope boundary

Implement the fitted goal baseline only. Score-distribution derivations, half/player/statistic models and final calibration are separate tasks.

## Acceptance checks

- [ ] Fit time-weighted regularized attack/defense with opponent strength, competition context and home advantage.
- [ ] Use the requested Poisson baseline with suitable low-score dependence correction, such as Dixon–Coles, or document a validated equivalent.
- [ ] Handle sparse evidence with hierarchical/league priors and connected-opponent information with uncertainty.
- [ ] Expose versioned fitted parameters for the score-distribution task and chronological model comparison; make no unmeasured superiority claim.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [031 — Derive goal-market probabilities from a coherent score distribution](031-coherent-score-distribution.md).
