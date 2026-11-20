# 03 — Implement the shared ingestion pipeline

**Step:** 03\
**Key prerequisites:** [01-audit-baseline.md](01-audit-baseline.md); [02-data-contracts.md](02-data-contracts.md)  
**Consolidated source:** Section 3; endpoint/field contracts established in 02

## Focused task

Build one durable, idempotent provider-ingestion pipeline, including the endpoint handlers needed by the inventory, rather than separate fetching systems for individual workers.

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

Implement or repair the shared client, scheduler, cache, quota accounting, response receipts, transactional normalization, job leases/checkpoints, batching, pagination, retry classification, and supervised runtime using the existing deployment's abstractions.

Implement or verify handlers for every applicable endpoint in 02's manifest: catalogs, competitions/seasons, teams/venues, standings/team aggregates, fixtures and fixture sections, complete player populations, coach/career/transfer/absence records, provider forecasts, and odds catalogs/raw payloads. Follow each endpoint's actual scope and pagination; no manifest entry may silently lack an owner or a recorded access/availability reason. Reuse shared entities and enriched fixture sections instead of refetching them per consumer.

This step owns ingestion infrastructure and endpoint adapters. Scheduling the four logical workflows belongs to 04. Complete normalized odds history/mapping/reference-price behavior in 05 and forecast interpretation/evaluation in 07. Keep incomplete new production paths gated; adapter contracts are not a license to invent prices or forecasts.

## Requirements

Section numbers follow the consolidated prompt. Implement the assigned backend scope and use the named workstreams for shared dependencies.

## 3. Build one shared, idempotent ingestion layer

All four logical workers must share the same provider client, request scheduler, cache, quota accounting, and durable job infrastructure.

1. **Deduplicate requests:** use a canonical key containing provider, endpoint, normalized parameters, page, and freshness window. Coalesce identical in-flight requests across workers. Reuse already-stored team, league, player, and venue data.
2. **Deduplicate records:** enforce database uniqueness using stable provider IDs or documented composite keys. Use transactional upserts and content hashes. Do not append duplicates on retries.
3. **Preserve corrections:** idempotency must not prevent legitimate score, event, lineup, or schedule corrections. Merge partial responses without erasing known data merely because a field was omitted. Treat explicit authoritative corrections separately.
4. **Persist before advancing:** durably save each validated response/receipt, then transactionally update normalized data and the checkpoint. A restart should replay a stored response rather than repeat its API call when possible.
5. **Prevent overlapping jobs:** durable leases, heartbeats, ownership/fencing checks, and unique active job keys. Expired workers must not overwrite newer committed work.
6. **Maintain temporal integrity:** store event time, provider update time where available, observation time, and the evidence version. Keep UTC in storage; use `Africa/Kampala` to calculate the default local-day scope on the server.
7. **Separate freshness from change:** an unchanged response updates the last-checked timestamp but does not trigger a new forecast. Exclude request timestamps and cosmetic metadata from prediction evidence hashes.
8. **Do not equate missing with zero:** preserve nullability. An unknown score/statistic is not 0; missing odds are not 0.00.
9. **Keep provider requests server-side:** serve browser reads through GoalHint’s existing API and stored or cached data. Keep API keys server-side and out of logs and AI prompts.
10. **Be honest about network limits:** idempotency prevents duplicate effects; it does not let us know that remote data changed without checking. A crash before a response is durably recorded may require repeating a GET. Design for safe recovery, not an impossible exactly-once HTTP guarantee.

### 3.1 Explicit batching and pagination rules

| Request | Required treatment |
|---|---|
| `/fixtures?live=all` | One broad live-fixture request per scheduled sweep; the 20-ID limit does not restrict this result set. |
| `/fixtures?ids=ID-ID-...` | Maximum **20 fixture IDs per request**. Reuse returned events, lineups, team statistics and player statistics; do not immediately request identical subresources again. [R5] |
| `/fixtures?date=...` | Broad date discovery; use the documented timezone behavior and validate local-day boundaries. Do not impose a 20-result limit. |
| `/injuries?ids=...` | Maximum **20 fixture IDs** per documented batch. [R1] |
| `/trophies`, `/sidelined` | Use documented `players` or `coachs` batches of at most **20 IDs**; do not invent a mixed-person batch parameter. [R1] |
| `/fixtures/statistics?fixture=...&half=true` | Fixture-specific supplemental request when required half data is not already present. Respect season/competition availability. |
| `/teams/statistics` | One request per required team–league–season/date scope; not an invented 20-team batch. [R3] |
| `/predictions` | Fixture-specific; no invented multi-fixture parameter. |
| `/odds` | Follow all pages; documented page size is **10 results**, not 10 selected bookmakers. Do not apply a bookmaker/bet filter when importing full available coverage. |
| `/players` | Follow all pages; documented page size **20**. |
| `/players/profiles` | Follow all pages; documented page size **250**. |
| Other endpoints | Use only documented bulk/filter parameters. Follow returned pagination only where supported; never append unsupported `ids`, `page`, or `limit` arguments. |

Pagination rules are provider-specific; verify them against R1/R4 before implementation. A parallel group of HTTP requests is **not** one provider request.

### 3.2 Quota, retries, and process control

Read actual account limits and rate-limit headers. Support the application's actual subscription channel. Direct-dashboard daily resets and marketplace subscription resets may differ; do not assume Kampala midnight or one reset rule for every account. [R8]

Use the following proposed policy:

- Central rate limit: at most **80% of documented per-minute/per-second limits**, with all processes sharing the same accounting. Until limits are known/configured, use **5 requests/minute, one concurrent request**, and report degraded operation.
- Priority: **live status/final confirmation → current-day discovery and missing data → current-match enrichment/odds → historical backfill**. Use fair scheduling within a priority so one fixture cannot starve the rest.
- Recompute the request budget hourly and when live load or limits change. Reserve **120% of forecast remaining critical requests until reset**, plus **5% of the daily limit**. Backfill may consume only the positive remainder and at most **20% of the per-minute allowance**.
- If the plan cannot sustain the workload, pause backfill first, then reduce enrichment frequency. Degrade live polling from **60 → 120 → 300 seconds** only as needed; record actual freshness and emit a capacity warning through existing operational telemetry. Do not claim unchanged accuracy/freshness under insufficient quota.
- Network/temporary server failures: retry after **5, 30, then 120 seconds**, with up to 10% positive jitter. Then persist the failure and retry after **one hour**. Respect a longer provider `Retry-After`.
- For rate limits, distinguish short-window throttling from daily exhaustion. Daily exhaustion pauses eligible jobs until the verified reset plus **15 seconds**; do not repeatedly probe an exhausted quota.
- Authentication, access, and invalid-parameter errors require configuration correction, not endless retries. Check the JSON `errors` field even on HTTP 200.
- Run workers as supervised server processes or durable scheduled jobs suitable for the existing deployment. They must not depend on a browser tab, an open admin page, or a long-running web request.

## Acceptance checks

- [ ] Replay stored responses safely; duplicates do not produce duplicate records/jobs, omitted fields do not erase known data, and authoritative corrections are retained.
- [ ] Recover from crashes around response persistence, normalization, and checkpoint updates; expired owners cannot overwrite newer work.
- [ ] Exercise every applicable endpoint handler using fixtures/mocks, with full field retention, documented parameters, pagination completion, and resume from committed pages.
- [ ] Verify 20/21-fixture batching, enriched-response reuse, full odds/player/profile pagination, canonical request coalescing, and shared freshness caching.
- [ ] Verify the stated quota reserve/priorities, unknown-limit defaults, account-specific reset, 5/30/120-second retries, daily-exhaustion pause, HTTP-200 body errors, and permanent-error handling.
- [ ] Keep keys and provider calls server-side; provide executable worker/runtime setup and the shared interfaces consumed by 04.

## Handoff

Return the actual changed files or produced artifacts, commands/checks run and their results, configuration/migration changes, evidence-backed deviations, remaining limitations or blockers, and the inputs needed by the next step. Record them in the project's existing handoff/report location so Step 09 can compile the final completion report. Do not mark planned, blocked, untested, or unobserved work as verified.

**Next:** [04-coordinated-workers.md](04-coordinated-workers.md).

## Reference notes for the implementing agent

These references support provider mechanics and modeling methods. The scheduling defaults, validation policy, and acceptance criteria above describe the requested implementation. Provider support depends on the available data and account access. Recheck the current documentation and account access during implementation.

- **R1 — API-Football v3 documentation:** endpoint schemas, additional batch parameters, profiles/career endpoints, half statistics and status semantics. `https://www.api-football.com/documentation-v3`

- **R2 — API-Football, “How to Optimize API-Sports Calls and Quota Usage” (2026):** coverage-aware requests, shared fetching, caching and quota control. `https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage`

- **R3 — API-Football, “How to Get All Data from a League with API-Football” (2026):** league-season scope, coverage, team statistics, standings and complete response validation. `https://www.api-football.com/news/post/how-to-get-all-data-from-a-league-with-api-football`

- **R4 — API-Football, “How to Get Started with API-Football: The Complete Beginner's Guide” (2026):** forecasts, endpoint pagination, odds namespaces/retention and refresh behavior. `https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide`

- **R5 — API-Football, “How to Get All Fixtures Data from One League” (2024):** enriched fixture requests and the 20-ID limit. `https://www.api-football.com/news/post/how-to-get-all-fixtures-data-from-one-league`

- **R7 — API-Football, “How to Get All Teams and Players from a League ID”:** team/player traversal and complete player pagination. `https://www.api-football.com/news/post/how-to-get-all-teams-and-players-from-a-league-id`

- **R8 — API-Football terms, subscription-specific quota-reset sections:** verify the actual subscription channel. `https://www.api-football.com/terms`
