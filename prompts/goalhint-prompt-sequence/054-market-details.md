# 054 — Show supported market forecasts and correctly sourced bookmaker prices

**Phase:** Interface  
**Key prerequisites:** [024 — Reconcile bookmaker and separate pre-match/live market catalogs](024-odds-catalog-mapping.md); [025 — Implement full, independent odds-price ingestion](025-odds-ingestion.md); [026 — Select and label the correct displayed reference odds](026-odds-reference-prices.md); [029 — Separate probability, confidence and evidence eligibility](029-probability-confidence-gates.md); [039 — Evaluate each supported parameterized market](039-market-evaluation.md); [041 — Persist forecasts with immutable pre-match history](041-forecast-version-storage.md); [044 — Publish valid fixtures independently of forecast and odds availability](044-publication-repair.md); [045 — Separate match, freshness, forecast, publication and settlement states](045-status-separation.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Wire the existing match-detail interface to all supported market outputs and their independently joined bookmaker prices.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Required market-detail content

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 342.*

Match details must expose every supported market's pick, probability, confidence and available bookmaker prices. Unsupported markets may show an explanation but no invented percentage.

### Price provenance and availability

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 229–232.*

4. For the displayed reference price: use the configured preferred bookmaker if its exact selection is available and fresh; otherwise the configured fallback order; otherwise the freshest valid exact match, with bookmaker/source ID as a deterministic tie-break. Do not compare different lines or periods as though they were the same selection.
5. Preserve other bookmaker prices for match-detail comparison. Honor an existing user-selected bookmaker; identify when the displayed source is a fallback. Never present another bookmaker's price as the user's chosen bookmaker's price.
6. Reject malformed prices and respect suspension flags. Label stale prices with their timestamp rather than presenting them as current offers.
7. A supported forecast remains visible without a price: **“Odds unavailable.”** A bookmaker offering a price does not prove that GoalHint has enough evidence to forecast that market.

### Stored diagnostics

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 338.*

For each supported market save: fixture ID, market key/parameters, recommended selection, outcome probabilities, confidence/support diagnostics, optional uncertainty interval, explanation/evidence references, engine/model version, evidence hash/cutoff, generation time, forecast type, and status. Join odds separately with source and timestamp. Save unavailable-market reasons as well.

## Scope boundary

Implement match-detail data presentation using the established design. Do not change price selection, probability computation or subscriptions.

## Acceptance checks

- [ ] Expose each supported market pick, probability, confidence and available alternative bookmaker prices.
- [ ] Show source, fallback and freshness correctly; supported forecasts remain visible with Odds unavailable.
- [ ] Explain unsupported markets without fabricated percentages and preserve protected-content access controls.
- [ ] Keep data tied to the correct market parameters, period, line and stored forecast version.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [055 — Test idempotent ingestion, recovery and quota coordination](055-ingestion-resilience-tests.md).
