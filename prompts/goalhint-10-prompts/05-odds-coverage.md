# 05 — Complete independent odds coverage

**Step:** 5 of 10  
**Key prerequisites:** [02-data-contracts.md](02-data-contracts.md); [03-shared-ingestion.md](03-shared-ingestion.md); [04-coordinated-workers.md](04-coordinated-workers.md)  
**Original source:** Section 5; catalog reconciliation in Section 6.6

## Focused task

Complete the odds catalog, mapping, price-history, and reference-price pipeline independently of prediction availability.

## Objective and boundaries

Improve the **existing GoalHint Next.js application**, not a replacement application. Implement the following phases in order: audit → data contracts → imports and workers → odds → predictions → publication → interface → testing and rollout.

GoalHint is a **prediction and analysis platform**, not a staking platform. Maximize evidence-supported prediction coverage and prioritize estimated win probability over odds. Do not promise perfect predictions, guaranteed profits, or data the provider does not supply.

Preserve the existing stack, routes, authentication, subscription controls, unrelated features, and established visual design. Inspect the repository before choosing infrastructure or changing schemas. Reuse and repair existing components and workers instead of creating competing implementations. Do not disable paid access as part of this work.

**Implementation defaults:** Operational intervals, retry settings, and layout measurements below are proposed implementation defaults, not claims about existing behavior. Make them named configuration values with these defaults. Provider limits and actual account permissions take precedence. Document any necessary deviation with evidence; do not silently omit requirements.

## Execution protocol

Execute these files in ascending order, 01 through 10. Work on this file's focused workstream and its related checks; do not add unrelated refactors. Reuse the actual repository's existing abstractions and prior handoffs. Implementation steps require working code/configuration and focused checks, not merely proposals.

This package replaces the earlier 61-prompt package. The original numbered source sections below are preserved for traceability; they are not additional prompt files. Section 2 is in 02, Section 6 is split between 06 and 07, and the early shared market contract is in 02. R-numbered references are included in the files that use them. No support folder or separate original-source file is required.

Use mocked/replayed responses before production quota. Keep unfinished new paths gated, preserve existing working behavior, and report missing access/evidence without pretending work was verified. Reference URLs are retained from the supplied prompt, not independently verified by this consolidation; check current documentation and actual account access when implementing.

## Task instructions and scope

Use the shared registry from 02 and the ingestion/worker infrastructure from 03–04. Populate catalogs, explicitly reconcile every market, import every applicable price page, preserve exact selection parameters and sources, and implement deterministic reference-price selection.

Wire the due odds jobs already scheduled by 04 to these completed consumers. Preserve nonselected bookmaker prices for later detail presentation. The UI integration occurs in 09; supply source/fallback/freshness information now. Do not change the model's probability/ranking policy or couple fixture visibility to odds availability.

## Original requirements

The following text retains the supplied requirements and their original section numbers. Implement this file’s assigned scope; references to later consumers are fulfilled by the named later files, not by inventing substitute behavior.

## 5. Make odds coverage complete and independent of predictions

1. Import all available bookmaker and market catalogs. Keep **pre-match and live market ID namespaces separate**; the same numeric ID is not automatically the same market. [R4]
2. Fetch all pages of prices for the required scope without restricting to one bookmaker or one bet type. Normalize each exact combination of fixture, phase, period, market, line, selection, player/team, and bookmaker/source.
3. Store provider timestamps, observation timestamps, availability, and price history without duplicating identical snapshots. A returned live source must not be assigned an invented bookmaker identity.
4. For the displayed reference price: use the configured preferred bookmaker if its exact selection is available and fresh; otherwise the configured fallback order; otherwise the freshest valid exact match, with bookmaker/source ID as a deterministic tie-break. Do not compare different lines or periods as though they were the same selection.
5. Preserve other bookmaker prices for match-detail comparison. Honor an existing user-selected bookmaker; identify when the displayed source is a fallback. Never present another bookmaker's price as the user's chosen bookmaker's price.
6. Reject malformed prices and respect suspension flags. Label stale prices with their timestamp rather than presenting them as current offers.
7. A supported forecast remains visible without a price: **“Odds unavailable.”** A bookmaker offering a price does not prove that GoalHint has enough evidence to forecast that market.
8. An odds-only change updates prices. It must not rerun an odds-independent probability model unless its declared inputs actually include odds.
9. Do not introduce a minimum-odds requirement or force high-odds selections. Do not equate bookmaker implied probability with GoalHint's independently estimated probability.

Reconcile the existing registry with API catalogs. Enumerate every catalog entry and map it explicitly, marking unsupported/unmapped entries with reasons rather than silently dropping them. Do not guess the contents of an unprovided market file.

## Acceptance checks

- [ ] Keep pre-match/live identifiers distinct and account for every catalog entry with a mapping or explicit unsupported/unmapped reason.
- [ ] Ingest all available bookmakers, markets, outcomes, lines, and pages for the required scope; deduplicate identical snapshots without losing corrections or history.
- [ ] Select only exact comparable prices using the preferred bookmaker, configured fallback order, then freshness/source tie-break; honor user choice without mislabeling another source.
- [ ] Reject malformed/suspended offers and expose timestamps for stale values; supported predictions can carry “Odds unavailable.”
- [ ] Verify that odds-only changes do not regenerate odds-independent forecasts and that odds never substitute for independently estimated probability.

## Handoff

Return the actual changed files or produced artifacts, commands/checks run and their results, configuration/migration changes, evidence-backed deviations, remaining limitations or blockers, and the inputs needed by the next step. Record them in the project's existing handoff/report location so 10 can compile the final completion report. Do not mark planned, blocked, untested, or unobserved work as verified.

**Next:** [06-evidence-models.md](06-evidence-models.md).

## Reference notes for the implementing agent

These references support provider mechanics and modeling methods. The application design, scheduling defaults, validation policy, and acceptance criteria above are implementation requirements—not provider guarantees. Recheck the current documentation and account access during implementation.

- **R1 — API-Football v3 documentation:** endpoint schemas, additional batch parameters, profiles/career endpoints, half statistics and status semantics. `https://www.api-football.com/documentation-v3`

- **R4 — API-Football, “How to Get Started with API-Football: The Complete Beginner's Guide” (2026):** forecasts, endpoint pagination, odds namespaces/retention and refresh behavior. `https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide`

- **User-supplied market-vocabulary reference, not a verified complete catalog:** `https://gsb.ug/sportsbook/upcoming`
