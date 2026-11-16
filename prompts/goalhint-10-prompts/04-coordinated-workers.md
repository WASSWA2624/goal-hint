# 04 — Implement the coordinated worker lifecycle

**Step:** 4 of 10  
**Key prerequisites:** [02-data-contracts.md](02-data-contracts.md); [03-shared-ingestion.md](03-shared-ingestion.md)  
**Original source:** Section 4

## Focused task

Wire all four logical workers to the same ingestion/job infrastructure so data refresh, reconciliation, backfill, and forecast orchestration cooperate without duplicate work.

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

Implement the four related responsibilities as one coordinated background-processing system, not four independent infrastructure stacks. Reuse the handlers, receipts, cache, leases, quota scheduler, and ledger from 02–03.

Build the live/current-day/backfill flows and the durable prediction orchestration interface now. The source's Section 2 checklist is contained in 02; its detailed Section 6 decision logic is implemented in 06–07. Reuse existing working engine/storage interfaces while developing the prediction worker; only mocks may supply test outputs. Complete odds consumers in 05, final prediction consumers in 07, and publication/settlement consumers in 08.

An unfinished downstream consumer must remain explicitly gated and tracked for its owning step, not silently treated as complete or replaced with fake data. Keep existing working paths available. No global enablement of new paths occurs before 10's validation and approved rollout.

## Original requirements

The following text retains the supplied requirements and their original section numbers. Implement this file’s assigned scope; references to later consumers are fulfilled by the named later files, not by inventing substitute behavior.

## 4. Implement four coordinated workers

These are four **logical responsibilities**, not a requirement for four separate servers. Reuse the existing queue/runtime where appropriate.

### 4.1 Worker 1 — Live match updates

**Purpose:** keep match facts current, independently of prediction generation.

**Default schedule:** every **60 seconds** while matches are live or scheduled to start within 15 minutes; otherwise perform live discovery every **5 minutes**. Quota rules may degrade this explicitly.

1. Retrieve `/fixtures?live=all`; update all returned fixtures, including previously unknown ones. Reuse any events already included.
2. Refresh due enriched live-fixture details every **120 seconds**, batching at most **20 fixture IDs** per request. Store the full response. Fetch separate subresources only for missing supported data, including required half statistics.
3. Capture available in-play odds every **60 seconds**, using the broadest documented useful scope and preserving all returned markets. Avoid redundant per-fixture requests when a broad response already covers them.
4. Starting **90 minutes before kickoff**, check missing lineups every **15 minutes**, preferably through due enriched batches. Stop redundant lineup-only polling once confirmed data has been captured; continue ingesting authoritative changes from normal fixture refreshes.
5. When a match disappears from the live feed, request its current fixture state. **Disappearance is not proof of full time.** Handle halftime, interruption, suspension, extra time, penalties, postponement, abandonment, and final states explicitly.
6. After an authoritative final state, save results and enqueue settlement. Schedule final-detail reconciliation after **15 minutes** and **24 hours** to capture delayed data/corrections, then archive complete records. Still-missing sections remain tracked separately.
7. Never infer that a match is finished merely from kickoff plus 90 minutes. Never manufacture seconds when the provider supplies only elapsed minutes.

### 4.2 Worker 2 — Hourly current-day refresh and reconciliation

**Default schedule:** once every hour at minute **00**, with a catch-up run after downtime. A concurrent run must be coalesced rather than overlapped.

1. Discover every accessible fixture in today's `Africa/Kampala` date window. Use broad date discovery, not just fixtures already known to the app. Reconcile returned IDs against storage and public listing.
2. Ensure all applicable checklist sections have jobs. Fetch missing or stale sections; reuse still-fresh shared entities. Do not require every optional field before making a fixture visible or a supported prediction possible.
3. Batch due enriched fixtures in groups of **20**. Share today's fetch receipts with the live and backfill workers.
4. Check current team/player/league context, provider predictions, and odds using the freshness policy below. An hourly coordinator does **not** mean refetching static catalogs every hour.
5. Revisit every unresolved fixture whose scheduled kickoff has passed, including fixtures from earlier dates. Maintain a durable unresolved queue independent of “today.”
6. Retry unresolved results **hourly for the first 48 hours**, then **daily**; flag them for investigation after 48 hours without inventing a result or cancellation. A provider-verified unavailability decision may close a specific missing-data task, but must retain its reason.
7. Publish changed data, invalidate affected application caches, and enqueue only affected predictions or settlements.

**Default freshness policy for active scopes:**

| Resource | Default refresh/check |
|---|---|
| Today's fixture discovery; unresolved recent fixtures; active standings | 1 hour |
| Provider forecasts for eligible fixtures | Initial capture; then 1 hour while relevant and permitted |
| Pre-match odds | Initial capture; then 3 hours |
| Injuries | Initial capture; then 4 hours |
| Team season statistics | Initial capture; then 12 hours |
| Active league coverage, teams, coaches, squads, transfers, catalogs and rankings | Missing immediately; otherwise 24 hours |
| Player season statistics | Missing immediately; otherwise 24 hours for active scopes |
| Player profiles/career-team lists, trophies and sidelined history | Missing immediately; otherwise 7 days; targeted refresh after relevant detected changes |
| Timezone catalog | Bootstrap and explicit invalidation |
| Archived, finalized historical records | No routine full replay; exceptions below |

These are application defaults. Check documented provider freshness and coverage; fetching more often cannot create upstream updates. Reuse a newer shared response rather than issuing another call. [R2, R4]

### 4.3 Worker 3 — Continuous historical backfill

**Purpose:** build the most complete database the account and provider history allow, without repeatedly downloading completed work.

1. On first initialization, complete today's **currently obtainable** missing data, then traverse **yesterday, the day before, and earlier dates**. Capture a fixed work manifest so newly arriving live data does not prevent historical progress forever.
2. For each date, discover fixtures and fill every applicable dataset in Section 2. Enrich already-stored fixtures rather than importing duplicates. Shared entities are fetched once per actual scope/freshness window, not once per fixture.
3. Also traverse all accessible competition-seasons and entity catalogs, including player-profile pages. A date-only fixture loop must not leave non-date-based datasets unvisited. Prioritize today's dependencies, then newest history, then remaining catalog work.
4. Discover historical boundaries from available league seasons and account access. Do not stop at an arbitrary 30/90-day window, scan empty dates indefinitely, or repeatedly query expired odds history.
5. Persist **date, league/season where relevant, endpoint, parameters, page, batch IDs, item/section completion, stored-response reference, retry state and next action**. A date alone is an insufficient checkpoint.
6. On restart, resume the **exact unfinished task**. Skip successfully persisted pages/batches and fully completed historical scopes. Do not restart from today or refetch the last completed date just to locate the next date.
7. Advance the scan once its discovered tasks are committed or explicitly deferred. Keep `date_scanned` separate from `date_complete`: deferred or failed sections must not disappear from completeness reporting. A failed optional item must not block the entire historical archive indefinitely.
8. On quota exhaustion or shutdown, persist progress and pause. Resume automatically after reset/restart. There must be no manual reconstruction of the cursor.
9. Treat finalized historical records as cached by default, **not literally immutable**. Reopen only for explicit force-refresh, known provider corrections, invalidation, schema migrations, or unresolved sections. Current squads, injuries and standings must not be frozen merely because a historical task requested them.
10. Store odds while available. Pre-match odds have a limited provider archive, and live odds are not a recoverable long-term history. Mark expired/unavailable history honestly; never claim that all historical odds can be backfilled. [R4]
11. Do not substitute today's roster, injuries, season totals or knowledge for what was known before a historical match. Retrospective prediction tests require legitimate as-of evidence.
12. Expose progress, next checkpoint, completed/partial dates, failures, quota wait, and an estimate of remaining work when the total is knowable. Use “not yet measured” instead of a fictional exact remaining count.

### 4.4 Worker 4 — Prediction and forecast lifecycle

**Purpose:** read database evidence, coordinate the existing three engines, evaluate markets, and save results fixture by fixture. It must not independently duplicate provider fetching.

**Triggers:** a new eligible fixture; a meaningful evidence change; an explicit model/market-version change; or an **hourly recovery sweep** for missing/failed/stale jobs. Merely checking unchanged data is not a prediction trigger.

Process the complete eligible queue, whether it contains 10, 1,000, or more fixtures. Default to **one active fixture prediction at a time**, save each fixture transactionally, and continue after an individual failure. Coalesce repeated changes for a fixture for **60 seconds** before starting another run. Preserve fairness and resumability. If a run takes longer than an hour, the hourly sweep must not restart it; continue the durable queue and report lag. Permit explicitly configured, measured concurrency increases with one lock per fixture and the same resource limits.

Use an idempotency key including `fixtureId + forecastType + evidenceHash + engine/modelVersion + marketRegistryVersion`. Reuse valid stored outputs. A failed attempt may be retried; an unchanged successful attempt should not be regenerated. Missing-data jobs wake when dependencies change, not through repeated futile AI requests.

Implement the detailed decision logic in Section 6. Finished fixtures are used for settlement and training; do not create post-result “pre-match predictions” and count them as successes.

## Acceptance checks

- [ ] Verify every source schedule and refresh interval as a named default, including live discovery/details/odds, pre-kickoff lineups, hourly recovery, and final reconciliation.
- [ ] Discover unknown live/today fixtures, confirm disappeared-live states explicitly, retain overdue fixtures across midnight, and use the stated 48-hour unresolved policy.
- [ ] Backfill newest obtainable history and non-date catalogs within actual access boundaries; resume the exact unfinished page/batch, distinguish scanned from complete, and retain deferred sections.
- [ ] Verify the prediction worker’s meaningful-change triggers, 60-second coalescing, full versioned idempotency key, one-active-fixture default, hourly recovery, fairness, and per-fixture saved progress.
- [ ] Demonstrate quota-aware pause/resume and no overlapping/coexisting competing workers. Report heartbeats, lag, errors, progress, and downstream gates.
- [ ] Keep finalized history cached but correctable; preserve as-of evidence and explicit unavailable odds history instead of inventing historical coverage.

## Handoff

Return the actual changed files or produced artifacts, commands/checks run and their results, configuration/migration changes, evidence-backed deviations, remaining limitations or blockers, and the inputs needed by the next step. Record them in the project's existing handoff/report location so 10 can compile the final completion report. Do not mark planned, blocked, untested, or unobserved work as verified.

**Next:** [05-odds-coverage.md](05-odds-coverage.md).

## Reference notes for the implementing agent

These references support provider mechanics and modeling methods. The application design, scheduling defaults, validation policy, and acceptance criteria above are implementation requirements—not provider guarantees. Recheck the current documentation and account access during implementation.

- **R1 — API-Football v3 documentation:** endpoint schemas, additional batch parameters, profiles/career endpoints, half statistics and status semantics. `https://www.api-football.com/documentation-v3`

- **R2 — API-Football, “How to Optimize API-Sports Calls and Quota Usage” (2026):** coverage-aware requests, shared fetching, caching and quota control. `https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage`

- **R3 — API-Football, “How to Get All Data from a League with API-Football” (2026):** league-season scope, coverage, team statistics, standings and complete response validation. `https://www.api-football.com/news/post/how-to-get-all-data-from-a-league-with-api-football`

- **R4 — API-Football, “How to Get Started with API-Football: The Complete Beginner's Guide” (2026):** forecasts, endpoint pagination, odds namespaces/retention and refresh behavior. `https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide`

- **R5 — API-Football, “How to Get All Fixtures Data from One League” (2024):** enriched fixture requests and the 20-ID limit. `https://www.api-football.com/news/post/how-to-get-all-fixtures-data-from-one-league`

- **R8 — API-Football terms, subscription-specific quota-reset sections:** verify the actual subscription channel. `https://www.api-football.com/terms`
