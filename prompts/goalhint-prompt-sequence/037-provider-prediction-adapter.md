# 037 — Correct the API-Football forecast adapter

**Phase:** Prediction mechanism  
**Key prerequisites:** [005 — Define the shared versioned market registry](005-market-registry.md); [017 — Implement complete fixture-scoped data ingestion](017-fixture-data-imports.md); [029 — Separate probability, confidence and evidence eligibility](029-probability-confidence-gates.md); [036 — Validate, calibrate and version the forecasting models](036-model-calibration.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R1, R4** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Translate retained provider forecast fields into only the supported market outcomes and defensible probabilities they actually describe.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Provider field semantics

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 278.*

For the API adapter, preserve the documented meaning of every field: `win_or_draw` is a flag, not a probability; home/draw/away percentages refer to those outcomes; signed goal/under-over strings may describe thresholds, not expected-goal means. Derive double-chance probability only from compatible outcome probabilities. Advice without a defensible numeric probability can be shown as provider advice, but must not receive a fabricated percentage or enter probability-based ranking.

### Provider fallback eligibility

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 273–274.*

4. If local support fails, use the provider forecast only for outcomes it actually supports and for which a defensible probability is available.
5. If none qualifies, store an explicit abstention reason. Do not invent a prediction to make the catalog look complete.

## Scope boundary

Implement the provider adapter only. Do not fabricate percentages, broaden provider capabilities or change the AI → local → provider priority.

## Acceptance checks

- [ ] Treat win_or_draw as a flag, not a probability; retain home/draw/away meaning and signed goal/under-over threshold semantics.
- [ ] Derive double chance only from compatible outcome probabilities and preserve unsupported-market reasons.
- [ ] Show nonnumeric advice only as provider advice; keep it out of probability-based ranking unless a defensible numeric probability exists.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [038 — Enforce AI → local → provider routing with validated fallback](038-engine-routing.md).
