# 043 — Preserve slips without misleading independence claims

**Phase:** Prediction mechanism  
**Key prerequisites:** [001 — Audit the existing application and record the baseline](001-audit-baseline.md); [029 — Separate probability, confidence and evidence eligibility](029-probability-confidence-gates.md); [039 — Evaluate each supported parameterized market](039-market-evaluation.md); [040 — Enforce probability and settlement-state invariants](040-probability-invariants.md); [041 — Persist forecasts with immutable pre-match history](041-forecast-version-storage.md); [042 — Choose the match-card recommendation by win probability](042-top-pick-ranking.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Review and repair the existing slip calculation/presentation only where needed to preserve probabilistic honesty and existing functionality.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Slip requirements

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 346.*

For slips, retain existing functionality but do not claim that many low-odds selections are collectively safe. Multiplying probabilities assumes independence; correlated selections require dependence-aware handling. Do not promise that a target combined odd can also achieve a guaranteed hit rate.

## Scope boundary

This is an existing-slip integrity task, not a redesign, new slip product or replacement pricing/subscription feature. Do not import additional slip requirements from outside the supplied source.

## Acceptance checks

- [ ] Keep existing slip functionality and access controls intact.
- [ ] Identify independence assumptions and handle correlated selections through an appropriate dependence-aware method or disclose unsupported combined probability.
- [ ] Remove any claim that many low-odds selections are collectively safe or that a target combined odd guarantees a hit rate.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [044 — Publish valid fixtures independently of forecast and odds availability](044-publication-repair.md).
