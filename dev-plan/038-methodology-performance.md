# 038 Methodology and measured performance

**Feature:** The public How it works page with honest performance reporting.

**Depends on:** [014-forecast-evaluation.md](014-forecast-evaluation.md), [030-performance-api.md](030-performance-api.md), [035-match-detail-page.md](035-match-detail-page.md).

**Source:** [App specification](../app-write-up.md), sections 2, 4–8, 11, 12 and 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, evaluation decisions and existing performance service. Build `/en/how-it-works` as an accessible server-rendered page linked from the footer, Results and probability help. Explain estimated probabilities, provisional estimates, evidence limitations, AI priority, validated provider fallback, the daily seven-day EAT refresh, original publication times and the five-minute cutoff. State regulation-time settlement rules, pending/void/unavailable meanings, immutable locked picks, revision history and audited corrections. Explain that late lineup news may be absent and no forecast guarantees a result.

Implement the measured performance presentation using the existing stored-data API/service. Show market, selected EAT cohort/period, counts and relevant model/provider version. Separate AI and fallback metrics, label combined totals and link to locked forecasts. Display hit rate with its denominator; show Brier score/log loss and calibration bands only with appropriate comparable data and context. Include coverage and distinguish settled, pending, unavailable and void counts. Old postponed cycles and failed refresh attempts cannot inflate fixture totals.

Enforce the previously defined minimum samples and claim gates. Use truthful insufficient-data/provisional states when evidence is absent; never invent a fixed accuracy target, favorable examples, experts or calibration claims. Do not recompute outcome cohorts in client components or select the most successful historical revision.

Publish concise source attribution and the actual owner-approved correction/dispute policy. If policy ownership/details remain unresolved, record a release blocker and keep deployable content truthful; do not fabricate contact details or imply a policy is operational without support.

## Acceptance checks

- Reconcile displayed counts/metrics to the service for mixed AI/fallback, pending, void and unavailable fixtures.
- Check empty/small cohorts, minimum sample gates, horizon labels and links to locked predictions.
- Verify disclosure copy matches implemented cadence, cutoff and settlement behavior.
- Check initial HTML, keyboard access, small screens and clear chart/table labels if used.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Update `docs/development-progress.md` with changed files, checks/results and actual blockers. Record content/claim decisions and unresolved ownership in `docs/implementation-decisions.md`.
