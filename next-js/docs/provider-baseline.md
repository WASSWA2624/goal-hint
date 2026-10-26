# Baseline retention and optional AI precedence

The approved prediction-engine policy supersedes the 25 October shadow-only
rule. New live plans freeze `ai-first`. The shared fallback service uses
`optional-ai-primary`, always collects the provider within its bounded allowance,
and retains its independent provider-only `baseline` alongside the original AI
receipt. A usable AI recommendation wins even when the baseline disagrees.
Probability eligibility and exact quote selection are documented in
[the engine runbook](prediction-engine.md).

AI parsing alone does not establish a usable recommendation. Shared market,
identity, freshness, probability, historical evidence and exact quote validation
apply before selection. If AI has no qualified priced recommendation, the worker
uses the independently retained baseline. Partial AI groups can be supplemented
only through existing complete-group and cross-market consistency validation;
the final valid AI recommendation keeps precedence.

AI is optional. Disabled capability, an absent key, unsupported model, startup or
accounting outage, timeout, exhausted allocation, invalid output, ungrounded
citations, stale evidence or unavailable optional research leave the baseline
path available within the publication deadline. Canonical identity, cutoff,
transmission rights, secret handling, budget and atomic publication gates remain.

This is a product source-order decision. It supplies no measured accuracy,
calibration, profitability or guaranteed-win claim and needs no fabricated
promotion report. Provisional labels and genuine future evaluation remain.
`GOAL_HINT_AI_PROMOTION_REF` is historical configuration only. Explicit
`GOAL_HINT_FORECAST_SOURCE_ORDER=provider-first` rolls new jobs back to provider-only
publication. Saved historical orders and immutable revisions retain their original
behavior and clocks; changing configuration does not rewrite them.

## Original source receipts and restart

`PredictionRefreshIntent` freezes canonical fixture/version, analysis cutoff,
model pin, policy and resource limits. Append-only preparation, evidence, AI and
fallback stages retain original sources, both contemporaneous distributions,
missingness and costs. The fallback result includes the independent baseline,
never probabilities copied from AI. The persisted recommendation identifies its
source, policy/evidence versions and exact internal quote snapshot. Reads do not
rerank it after price updates. Replays reuse original stages and perform no new
paid attempt or clock renewal.

Private `/admin/forecasts` comparisons remain descriptive diagnostics on matched
settled observations. Their existence is neither a qualified prospective cohort
nor demonstrated improvement. Provider and AI measurements remain separate.

## Verification and activation limits

Deterministic tests exercise source precedence, exact ownership, invalid/cutoff
paths, full baseline collection, restart, original clocks and bounded requests.
Research tests use injected search and article transports. They make no live
provider calls. Current credentials, competition coverage, source licenses and
an attributable prospective evaluation still require actual operator evidence.
Production configuration, running workers, public odds flags and deployments are
unchanged by this implementation.
