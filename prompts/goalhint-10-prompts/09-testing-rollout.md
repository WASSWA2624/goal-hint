# 09 — Validate and roll out the completed improvements

**Step:** 09\
**Key prerequisites:** [01-audit-baseline.md](01-audit-baseline.md); [02-data-contracts.md](02-data-contracts.md); [03-shared-ingestion.md](03-shared-ingestion.md); [04-coordinated-workers.md](04-coordinated-workers.md); [05-odds-coverage.md](05-odds-coverage.md); [06-evidence-models.md](06-evidence-models.md); [07-forecast-pipeline.md](07-forecast-pipeline.md); [08-publication-settlement.md](08-publication-settlement.md)\
**Consolidated source:** Section 8

## Focused task

Verify the entire implementation against the backend acceptance criteria and existing behavior, measure capacity and forecasting evidence, and complete the reversible rollout and handoff.

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

Consolidate and extend the focused checks already performed in 01–08. Run the backend acceptance cases and existing behavior regression checks below, using mocked or replayed provider responses before consuming production quota. Verify that every applicable endpoint, source requirement, worker responsibility, market mapping, and deferred integration has a documented completed state or an explicit evidence-backed limitation.

Measure daily/minute demand from actual fixture volume and account limits. Distinguish passing code tests from measured forecasting quality, successful deployment, and observed live behavior. An unsupported claim of better accuracy is not an acceptance result.

Prepare and, when authorized and accessible, execute the staged rollout with backups, reversible migrations, flags, representative fixtures, and the first hourly/backfill-resume observations. When production access, permissions, or required evidence is unavailable, provide the exact remaining commands/checks and mark them unperformed; never claim rollout or live-site verification has occurred. Finish with the source's complete evidence-backed completion report.

## Requirements

Section numbers follow the consolidated prompt. Implement the assigned backend scope and use the named workstreams for shared dependencies.

## 8. Tests, acceptance criteria, and rollout

Use automated backend tests and regression checks of existing behavior to cover at least:

1. Replaying the same response/job does not create duplicate fixtures, events, odds, jobs or predictions.
2. An authoritative correction updates records and settlement; an older in-flight response cannot overwrite newer state.
3. Fixture batches split correctly at **20/21 IDs**; an odds page size of 10 is not confused with the fixture batch limit.
4. All supported paginated endpoints continue to their last page; partial-page failures resume without repeating committed pages.
5. Shared fixture, player, league and team dependencies are fetched once per required freshness scope, not once per consumer.
6. A crash before/after response persistence and during normalization/checkpointing recovers without skipping work or corrupting completion status.
7. Minute-rate limits, daily exhaustion, HTTP-200 API errors and permission errors cause the correct pause/retry/alert behavior.
8. Today's and live jobs retain quota priority; backfill pauses and automatically resumes at the correct account reset.
9. An overdue fixture remains unresolved, not falsely cancelled; it continues receiving checks after midnight.
10. Public fixture coverage reconciles independently of missing predictions or odds; no arbitrary fixture-count cap remains.
11. Missing head-to-head data can use valid indirect evidence; a wholly unsupported market abstains with a reason.
12. A common-opponent chain and a player transfer affect estimates without becoming guaranteed conclusions or double-counted evidence.
13. AI failure/invalid output falls back to local, then API only for supported outputs; partial success is retained and source metadata remains accurate.
14. Outcome-sum, double-chance, threshold, BTTS, joint-event, score-tail and push-settlement invariants hold.
15. A supported prediction remains available in the read service without odds, and a fallback price retains its actual bookmaker ID.
16. New meaningful evidence triggers one fresh forecast; unchanged data and ordinary odds-only updates do not trigger unnecessary AI runs.
17. A queue of at least **1,000 fixtures** saves progress fixture by fixture, survives interruption, and does not stop after a subset or one bad fixture.
18. Pre-match results are evaluated against forecasts actually issued beforehand; historical reconstruction and live forecasts are not counted as pre-match wins.
19. Existing authentication, subscriptions, filters, pagination, match details, slips and unrelated routes keep working.

Run tests with mocked/replayed provider responses before spending production quota. Measure proposed daily/minute request demand using actual fixture volumes and the configured plan. Report infeasible freshness targets instead of silently exhausting quota.

Deploy with reversible migrations, backups, feature flags and a staged rollout. Validate representative live, upcoming, completed, sparse-data and odds-missing fixtures before enabling globally. Observe the first hourly cycle and backfill checkpoint/resume cycle.

**Completion report:** provide changed files, migrations/configuration, actual worker schedules, batching matrix, coverage/mapping manifest, explained publication exclusions, before/after quota estimates, test results, measured forecasting validation, remaining provider limitations, and exact rollback/run commands. Do not claim live-site fixes or improved forecasting accuracy without verification.

---

## Acceptance checks

- [ ] Record results for the listed backend and regression checks, including crash recovery, corrections, batching/pages, quota failure paths, and the interrupted queue of at least 1,000 fixtures.
- [ ] Verify evidence/fallback/probability/history integrity, independent publication/odds behavior, accurate bookmaker source IDs, and no future-data leakage or post-result pre-match wins.
- [ ] Check that existing authentication, subscriptions, filters, pagination, match details, slips, and unrelated routes still work.
- [ ] Produce actual capacity estimates, forecasting validation results, limitations, and any verified deviations from named defaults.
- [ ] Verify backups/rollback, reversible migrations, flags, representative staged fixtures, and first hourly/backfill cycles where authorized; clearly distinguish unperformed operations.
- [ ] Deliver changed files, migrations/configuration, actual schedules, batching matrix, coverage/mapping manifest, publication exclusions, before/after quota estimates, test results, model validation, provider limitations, and exact run/rollback commands.

## Handoff

Record the final completion report in the project's existing handoff/report location. Include the actual changed files or artifacts, commands and check results, configuration and migration changes, evidence-backed deviations, and remaining limitations or blockers. Report verification status for work that remains planned, blocked, untested, or unobserved.

**End of sequence:** all nine workstreams must be reconciled in the final report. Keep unverified production operations and provider/data limitations explicitly open rather than asserting complete live-site success.

## Reference notes for the implementing agent

These references support provider mechanics and modeling methods. The scheduling defaults, validation policy, and acceptance criteria above describe the requested implementation. Provider support depends on the available data and account access. Recheck the current documentation and account access during implementation.

- **R1 — API-Football v3 documentation:** endpoint schemas, additional batch parameters, profiles/career endpoints, half statistics and status semantics. `https://www.api-football.com/documentation-v3`

- **R4 — API-Football, “How to Get Started with API-Football: The Complete Beginner's Guide” (2026):** forecasts, endpoint pagination, odds namespaces/retention and refresh behavior. `https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide`

- **R8 — API-Football terms, subscription-specific quota-reset sections:** verify the actual subscription channel. `https://www.api-football.com/terms`

- **R9 — Dixon and Coles (1997), “Modelling Association Football Scores and Inefficiencies in the Football Betting Market”:** a baseline modeling reference, not evidence of GoalHint's performance. `https://academic.oup.com/jrsssc/article-abstract/46/2/265/6990546`

- **R10 — scikit-learn, probability calibration documentation:** reliability and probability evaluation. `https://scikit-learn.org/stable/modules/calibration.html`

- **R11 — scikit-learn, TimeSeriesSplit documentation:** avoiding future-to-past validation leakage; implement chronological football-data splits appropriate to the dataset rather than assuming equally spaced fixtures. `https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit`
