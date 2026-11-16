# 026 — Select and label the correct displayed reference odds

**Phase:** Odds  
**Key prerequisites:** [005 — Define the shared versioned market registry](005-market-registry.md); [024 — Reconcile bookmaker and separate pre-match/live market catalogs](024-odds-catalog-mapping.md); [025 — Implement full, independent odds-price ingestion](025-odds-ingestion.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Implement deterministic exact-selection reference-price resolution while preserving all alternative bookmaker prices.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Reference-price and no-price rules

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 229–234.*

4. For the displayed reference price: use the configured preferred bookmaker if its exact selection is available and fresh; otherwise the configured fallback order; otherwise the freshest valid exact match, with bookmaker/source ID as a deterministic tie-break. Do not compare different lines or periods as though they were the same selection.
5. Preserve other bookmaker prices for match-detail comparison. Honor an existing user-selected bookmaker; identify when the displayed source is a fallback. Never present another bookmaker's price as the user's chosen bookmaker's price.
6. Reject malformed prices and respect suspension flags. Label stale prices with their timestamp rather than presenting them as current offers.
7. A supported forecast remains visible without a price: **“Odds unavailable.”** A bookmaker offering a price does not prove that GoalHint has enough evidence to forecast that market.
8. An odds-only change updates prices. It must not rerun an odds-independent probability model unless its declared inputs actually include odds.
9. Do not introduce a minimum-odds requirement or force high-odds selections. Do not equate bookmaker implied probability with GoalHint's independently estimated probability.

## Scope boundary

Implement reference-price resolution and its data contract, not match-card ranking or a UI redesign. Preserve other prices for task 054.

## Acceptance checks

- [ ] Use a fresh exact preferred-bookmaker selection, then configured fallbacks, then the freshest valid exact match with stable source-ID tie-breaking.
- [ ] Honor a user-selected bookmaker, identify fallback sources and never compare different periods/lines as equivalent.
- [ ] Label stale timestamps and unavailable prices, retaining supported forecasts without a price.
- [ ] Keep probability independent of displayed price unless odds are declared model inputs; introduce no minimum-odds rule.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [027 — Build one bounded, sourced evidence package per fixture](027-fixture-evidence.md).
