# 030 Performance API

**Feature:** Transparent performance reporting from locked predictions.

**Depends on:** [014-forecast-evaluation.md](014-forecast-evaluation.md), [027-market-settlement.md](027-market-settlement.md), [028-match-feed-api.md](028-match-feed-api.md), [029-match-detail-api.md](029-match-detail-api.md)

**Source:** [app-write-up.md](../app-write-up.md) §§4, 7, 8, 10–13, 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, repository instructions and shared evaluation/settlement contracts. Implement `GET /api/performance` and its stored-data aggregation service only. Reuse the evaluation math already implemented rather than maintaining separate public formulas.

Accept validated bounded market, EAT fixture-date period, source and model/version filters. Define the cohort explicitly. Count each fixture/market once using its applicable cycle and locked selected pick. Return available AI/fallback, unavailable and void counts; split available outcomes into settled and pending. Separate historical postponed cycles and operational failed/delayed refresh measures from headline fixture counts. Exclude alternative selections and superseded revisions from hit-rate counts, and use only Correct plus Incorrect in its denominator. Label a combined AI/fallback total per family alongside source-specific metrics, counting each family once per fixture; match result and double chance remain separate reported families.

Expose hit rate with denominator/period, full-distribution Brier/log-loss metrics for comparable groups, calibration bands with sample counts and uncertainty, and coverage breakdowns. Use matched fixtures/cutoffs/horizons for comparisons; do not compare unlike markets. Include model/provider versions where known and links to the locked forecast evidence through existing detail contracts. Optional exact-score statistics, if previously approved and implemented, remain separate.

Use the evaluation harness's binary-event scoring for overlapping double-chance alternatives. Never treat them as a normalized categorical distribution or inflate selected-pick counts with alternative outcomes.

Enforce the documented minimum samples and quality gates for public claims. Below-threshold or absent data must produce explicit insufficient-sample/unavailable metrics rather than fabricated zeros, guarantees or calibration claims. Keep launch estimates provisional when evaluation has not established calibration. Preserve precision and deterministic aggregation, and propagate settlement corrections into current metrics with an actual as-of time.

Serve all reads without registration, tokens or authentication cookies. Apply shared schema validation, query limits, safe serialization and error behavior. No request may trigger forecasting, provider fetches or expensive uncontrolled recomputation; use indexed bounded aggregation and reusable snapshots where needed, maintaining freshness/invalidation hooks for the later cache feature.

## Acceptance checks

- Reconcile counts against hand-checked fixtures covering two cycles, superseded sets, mixed sources, pending, void and unavailable families.
- Verify zero denominators, insufficient samples, matched comparisons and score-correction effects.
- Test public filters/bounds and confirm immutable locks exclusively determine scored picks.

## Handoff

Record changed files, reconciliation/math checks and unresolved quality gates in `docs/development-progress.md`; document cohort and metric contracts in `docs/implementation-decisions.md`.
