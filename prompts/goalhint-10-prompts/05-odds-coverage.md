# 05 — Complete independent odds coverage

**Step:** 05\
**Key prerequisites:** [02-data-contracts.md](02-data-contracts.md); [03-shared-ingestion.md](03-shared-ingestion.md); [04-coordinated-workers.md](04-coordinated-workers.md)  
**Consolidated source:** Section 5; catalog reconciliation in Section 6.6

## Focused task

Complete the odds catalog, mapping, price-history, and reference-price pipeline independently of prediction availability.

## Objective and boundaries

Improve the backend of the existing GoalHint Next.js application. Implement these phases in order: audit → data contracts → imports and workers → odds → predictions → publication and settlement → testing and rollout.

GoalHint is a **prediction and analysis platform**, not a staking platform. Maximize evidence-supported prediction coverage and prioritize estimated win probability over odds. Do not promise perfect predictions, guaranteed profits, or data the provider does not supply.

Preserve the existing stack, routes, authentication, subscription controls, and unrelated features. Inspect the repository before choosing infrastructure or changing schemas. Reuse existing backend services, contracts, and workers. Keep paid-access enforcement in place.

**UI boundary:** Treat the current desktop and mobile interfaces as fixed. Preserve their components, layouts, styles, copy, labels, controls, and interactions. Limit screen work to read-only observation and regression checks of existing behavior. Use existing server-side contracts to supply improved data to current consumers.

**Implementation defaults:** Operational intervals and retry settings below are proposed implementation defaults, not claims about existing behavior. Make them named configuration values with these defaults. Provider limits and actual account permissions take precedence. Document any necessary deviation with evidence; do not silently omit requirements.

## Execution protocol

Execute steps 01–09 in order. Work on this file's focused workstream and its related checks; do not add unrelated refactors. Reuse the actual repository's existing abstractions and prior handoffs. Implementation steps require working code/configuration and focused checks, not merely proposals.

This package replaces the earlier 61-prompt package. The numbered requirements below correspond to sections in the consolidated prompt. Section 2 is in 02, Section 6 is split between 06 and 07, and the early shared market contract is in 02. R-numbered references are included in the files that use them. No support folder or separate original-source file is required.

Use mocked/replayed responses before production quota. Keep unfinished new paths gated, preserve existing working behavior, and report missing access/evidence without pretending work was verified. Reference URLs are retained from the supplied prompt, not independently verified by this consolidation; check current documentation and actual account access when implementing.

## Task instructions and scope

Use the shared registry from 02 and the ingestion/worker infrastructure from 03–04. Populate catalogs, explicitly reconcile every market, import every applicable price page, preserve exact selection parameters and sources, and implement deterministic reference-price selection.

Wire the due odds jobs already scheduled by 04 to these completed consumers. Retain all valid bookmaker prices and make source, fallback, and freshness metadata available through the existing odds read contract. Preserve the forecast model and ranking policy, including how eligible odds can break a tie. Keep fixture publication independent of price availability.

## Requirements

Section numbers follow the consolidated prompt. Implement the assigned backend scope and use the named workstreams for shared dependencies.

## 5. Make odds coverage complete and independent of predictions

1. Import all available bookmaker and market catalogs. Keep **pre-match and live market ID namespaces separate**; the same numeric ID is not automatically the same market. [R4]
2. Fetch all pages of prices for the required scope without restricting to one bookmaker or one bet type. Normalize each exact combination of fixture, phase, period, market, line, selection, player/team, and bookmaker/source.
3. Store provider timestamps, observation timestamps, availability, and price history without duplicating identical snapshots. A returned live source must not be assigned an invented bookmaker identity.
4. For the server-side reference price, use the configured preferred bookmaker if its exact selection is available and fresh; otherwise the configured fallback order; otherwise the freshest valid exact match, with bookmaker/source ID as a deterministic tie-break. Do not compare different lines or periods as though they were the same selection.
5. Preserve prices from other bookmakers. Honor the bookmaker ID supplied by an existing user selection. Record the actual source ID and fallback status separately from the requested bookmaker ID.
6. Reject malformed prices and respect suspension flags. Retain timestamps for stale prices and exclude them from current-offer selection.
7. Keep supported forecasts eligible when a price is unavailable and represent the missing price explicitly in the existing data contract. Apply the forecast evidence gate independently of bookmaker coverage.
8. An odds-only change updates prices. It must not rerun an odds-independent probability model unless its declared inputs actually include odds.
9. Do not introduce a minimum-odds requirement or force high-odds selections. Do not equate bookmaker implied probability with GoalHint's independently estimated probability.

Keep the existing server-side odds access rules. Return public prices only where provider display rights have been verified for the source and public odds are enabled. Preserve viewer entitlement checks for protected prices.

Reconcile the existing registry with API catalogs. Enumerate every catalog entry and map it explicitly, marking unsupported/unmapped entries with reasons rather than silently dropping them. Do not guess the contents of an unprovided market file.

## Acceptance checks

- [ ] Keep pre-match/live identifiers distinct and account for every catalog entry with a mapping or explicit unsupported/unmapped reason.
- [ ] Ingest all available bookmakers, markets, outcomes, lines, and pages for the required scope; deduplicate identical snapshots without losing corrections or history.
- [ ] Select only exact comparable prices using the preferred bookmaker, configured fallback order, then freshness/source tie-break; preserve the requested bookmaker, actual source, and fallback status independently.
- [ ] Reject malformed or suspended offers, retain timestamps for stale values, and keep supported predictions eligible with an unavailable price.
- [ ] Verify that odds-only changes do not regenerate odds-independent forecasts and that odds never substitute for independently estimated probability.

## Handoff

Return the actual changed files or produced artifacts, commands/checks run and their results, configuration/migration changes, evidence-backed deviations, remaining limitations or blockers, and the inputs needed by the next step. Record them in the project's existing handoff/report location so Step 09 can compile the final completion report. Do not mark planned, blocked, untested, or unobserved work as verified.

**Next:** [06-evidence-models.md](06-evidence-models.md).

## Reference notes for the implementing agent

These references support provider mechanics and modeling methods. The scheduling defaults, validation policy, and acceptance criteria above describe the requested implementation. Provider support depends on the available data and account access. Recheck the current documentation and account access during implementation.

- **R1 — API-Football v3 documentation:** endpoint schemas, additional batch parameters, profiles/career endpoints, half statistics and status semantics. `https://www.api-football.com/documentation-v3`

- **R4 — API-Football, “How to Get Started with API-Football: The Complete Beginner's Guide” (2026):** forecasts, endpoint pagination, odds namespaces/retention and refresh behavior. `https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide`

- **User-supplied market-vocabulary reference, not a verified complete catalog:** `https://gsb.ug/sportsbook/upcoming`
