# 014 Chronological forecast evaluation

**Feature:** Evaluate predictor quality and calibration with reproducible, leakage-safe trials.

**Depends on:** [005 Regulation-time market domain](005-market-domain.md), [012 Primary AI predictor](012-ai-predictor.md), [013 Validated provider fallback](013-provider-fallback.md).

**Source:** [App specification](../app-write-up.md), sections 7–8 and 14–15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, model registry and provider-trial evidence. Implement an internal reproducible evaluation harness and report format for the selected AI configuration, provider fallback and simple team-strength/league-frequency baselines. Reuse market validators and rule versions rather than creating different evaluation semantics. This is the data/model trial; full prospective shadow operation is a later prompt.

Resolve and record chronological training, validation, calibration and untouched final-test periods; fixture/horizon cohorts; minimum sample sizes; baseline definitions; quality/coverage gates; and minimum evidence required for public claims. Freeze thresholds before the final test. Do not choose them after seeing favorable outcomes or invent fixed accuracy promises.

Accept datasets with verifiable evidence availability at each prediction cutoff, model/source version and regulation-time result provenance. Prevent future scores, later news and revised provider forecasts from leaking into earlier predictions. Without trustworthy historical source/news snapshots, evaluate reconstructable baselines and mark AI/provider historical comparisons unavailable; produce a concrete prospective shadow plan instead of hindsight forecasts presented as valid evaluation.

Compute selected-pick hit rates with counts/periods, full-distribution Brier score and log loss on like markets, calibration bands with counts/uncertainty and coverage/source breakdowns. Compare candidates on identical fixtures, evidence cutoffs and forecast horizons; report source-specific AI and fallback results and a labeled combined total without counting alternatives as extra predictions. Missing forecasts and void results remain visible. Keep exact-score results separate when approved.

Score double-chance alternatives as overlapping binary events with a documented aggregation method, not as a three-outcome categorical distribution. Do not normalize them to sum to one or count their alternatives as additional headline picks.

Version all dataset selections, configuration and calibration artifacts. A failed candidate gate retains the previous approved model; where none exists, retain provisional/unapproved status and record the launch blocker. Preserve independent final-test results and distinguish measured evidence from estimates. Use existing cost controls for any approved live trial calls; no automatic model promotion or public calibration claim follows from harness execution.

## Acceptance checks

- Deterministic known-result datasets verify metrics, cohort matching, missing/void denominators and probability-band counts.
- Leakage checks reject post-cutoff evidence, overlapping chronological splits and unsupported historical reconstructions.
- Reports expose sample limitations, model/source versions, horizons and passed/failed/pending gates.
- Re-running a frozen evaluation reproduces its result without changing thresholds or silently replacing datasets.

## Handoff

Record changed files, dataset/report paths, actual evaluation results and remaining shadow requirements in `docs/development-progress.md`. Update `docs/implementation-decisions.md` with approved gates and model status; external evidence that is absent remains pending.
