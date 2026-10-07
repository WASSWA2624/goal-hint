# 047 Prospective shadow qualification

**Feature:** Execute the predefined forecast and capacity qualification gate.

**Depends on:** [014-forecast-evaluation.md](014-forecast-evaluation.md), [025-prediction-refresh-worker.md](025-prediction-refresh-worker.md), [027-market-settlement.md](027-market-settlement.md), [038-methodology-performance.md](038-methodology-performance.md), [046-staging-deployment.md](046-staging-deployment.md).

**Source:** [App specification](../app-write-up.md), sections 5–8, 11, 14 and 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and the frozen evaluation protocol established in prompt 014. Implement/run the qualification workflow against the actual candidate configuration. Use bounded private staging forecasts after provider-rights, budget and pipeline-integrity checks pass, with candidate quality still under evaluation. Keep these forecasts separate from public production output, and use only historical evidence genuinely available at prediction time. Do not reconstruct unavailable news/provider snapshots, fabricate elapsed observations or adjust thresholds after viewing final-test results.

Collect immutable forecasts, evidence cutoffs, source/model versions, horizons and later verified regulation outcomes. Compare AI, fallback and approved simple baselines on matched fixture cohorts. Report hit rates, Brier score/log loss, calibration with counts/uncertainty and coverage, separated by market/source/horizon as required. Include unavailable, pending and void records; select locked forecasts once per applicable fixture/market. Apply predeclared sample sizes and quality/coverage gates, retaining an earlier qualified model if the candidate fails.

Benchmark 100, 500 and 1,000 refresh jobs, then the expected full seven-day slate. Record runtime, AI success, fallback rate, cost per published revision, cutoff misses and the measured feasibility of the provisional 1,000-by-01:00 EAT target. Exercise shared live polling at 15 seconds, date/results at 60 seconds, and normal-condition final-badge latency against the proposed two-minute target. Verify request/cost caps including the US$45 API-Football monthly ceiling and separate operating budgets; synthetic load cannot justify unapproved paid calls.

Use authorized live services when available and label replay/synthetic capacity results separately. If prospective observations or minimum samples are not yet sufficient, produce the runner, accumulated evidence and exact remaining requirements with a pending gate. Never claim qualification simply because the prompt finished. Record any measurement-supported target changes for owner decision before public commitments.

## Acceptance checks

- Reproduce metrics from locked forecast IDs and timestamped evidence without leakage.
- Show pass/fail/pending for every predefined quality/sample/capacity gate.
- Verify full-slate cost accounting, matched baselines and actual-versus-simulated labels.
- Confirm no thresholds, forecasts or evidence timestamps changed to improve results.

## Handoff

Update `docs/development-progress.md` with changed files, evidence locations, executed checks and pending observations/blockers. Record qualification decisions in `docs/implementation-decisions.md`.
