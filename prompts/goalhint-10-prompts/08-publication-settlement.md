# 08 — Repair the published match lifecycle

**Step:** 08\
**Key prerequisites:** [01-audit-baseline.md](01-audit-baseline.md); [02-data-contracts.md](02-data-contracts.md); [04-coordinated-workers.md](04-coordinated-workers.md); [05-odds-coverage.md](05-odds-coverage.md); [07-forecast-pipeline.md](07-forecast-pipeline.md)  
**Consolidated source:** Section 7

## Focused task

Repair fixture publication, authoritative prediction settlement, and the operational data used to explain both.

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

Complete the publication and settlement consumers left by 04 and 07. Publish valid in-scope fixtures incrementally whether or not optional data, odds, or a reliable prediction are present. Keep subscription restrictions on protected content intact.

Separate source match status, freshness, forecast availability, publication state, and settlement. Use exact registered market rules and authoritative provider outcomes, including correction handling. Reconcile the baseline fixture discrepancy by actual IDs and exclusion reasons, then supply accurate coverage, worker, quota, mapping, and performance data through existing backend reports and admin read models.

Document metric denominators in the backend definitions and tests. Use the forecast and reference-price policies from 07 and 05.

## Requirements

Section numbers follow the consolidated prompt. Implement the assigned backend scope and use the named workstreams for shared dependencies.

## 7. Repair publication, settlement, and operational reporting

1. **Fixture visibility and prediction availability are separate.** Publish every valid fixture in the intended public scope even when optional data, odds or a reliable forecast are missing. Supply the applicable unavailable or awaiting-data state through the existing data contract and enforce subscription restrictions on protected content.
2. Do not block all publication until all 1,000 fixtures have been predicted. Publish and update incrementally as each fixture/data section becomes ready.
3. Use distinct fields for provider match status, data freshness, forecast availability, publication state, and prediction settlement. “Pending prediction result” is not the same as “upcoming match.”
4. A scheduled kickoff passing must not automatically produce void, cancellation, loss, or completion. Record an awaiting-update state where appropriate while retaining the source status and next check.
5. Settle predictions from authoritative outcomes and exact market rules, including period boundaries, extra-time exclusions, pushes, VAR corrections and player participation conditions. Handle provider corrections idempotently.
6. Keep distinct totals in backend reporting for discovered, stored, public-scope, published, prediction-ready, priced, awaiting-data, and excluded fixtures. Every excluded ID must have a reason. Reconcile the original 334-fixture gap without hardcoding the screenshot's counts.
7. Record in operational telemetry the worker heartbeat, last success/error, queue lag, next run, quota usage/reserve/reset, checkpoint, complete/partial/unavailable sections, odds freshness and market-mapping coverage. Do not claim a complete import when only its first page or fixture list was saved.
8. Audit backend performance definitions and test their denominators. Count fixtures and market-level predictions separately. Calculate the resolved-pick hit rate using resolved picks as the denominator.

## Acceptance checks

- [ ] Public in-scope fixture coverage reconciles independently of missing forecasts/odds, with incremental publication and an explicit reason for every exclusion.
- [ ] Overdue fixtures remain awaiting authoritative updates instead of being incorrectly completed, cancelled, voided, or settled as losses.
- [ ] Settle using exact period, extra-time, push/partial-result, VAR/correction, and participation rules; replay corrections idempotently.
- [ ] Verify fixture totals, worker state, quota/reset/reserve, checkpoints, completeness, mapping coverage, and odds freshness against stored records and provider receipts.
- [ ] Keep resolved-pick performance denominators separate from fixture/multi-market totals and verify that existing authentication and paid-access boundaries still hold.

## Handoff

Return the actual changed files or produced artifacts, commands/checks run and their results, configuration/migration changes, evidence-backed deviations, remaining limitations or blockers, and the inputs needed by the next step. Record them in the project's existing handoff/report location so Step 09 can compile the final completion report. Do not mark planned, blocked, untested, or unobserved work as verified.

**Next:** [09-testing-rollout.md](09-testing-rollout.md).

## Reference notes for the implementing agent

These references support provider mechanics and modeling methods. The scheduling defaults, validation policy, and acceptance criteria above describe the requested implementation. Provider support depends on the available data and account access. Recheck the current documentation and account access during implementation.

- **R1 — API-Football v3 documentation:** endpoint schemas, additional batch parameters, profiles/career endpoints, half statistics and status semantics. `https://www.api-football.com/documentation-v3`

- **R4 — API-Football, “How to Get Started with API-Football: The Complete Beginner's Guide” (2026):** forecasts, endpoint pagination, odds namespaces/retention and refresh behavior. `https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide`

- **User-supplied product reference:** GoalHint screenshots of `/en/matches`, desktop/mobile filters, and `/admin`, dated 14 November 2026. Live source code was not inspected during prompt preparation.
