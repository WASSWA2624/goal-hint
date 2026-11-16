# 032 — Implement dependence-aware period and half models

**Phase:** Prediction mechanism  
**Key prerequisites:** [005 — Define the shared versioned market registry](005-market-registry.md); [017 — Implement complete fixture-scoped data ingestion](017-fixture-data-imports.md); [027 — Build one bounded, sourced evidence package per fixture](027-fixture-evidence.md); [029 — Separate probability, confidence and evidence eligibility](029-probability-confidence-gates.md); [030 — Implement the regularized local result/goal baseline](030-local-goal-model.md); [031 — Derive goal-market probabilities from a coherent score distribution](031-coherent-score-distribution.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Implement supported half/time and related combination probabilities from real period/event evidence.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Period-aware modeling

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 291.*

4. **Half/time markets:** fit period-aware scoring using actual period/event history. Derive half/full-time and combination markets from a joint time/score model or simulation that preserves dependence. Do not simply halve full-time rates or multiply correlated marginal probabilities without validation.

### Relevant market variants

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 309–310, 314–317.*

| Family | Required variants to consider |
|---|---|
| Results | Full-time home/draw/away; supported first-half and second-half results. |
| Double chance | Home/draw, home/away, draw/away for supported periods. |
| BTTS / goal-goal | Yes/no at full time and supported half-specific variants. |
| Correct score/ranges | Full-time and supported half scores; exact totals and registered bands such as 1–2, 1–3 or 1–4. |
| Half relationships | Highest-scoring half including equal; half-time/full-time outcomes; supported scoring-in-both-halves variants. |
| Combined outcomes | Result/double chance with goals, BTTS with totals, and other mapped combinations using their joint probability. |

## Scope boundary

Implement period/half modeling only. Do not introduce a new live-forecast product or imply unsupported period markets are validated.

## Acceptance checks

- [ ] Fit period-aware scoring using actual period/event history.
- [ ] Derive supported half results, half/full-time, highest-scoring half, both-halves and compatible combinations through a joint time/score model or dependence-preserving simulation.
- [ ] Record unsupported variants when history/model capability is insufficient; validate rather than simply halving full-time rates or multiplying correlated marginals.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [033 — Implement evidence-supported player outcome models](033-player-models.md).
