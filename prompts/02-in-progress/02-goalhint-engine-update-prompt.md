# GoalHint Prediction Engine Improvement Prompt

## Objective and scope

Improve the **existing GoalHint prediction engine** in the current repository. Prioritize reliable probability estimates, intelligent selection across supported markets, and wider market coverage where the available evidence supports it.

Inspect and improve what is already implemented. Preserve working features, fix defects, and add the missing engine capabilities described below. Do not rebuild the app or assume that an earlier write-up accurately describes the current code.

Deliver this through the project's normal app-update process. **Do not add a dedicated accuracy/performance-tracking system, old-versus-new parallel engines, shadow testing, a comparison dashboard, or a statistical promotion gate.** Do not make release depend on collecting future match results. Retain ordinary technical validation.

## 1. Inspect the actual implementation first

Locate the canonical document titled **“Goal Hint prediction engine”**, then trace the actual code, configuration, database models, provider adapters, jobs, prediction calculations, market registry, selection logic, and downstream consumers.

Establish which capabilities work, which are incomplete, and which exist only in documentation. In particular, verify whether team statistics, player identities, availability and lineups actually influence probabilities or merely appear in stored data or explanations. Check existing historical-learning and calibration code before adding equivalents.

Use the repository's existing architecture, dependencies and conventions. Make focused backend changes. Preserve the UI, routes, public API compatibility, authentication, subscriptions, access rules, and unrelated functionality. Do not add controls, badges, pages or explanatory UI.

## 2. Strengthen source data and historical learning

Reuse the authorized API-Football integration and existing database-backed data flow. Verify actual endpoint entitlement, competition coverage, source timestamps and historical completeness rather than assuming a provider field is available.

- Maintain canonical fixture, occurrence, team, competition and season identities. Respect home/away orientation, regulation periods, postponements and corrected results.
- Use verified historical results, including fixtures GoalHint did not previously predict. Missing scores are unknown, not zero.
- Weight recent, relevant evidence appropriately while retaining enough history for stable estimates. Inspect existing lookbacks, decay rates and minimum-support rules; justify changes from actual data and code.
- Consider league and season scoring patterns, home advantage, opponent strength, team attack/defence, recent form, rest and fixture congestion.
- Use head-to-head results as supporting evidence. Reduce their influence when the sample is small or squads and managers have changed substantially.
- Handle promoted teams, new seasons and sparse leagues through supported pooled estimates or explicit unavailability. Do not transfer league strength blindly.
- Reconstruct historical market outcomes only from the statistics they require. A verified 2–1 regulation score supports home win, both teams to score and over 2.5 goals; it supplies no evidence about corners or cards.
- Learn conditional market patterns from comparable situations. Do not equate a raw historical success rate with a calibrated forecast, or count the same information twice as independent evidence.

Preserve explicit missingness and distinguish observed facts from model estimates. Fit historical features using information available before the prediction time; exclude later results, later lineups and hindsight corrections from simulated pre-match inputs.

## 3. Improve the probability model

Inspect and reuse the existing statistical engine, including any Poisson and Dixon–Coles implementations. Improve the current model coherently instead of attaching arbitrary percentage bonuses to its outputs.

- Fit team strengths, league effects, time weighting and supported contextual effects from suitable historical data. Use regularization to limit unstable estimates from small samples.
- Where completing or using Dixon–Coles, fit its low-score correction from appropriate data, apply it to the joint score distribution, and enforce valid parameters and nonnegative, normalized probabilities. Do not enable an unfinished experiment merely because its code exists.
- Derive supported full-time score markets from a coherent distribution: match result, double chance, goal totals, team totals, both teams to score, goal ranges, exact scores and applicable handicaps.
- Keep related markets mathematically consistent. Handle tail probability, numeric stability, pushes, half-wins and half-losses correctly.
- Strengthen existing calibration where suitable historical data exist. Separate fitting, calibration and held-out data in time. Preserve market consistency after calibration.
- Keep **event probability** separate from **confidence in the evidence**. Limited evidence must not trigger an arbitrary reduction of a supported probability; insufficient evidence should produce the existing unavailable/no-pick state.
- Use confidence labels only according to their actual definitions. Never label an estimate calibrated merely because the model returned a number.

The calibration aim is that predictions around a stated probability succeed at approximately that rate across sufficiently many comparable cases. It is not a guarantee for an individual match or a fixed set of 100 matches. Do not promise a particular win rate or profit.

## 4. Incorporate relevant match context

For each contextual input, verify that the source exists, is reliable, and was available before the applicable cutoff. Connect supported inputs to the model's calculations.

- **Players and availability:** use verified injuries, suspensions, expected minutes, player contribution and replacement information where available. Distinguish confirmed absence, doubt and unknown status.
- **Lineups:** distinguish predicted from confirmed starting teams. Use actual player identities, lineup changes and supported formation information without inventing tactical effects.
- **Changing team conditions:** consider verified manager changes, transfers and major squad changes where the data support a meaningful adjustment.
- **Additional statistics:** use xG, shots or other relevant statistics only when the provider actually supplies suitable, consistent data. Do not invent xG from goals.
- **Optional external context:** use weather, pitch or travel information only through already authorized, reliable data sources. Do not add a paid service to fill a missing field.

Avoid fixed rules such as “one missing striker reduces the probability by ten points.” Reuse or fit defensible relationships and avoid double-counting effects already represented in team strength or recent form. Where an input is absent, retain a supported model path or withhold the affected forecast.

## 5. Expand markets and select intelligently

Assess the existing market registry and improve support for markets the model and source data can actually represent. Preserve exact market identity, selection, period, line and settlement rules.

Full-time score models may support score-derived markets. Half-time, corners, cards, player and event markets require their own relevant data and appropriate modeling; do not infer them from an unrelated full-time goal distribution.

For each fixture:

1. Generate the defensible probabilities for all supported eligible markets.
2. Assess evidence quality, freshness, relevance and uncertainty for each option.
3. Within existing eligibility and pricing requirements, prioritize the selection with the **highest reliably supported chance of success**.
4. Treat odds and expected value as additional decision inputs; do not prefer a less reliable pick merely because its odds are larger.
5. Return the existing no-pick/unavailable outcome when no option has adequate support. Do not manufacture a confident choice to fill a fixture or quota.

Keep selection deterministic for unchanged inputs. Verify that any quoted odds belong to the exact fixture, market, selection, line, period and bookmaker. Respect freshness and source rights. Keep payout-aware expected-value calculations correct where used; missing odds must not be fabricated. Odds movement can trigger a recheck, but is not proof of an injury or another specific event.

## 6. Preserve refresh rules and prediction history

Use existing jobs and lifecycle services for pre-match updates. Verify the actual configured cutoff, including the documented normal cutoff five minutes before kickoff, and preserve earlier closure when actual play is confirmed.

- Recalculate an eligible fixture when materially new, verified information arrives before its cutoff—for example, confirmed lineups or an important availability correction.
- Deduplicate identical observations and refresh requests. Repeated unchanged input must not create needless provider calls or prediction revisions.
- Preserve the distinction between model-evidence changes and odds-only changes. Skip probability recomputation for quote-only changes when odds are not model inputs; otherwise recompute through the existing supported model path without unnecessary retraining.
- Keep original records and create an allowed new revision rather than overwriting an earlier prediction.
- Let the eligible current fixture projection advance before cutoff while preserving the exact revisions and prices attached to saved or published slips.
- Keep locked predictions, settled records and historical receipts intact. Later information must not rewrite what was originally offered.
- Respect rescheduled fixture occurrences, early starts, cancelled matches and existing settlement-correction rules.

These requirements protect existing prediction and slip behavior; do not add a separate tracking subsystem.

## 7. Keep Matches, Best Slips and Builder compatible

Apply the engine improvements through existing backend contracts so Matches, Match Details, Best Slips and Builder consume consistent outputs. Preserve their existing distinctions, filters, odds bands, access rules and settlement behavior.

For slip calculations, distinguish individual-leg probability, average leg probability, combined odds and the probability that every leg wins. Never present an arithmetic average as the full slip's win probability. Use a product only where the independence assumption is justified; do not invent a correlation adjustment or a combined probability when support is insufficient. Preserve any existing unavailable/null representation.

Improve selection within established constraints, prioritizing reliable combined outcomes and avoiding unnecessary legs. Preserve original saved selections, probabilities, quotes and revision references when subsequent forecasts change.

## 8. Maintain efficient and reliable operations

Keep provider ingestion in authorized backend workers and serve public reads from the existing database/cache path. Reuse quota controls, request coalescing, caching, retry limits, job leases and idempotency safeguards.

Focus refresh work on material changes and relevant match windows. Avoid repeated backfills, per-page provider calls, duplicate jobs and unnecessary model recomputation. Respect existing local-day scheduling and provider-quota reset boundaries.

Handle stale, missing or conflicting data truthfully. Preserve normal operational diagnostics, access controls and settlement processing without introducing new accuracy analytics. Keep secrets private and migrations compatible with the existing application.

## 9. Verify the implementation and update documentation

Run the repository's relevant type checks, lint/build checks and focused tests. Cover probability bounds and normalization, related-market consistency, missing data, exact odds linkage, settlement grades, time leakage, duplicate refreshes, cutoff handling and immutable saved slips. Use existing integration-test facilities where applicable.

Existing historical checks may be reused during development, especially when fitting or calibration changes. Keep them bounded to the implementation work; do not create ongoing performance reporting or require a live comparison period.

After implementing and checking the changes, update the **existing canonical prediction-engine documentation** to match the actual code. Include:

- Data sources, available coverage, timestamps, missing-data handling and refresh behavior.
- Model calculations, fitted settings, calibration and confidence definitions.
- Supported markets, selection rules, quote handling and slip-probability semantics.
- Reforecast triggers, cutoff behavior and preservation of historical records.
- Changed files, relevant test commands and actual results, configuration or migration steps, and remaining limitations.

Finish with a concise implementation summary: what already worked, what changed, what was tested, what remains blocked by missing data or access, and the documentation path updated. Distinguish implemented code from verified deployment. Do not claim measured accuracy gains or completed work without supporting evidence.

**Acceptance:** targeted improvements to the existing backend engine, broader defensible market coverage, accuracy-first selection, truthful probabilities, preserved app behavior and historical records, normal technical verification, and documentation that matches the delivered implementation.

