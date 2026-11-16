# 038 — Enforce AI → local → provider routing with validated fallback

**Phase:** Prediction mechanism  
**Key prerequisites:** [023 — Implement Worker 4: the durable prediction lifecycle](023-prediction-worker.md); [027 — Build one bounded, sourced evidence package per fixture](027-fixture-evidence.md); [029 — Separate probability, confidence and evidence eligibility](029-probability-confidence-gates.md); [031 — Derive goal-market probabilities from a coherent score distribution](031-coherent-score-distribution.md); [032 — Implement dependence-aware period and half models](032-period-and-half-models.md); [033 — Implement evidence-supported player outcome models](033-player-models.md); [034 — Implement separate cards, corners and statistic models](034-statistic-models.md); [035 — Integrate supported contextual effects into model features](035-context-adjustments.md); [036 — Validate, calibrate and version the forecasting models](036-model-calibration.md); [037 — Correct the API-Football forecast adapter](037-provider-prediction-adapter.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Connect the existing engines through a market-family-aware router that validates outputs and preserves valid partial success.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Engine priority and partial-family fallback

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 268–276.*

Use **AI → local engine → API-Football predictions**.

1. Attempt the configured AI engine when available and suitable for the market family.
2. Validate its structured response, evidence grounding, numerical coherence, model provenance, and calibration/quality eligibility.
3. On failure, timeout, missing capability, or invalid/unreliable output, try the local engine for the affected market family.
4. If local support fails, use the provider forecast only for outcomes it actually supports and for which a defensible probability is available.
5. If none qualifies, store an explicit abstention reason. Do not invent a prediction to make the catalog look complete.

Fallback should preserve successful independent market families rather than discard an entire fixture. However, coupled probabilities must come from one coherent distribution or pass reconciliation checks; do not combine contradictory AI/local/API outputs.

### Numerical grounding and AI failure control

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 280–282.*

An AI language model's unsupported percentage is not a validated probability. AI may structure evidence, produce bounded sourced adjustments, explain results, or invoke a validated numerical model. Without a supported numerical basis, it must defer. Label the actual source honestly; local calculations explained by AI remain locally calculated.

Use a **60-second AI-call timeout**, one transient retry, then local fallback. After **five consecutive provider-level AI failures**, open a **10-minute circuit breaker** and use local/API during that period. Log engine transitions and per-market reasons.

## Scope boundary

Implement routing, validation and failure control only. Do not let an unsupported AI percentage override a validated numerical model or trigger duplicate provider ingestion.

## Acceptance checks

- [ ] Try suitable configured AI first, validate structured grounding/coherence/provenance/quality and fall back to local, then supported API forecasts.
- [ ] Keep successful independent market families but reconcile coupled probabilities or obtain them from one coherent distribution.
- [ ] Require a supported numerical basis for AI probabilities; label AI-explained local calculations as locally calculated.
- [ ] Use a named 60-second AI timeout, one transient retry and a 10-minute circuit breaker after five consecutive provider-level AI failures.
- [ ] Log engine transitions and per-market reasons; store explicit abstentions when no engine qualifies.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [039 — Evaluate each supported parameterized market](039-market-evaluation.md).
