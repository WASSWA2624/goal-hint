# 049 — Correct performance metric denominators without changing the panel layout

**Phase:** Publication and administration  
**Key prerequisites:** [041 — Persist forecasts with immutable pre-match history](041-forecast-version-storage.md); [046 — Settle and correct predictions using exact market rules](046-settlement.md); [047 — Reconcile admin fixture totals and publication exclusions](047-admin-coverage-counts.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Audit and repair performance calculations and wording while preserving the existing performance panel layout.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Performance metric definition

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 357.*

8. Preserve the performance panel's layout. Audit its counting definitions: do not mix fixture counts with multi-market prediction counts or label wins/all fixtures as a resolved-pick hit rate. Any metric wording change must make the denominator explicit.

### Historical scoring integrity

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 344.*

Freeze and retain each published pre-match forecast version. If live forecasting exists or is added within the approved scope, store and label it separately, conditioned on current time/score. Never overwrite a pre-match forecast with hindsight, silently change its outcome after kickoff, or count post-event forecasts as successful pre-match predictions.

## Scope boundary

Implement metric definitions and necessary labels only. Do not restyle the performance panel or claim measured forecasting improvement without results.

## Acceptance checks

- [ ] Keep fixture counts distinct from multi-market prediction counts.
- [ ] Use the correct resolved-pick denominator for hit-rate wording and make any revised denominator explicit.
- [ ] Evaluate retained pre-match forecasts actually published beforehand, not reconstructed/live/post-result outputs.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [050 — Refine desktop match rows without increasing their height](050-desktop-match-rows.md).
