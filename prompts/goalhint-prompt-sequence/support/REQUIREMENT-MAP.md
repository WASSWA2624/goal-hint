# Source requirement coverage map

This is a non-executable index. Every substantive line of the original prompt is
retained verbatim in at least one numbered prompt or shared context file, in addition
to the unchanged source copy. Repeated requirements intentionally appear at their
contract, implementation and/or acceptance-test locations.

This is a source-preservation check, not proof that future code implements every
requirement. The implementing agent must still verify each task and preserve any
provider limitation or unavailable evidence. Original headings/table separators are
structural and are not counted as separate requirements.

Source: [goalhint-improvement-prompt.md](source/goalhint-improvement-prompt.md).
Line numbers below refer to that exact UTF-8 file, not this index.

| Source line(s) | Source requirement excerpt | Prompt/context locations |
|---|---|---|
| 5 | Improve the existing GoalHint Next.js application, not a replacement application. Implement the following phases in order… | [GLOBAL-RULES](GLOBAL-RULES.md) |
| 7 | GoalHint is a prediction and analysis platform, not a staking platform. Maximize evidence-supported prediction coverage a… | [GLOBAL-RULES](GLOBAL-RULES.md) |
| 9 | Preserve the existing stack, routes, authentication, subscription controls, unrelated features, and established visual de… | [GLOBAL-RULES](GLOBAL-RULES.md) |
| 11 | Implementation defaults: Operational intervals, retry settings, and layout measurements below are proposed implementation… | [GLOBAL-RULES](GLOBAL-RULES.md) |
| 17 | Trace the complete path: provider request → raw response → normalized records → prediction engines → publication query →… | [001](../001-audit-baseline.md) |
| 18 | Locate existing workers, schedules, queues, locks, API clients, caching, pagination, market registries, bookmaker mapping… | [001](../001-audit-baseline.md) |
| 19 | Investigate the screenshot showing 1,008 stored fixtures, 1,008 in public scope, but 674 published: reconcile the 334-fix… | [001](../001-audit-baseline.md), [047](../047-admin-coverage-counts.md) |
| 20 | Investigate the visible “Import failed,” “No recent imports,” “Waiting on quota,” and unavailable odds-mapping states. In… | [001](../001-audit-baseline.md) |
| 21 | Trace matches that remain “upcoming” after their scheduled kickoff. Check timezone conversion, provider coverage, missing… | [001](../001-audit-baseline.md) |
| 22 | Trace repeated double-chance selections and 90% probabilities to their source. Determine whether they are genuine provide… | [001](../001-audit-baseline.md) |
| 23 | Record baseline API usage, data coverage, worker lag, publication counts, prediction availability, and desktop/mobile scr… | [001](../001-audit-baseline.md) |
| 25 | Deliver an audit-to-requirement map naming the actual files and functions to modify. Continue into implementation; do not… | [001](../001-audit-baseline.md) |
| 31 | Create a versioned endpoint-and-field manifest from the current API-Football documentation and actual permitted response… | [002](../002-endpoint-inventory.md) |
| 33 | The checklist below is a minimum inventory, not permission to discard other returned fields. Preserve complete successful… | [003](../003-record-contracts.md), [008](../008-transactional-ingestion.md) |
| 35 | Use provider IDs and explicit league/season/team/fixture/player relationships. Do not confuse current entity information… | [003](../003-record-contracts.md), [008](../008-transactional-ingestion.md), [015](../015-entity-imports.md) |
| 39 | Implement or verify each applicable endpoint below. Consult references R1–R7 for endpoint structure and usage. Do not inv… | [002](../002-endpoint-inventory.md) |
| 41 |  /  Dataset  /  Endpoint(s)  /  Required ingestion scope  /  | [002](../002-endpoint-inventory.md), [007](../007-shared-provider-client.md), [014](../014-catalog-imports.md), [015](../015-entity-imports.md), [016](../016-team-context-imports.md), [017](../017-fixture-data-imports.md), [018](../018-player-data-imports.md), [019](../019-career-data-imports.md), [024](../024-odds-catalog-mapping.md), [025](../025-odds-ingestion.md) |
| 43 |  /  Account and usage  /  /status  /  Subscription/access information and request usage; keep account details admin-only.… | [002](../002-endpoint-inventory.md), [007](../007-shared-provider-client.md) |
| 44 |  /  Time references  /  /timezone  /  Supported timezone identifiers.  /  | [002](../002-endpoint-inventory.md), [014](../014-catalog-imports.md) |
| 45 |  /  Country catalogs  /  /countries, /teams/countries  /  Both catalogs; retain their distinct purposes.  /  | [002](../002-endpoint-inventory.md), [014](../014-catalog-imports.md) |
| 46 |  /  Competitions and seasons  /  /leagues, /leagues/seasons  /  All accessible competitions, available seasons, coverage,… | [002](../002-endpoint-inventory.md), [014](../014-catalog-imports.md) |
| 47 |  /  Teams  /  /teams, /teams/seasons  /  Team profiles, competition membership, available seasons, and venue associations… | [002](../002-endpoint-inventory.md), [015](../015-entity-imports.md) |
| 48 |  /  Team aggregates  /  /teams/statistics  /  Each accessible team–competition–season combination; dated snapshots where… | [002](../002-endpoint-inventory.md), [016](../016-team-context-imports.md) |
| 49 |  /  Stadiums  /  /venues  /  Venue profiles and media references.  /  | [002](../002-endpoint-inventory.md), [015](../015-entity-imports.md) |
| 50 |  /  Tables  /  /standings  /  All groups and table sections, not just the first group.  /  | [002](../002-endpoint-inventory.md), [016](../016-team-context-imports.md) |
| 51 |  /  Rounds  /  /fixtures/rounds  /  Round identifiers and available round dates.  /  | [002](../002-endpoint-inventory.md), [014](../014-catalog-imports.md) |
| 52 |  /  Fixtures  /  /fixtures  /  Schedules, participants, scores, periods, statuses, and enriched fixture responses.  /  | [002](../002-endpoint-inventory.md), [017](../017-fixture-data-imports.md) |
| 53 |  /  Direct history  /  /fixtures/headtohead  /  Relevant team-pair history; reuse equivalent local fixture history first.… | [002](../002-endpoint-inventory.md), [017](../017-fixture-data-imports.md) |
| 54 |  /  Match statistics  /  /fixtures/statistics  /  Full-match statistics and supported half-specific statistics using half… | [002](../002-endpoint-inventory.md), [017](../017-fixture-data-imports.md) |
| 55 |  /  Match events  /  /fixtures/events  /  Complete timelines, including corrections and VAR events.  /  | [002](../002-endpoint-inventory.md), [017](../017-fixture-data-imports.md) |
| 56 |  /  Lineups  /  /fixtures/lineups  /  Formations, starters, substitutes, positions, coaches, and other supplied lineup fi… | [002](../002-endpoint-inventory.md), [017](../017-fixture-data-imports.md) |
| 57 |  /  Player match statistics  /  /fixtures/players  /  Every available player and statistical field for each covered fixtu… | [002](../002-endpoint-inventory.md), [017](../017-fixture-data-imports.md) |
| 58 |  /  Absences  /  /injuries  /  Fixture-related injury and suspension information.  /  | [002](../002-endpoint-inventory.md), [017](../017-fixture-data-imports.md) |
| 59 |  /  Provider forecasts  /  /predictions  /  All supplied prediction and comparison fields, not only double chance.  /  | [002](../002-endpoint-inventory.md), [017](../017-fixture-data-imports.md) |
| 60 |  /  Coaches  /  /coachs  /  Profiles and dated career associations; preserve the provider's endpoint spelling.  /  | [002](../002-endpoint-inventory.md), [019](../019-career-data-imports.md) |
| 61 |  /  Player availability catalogs  /  /players/seasons, /players/profiles  /  Available statistical seasons and the comple… | [002](../002-endpoint-inventory.md), [018](../018-player-data-imports.md) |
| 62 |  /  Player season statistics  /  /players  /  All pages for every accessible relevant competition/season; preserve multip… | [002](../002-endpoint-inventory.md), [018](../018-player-data-imports.md) |
| 63 |  /  Current squads  /  /players/squads  /  Current squad associations; do not label these historical lineups.  /  | [002](../002-endpoint-inventory.md), [018](../018-player-data-imports.md) |
| 64 |  /  Player career teams  /  /players/teams  /  Available team and season associations for each player.  /  | [002](../002-endpoint-inventory.md), [018](../018-player-data-imports.md) |
| 65 |  /  Player rankings  /  /players/topscorers, /players/topassists, /players/topyellowcards, /players/topredcards  /  All f… | [002](../002-endpoint-inventory.md), [018](../018-player-data-imports.md) |
| 66 |  /  Transfers  /  /transfers  /  Player/team transfer histories and dated origin/destination relationships.  /  | [002](../002-endpoint-inventory.md), [019](../019-career-data-imports.md) |
| 67 |  /  Achievements  /  /trophies  /  Available player and coach records.  /  | [002](../002-endpoint-inventory.md), [019](../019-career-data-imports.md) |
| 68 |  /  Historical absences  /  /sidelined  /  Available player/coach absence records.  /  | [002](../002-endpoint-inventory.md), [019](../019-career-data-imports.md) |
| 69 |  /  Bookmakers  /  /odds/bookmakers  /  Complete available bookmaker catalog.  /  | [002](../002-endpoint-inventory.md), [024](../024-odds-catalog-mapping.md) |
| 70 |  /  Pre-match markets  /  /odds/bets  /  Complete pre-match market catalog.  /  | [002](../002-endpoint-inventory.md), [024](../024-odds-catalog-mapping.md) |
| 71 |  /  Odds availability mapping  /  /odds/mapping  /  All available mapping pages.  /  | [002](../002-endpoint-inventory.md), [024](../024-odds-catalog-mapping.md) |
| 72 |  /  Pre-match prices  /  /odds  /  All available bookmakers, markets, outcomes, lines, and pages for the requested fixtur… | [002](../002-endpoint-inventory.md), [025](../025-odds-ingestion.md) |
| 73 |  /  Live market catalog  /  /odds/live/bets  /  Separate live-market identifiers and definitions.  /  | [002](../002-endpoint-inventory.md), [024](../024-odds-catalog-mapping.md) |
| 74 |  /  Live prices  /  /odds/live  /  Available live selections, lines, prices, and availability/status flags.  /  | [002](../002-endpoint-inventory.md), [025](../025-odds-ingestion.md) |
| 78 | For each applicable record, retain all returned properties, including these families. These are ingestion requirements; a… | [003](../003-record-contracts.md) |
| 80 | Identity/context: provider IDs; names and aliases; country/code/flag; competition type/logo; season, dates, round and gro… | [003](../003-record-contracts.md), [014](../014-catalog-imports.md), [015](../015-entity-imports.md) |
| 81 | Fixture: date, UTC timestamp, timezone, referee, venue, home/away teams, period timestamps, status code/description, elap… | [003](../003-record-contracts.md), [017](../017-fixture-data-imports.md) |
| 82 | Standings/team season: position, points, goal difference, form and table movement; home/away/overall played, won, drawn a… | [003](../003-record-contracts.md), [016](../016-team-context-imports.md) |
| 83 | Team match statistics: shots by supplied category, chances/expected-goal statistics where actually returned, possession,… | [003](../003-record-contracts.md), [017](../017-fixture-data-imports.md) |
| 84 | Events/lineups: event time and added time, team, player, assist, event type/detail/comments; goals and reversals, penalti… | [003](../003-record-contracts.md), [017](../017-fixture-data-imports.md) |
| 85 | Player: identity, birth details, nationality, physical/profile fields and photo; team/competition/season associations; ap… | [003](../003-record-contracts.md), [017](../017-fixture-data-imports.md), [018](../018-player-data-imports.md) |
| 86 | Career/availability: transfer dates/types and both teams; coach career dates; injury/suspension type, reason and dates; t… | [003](../003-record-contracts.md), [019](../019-career-data-imports.md) |
| 87 | Forecasts/prices: provider advice and numeric forecasts where supplied, comparison components and source history; bookmak… | [003](../003-record-contracts.md), [025](../025-odds-ingestion.md) |
| 89 | Do not claim that API-Football supplies news, weather, tactical assessments, manager ratings, or psychological states as… | [003](../003-record-contracts.md), [027](../027-fixture-evidence.md), [035](../035-context-adjustments.md) |
| 93 | Track state per resource + scope + endpoint + page/section, using: | [004](../004-completeness-ledger.md) |
| 95 | not_requested  /  queued  /  fetching  /  complete  /  partial  /  unavailable  /  not_applicable  /  retryable_failure… | [004](../004-completeness-ledger.md) |
| 97 | Record reasons, attempts, timestamps, last successful response, next retry, and known remaining work. A successful empty… | [004](../004-completeness-ledger.md) |
| 101 | All four logical workers must share the same provider client, request scheduler, cache, quota accounting, and durable job… | [006](../006-durable-job-control.md), [007](../007-shared-provider-client.md), [009](../009-shared-fetch-cache.md), [013](../013-worker-runtime.md), [GLOBAL-RULES](GLOBAL-RULES.md) |
| 103 | Deduplicate requests: use a canonical key containing provider, endpoint, normalized parameters, page, and freshness windo… | [009](../009-shared-fetch-cache.md) |
| 104 | Deduplicate records: enforce database uniqueness using stable provider IDs or documented composite keys. Use transactiona… | [008](../008-transactional-ingestion.md) |
| 105 | Preserve corrections: idempotency must not prevent legitimate score, event, lineup, or schedule corrections. Merge partia… | [008](../008-transactional-ingestion.md) |
| 106 | Persist before advancing: durably save each validated response/receipt, then transactionally update normalized data and t… | [008](../008-transactional-ingestion.md) |
| 107 | Prevent overlapping jobs: durable leases, heartbeats, ownership/fencing checks, and unique active job keys. Expired worke… | [006](../006-durable-job-control.md), [008](../008-transactional-ingestion.md) |
| 108 | Maintain temporal integrity: store event time, provider update time where available, observation time, and the evidence v… | [003](../003-record-contracts.md), [008](../008-transactional-ingestion.md) |
| 109 | Separate freshness from change: an unchanged response updates the last-checked timestamp but does not trigger a new forec… | [003](../003-record-contracts.md), [009](../009-shared-fetch-cache.md) |
| 110 | Do not equate missing with zero: preserve nullability. An unknown score/statistic is not 0; missing odds are not 0.00. | [003](../003-record-contracts.md), [008](../008-transactional-ingestion.md) |
| 111 | No frontend provider calls: browsers read GoalHint's database/cache. API keys stay server-side and out of logs and AI pro… | [007](../007-shared-provider-client.md) |
| 112 | Be honest about network limits: idempotency prevents duplicate effects; it does not let us know that remote data changed… | [008](../008-transactional-ingestion.md) |
| 116 |  /  Request  /  Required treatment  /  | [010](../010-batching-pagination.md), [016](../016-team-context-imports.md), [017](../017-fixture-data-imports.md), [018](../018-player-data-imports.md), [019](../019-career-data-imports.md), [025](../025-odds-ingestion.md) |
| 118 |  /  /fixtures?live=all  /  One broad live-fixture request per scheduled sweep; the 20-ID limit does not restrict this res… | [010](../010-batching-pagination.md), [017](../017-fixture-data-imports.md) |
| 119 |  /  /fixtures?ids=ID-ID-...  /  Maximum 20 fixture IDs per request. Reuse returned events, lineups, team statistics and p… | [010](../010-batching-pagination.md), [017](../017-fixture-data-imports.md) |
| 120 |  /  /fixtures?date=...  /  Broad date discovery; use the documented timezone behavior and validate local-day boundaries.… | [010](../010-batching-pagination.md), [017](../017-fixture-data-imports.md) |
| 121 |  /  /injuries?ids=...  /  Maximum 20 fixture IDs per documented batch. [R1]  /  | [010](../010-batching-pagination.md), [017](../017-fixture-data-imports.md) |
| 122 |  /  /trophies, /sidelined  /  Use documented players or coachs batches of at most 20 IDs; do not invent a mixed-person ba… | [010](../010-batching-pagination.md), [019](../019-career-data-imports.md) |
| 123 |  /  /fixtures/statistics?fixture=...&half=true  /  Fixture-specific supplemental request when required half data is not a… | [010](../010-batching-pagination.md), [017](../017-fixture-data-imports.md) |
| 124 |  /  /teams/statistics  /  One request per required team–league–season/date scope; not an invented 20-team batch. [R3]  /  | [010](../010-batching-pagination.md), [016](../016-team-context-imports.md) |
| 125 |  /  /predictions  /  Fixture-specific; no invented multi-fixture parameter.  /  | [010](../010-batching-pagination.md), [017](../017-fixture-data-imports.md) |
| 126 |  /  /odds  /  Follow all pages; documented page size is 10 results, not 10 selected bookmakers. Do not apply a bookmaker/… | [010](../010-batching-pagination.md), [025](../025-odds-ingestion.md) |
| 127 |  /  /players  /  Follow all pages; documented page size 20.  /  | [010](../010-batching-pagination.md), [018](../018-player-data-imports.md) |
| 128 |  /  /players/profiles  /  Follow all pages; documented page size 250.  /  | [010](../010-batching-pagination.md), [018](../018-player-data-imports.md) |
| 129 |  /  Other endpoints  /  Use only documented bulk/filter parameters. Follow returned pagination only where supported; neve… | [010](../010-batching-pagination.md) |
| 131 | Pagination rules are provider-specific; verify them against R1/R4 before implementation. A parallel group of HTTP request… | [010](../010-batching-pagination.md) |
| 135 | Read actual account limits and rate-limit headers. Support the application's actual subscription channel. Direct-dashboar… | [011](../011-quota-scheduler.md), [059](../059-quota-capacity-check.md) |
| 137 | Use the following proposed policy: | [011](../011-quota-scheduler.md), [059](../059-quota-capacity-check.md) |
| 139 | Central rate limit: at most 80% of documented per-minute/per-second limits, with all processes sharing the same accountin… | [011](../011-quota-scheduler.md), [059](../059-quota-capacity-check.md) |
| 140 | Priority: live status/final confirmation → current-day discovery and missing data → current-match enrichment/odds → histo… | [011](../011-quota-scheduler.md), [059](../059-quota-capacity-check.md) |
| 141 | Recompute the request budget hourly and when live load or limits change. Reserve 120% of forecast remaining critical requ… | [011](../011-quota-scheduler.md), [059](../059-quota-capacity-check.md) |
| 142 | If the plan cannot sustain the workload, pause backfill first, then reduce enrichment frequency. Degrade live polling fro… | [011](../011-quota-scheduler.md), [059](../059-quota-capacity-check.md) |
| 143 | Network/temporary server failures: retry after 5, 30, then 120 seconds, with up to 10% positive jitter. Then persist the… | [012](../012-retries-errors.md) |
| 144 | For rate limits, distinguish short-window throttling from daily exhaustion. Daily exhaustion pauses eligible jobs until t… | [012](../012-retries-errors.md) |
| 145 | Authentication, access, and invalid-parameter errors require configuration correction, not endless retries. Check the JSO… | [007](../007-shared-provider-client.md), [012](../012-retries-errors.md) |
| 146 | Run workers as supervised server processes or durable scheduled jobs suitable for the existing deployment. They must not… | [013](../013-worker-runtime.md) |
| 150 | These are four logical responsibilities, not a requirement for four separate servers. Reuse the existing queue/runtime wh… | [013](../013-worker-runtime.md), [GLOBAL-RULES](GLOBAL-RULES.md) |
| 154 | Purpose: keep match facts current, independently of prediction generation. | [020](../020-live-worker.md) |
| 156 | Default schedule: every 60 seconds while matches are live or scheduled to start within 15 minutes; otherwise perform live… | [020](../020-live-worker.md) |
| 158 | Retrieve /fixtures?live=all; update all returned fixtures, including previously unknown ones. Reuse any events already in… | [020](../020-live-worker.md) |
| 159 | Refresh due enriched live-fixture details every 120 seconds, batching at most 20 fixture IDs per request. Store the full… | [020](../020-live-worker.md) |
| 160 | Capture available in-play odds every 60 seconds, using the broadest documented useful scope and preserving all returned m… | [020](../020-live-worker.md) |
| 161 | Starting 90 minutes before kickoff, check missing lineups every 15 minutes, preferably through due enriched batches. Stop… | [020](../020-live-worker.md) |
| 162 | When a match disappears from the live feed, request its current fixture state. Disappearance is not proof of full time. H… | [020](../020-live-worker.md), [045](../045-status-separation.md) |
| 163 | After an authoritative final state, save results and enqueue settlement. Schedule final-detail reconciliation after 15 mi… | [020](../020-live-worker.md), [045](../045-status-separation.md), [046](../046-settlement.md) |
| 164 | Never infer that a match is finished merely from kickoff plus 90 minutes. Never manufacture seconds when the provider sup… | [020](../020-live-worker.md), [045](../045-status-separation.md) |
| 168 | Default schedule: once every hour at minute 00, with a catch-up run after downtime. A concurrent run must be coalesced ra… | [021](../021-daily-refresh-worker.md) |
| 170 | Discover every accessible fixture in today's Africa/Kampala date window. Use broad date discovery, not just fixtures alre… | [021](../021-daily-refresh-worker.md) |
| 171 | Ensure all applicable checklist sections have jobs. Fetch missing or stale sections; reuse still-fresh shared entities. D… | [021](../021-daily-refresh-worker.md) |
| 172 | Batch due enriched fixtures in groups of 20. Share today's fetch receipts with the live and backfill workers. | [021](../021-daily-refresh-worker.md) |
| 173 | Check current team/player/league context, provider predictions, and odds using the freshness policy below. An hourly coor… | [021](../021-daily-refresh-worker.md) |
| 174 | Revisit every unresolved fixture whose scheduled kickoff has passed, including fixtures from earlier dates. Maintain a du… | [021](../021-daily-refresh-worker.md), [045](../045-status-separation.md) |
| 175 | Retry unresolved results hourly for the first 48 hours, then daily; flag them for investigation after 48 hours without in… | [021](../021-daily-refresh-worker.md), [045](../045-status-separation.md) |
| 176 | Publish changed data, invalidate affected application caches, and enqueue only affected predictions or settlements. | [021](../021-daily-refresh-worker.md) |
| 178 | Default freshness policy for active scopes: | [021](../021-daily-refresh-worker.md) |
| 180 |  /  Resource  /  Default refresh/check  /  | [021](../021-daily-refresh-worker.md) |
| 182 |  /  Today's fixture discovery; unresolved recent fixtures; active standings  /  1 hour  /  | [021](../021-daily-refresh-worker.md) |
| 183 |  /  Provider forecasts for eligible fixtures  /  Initial capture; then 1 hour while relevant and permitted  /  | [021](../021-daily-refresh-worker.md) |
| 184 |  /  Pre-match odds  /  Initial capture; then 3 hours  /  | [021](../021-daily-refresh-worker.md) |
| 185 |  /  Injuries  /  Initial capture; then 4 hours  /  | [021](../021-daily-refresh-worker.md) |
| 186 |  /  Team season statistics  /  Initial capture; then 12 hours  /  | [021](../021-daily-refresh-worker.md) |
| 187 |  /  Active league coverage, teams, coaches, squads, transfers, catalogs and rankings  /  Missing immediately; otherwise 2… | [021](../021-daily-refresh-worker.md) |
| 188 |  /  Player season statistics  /  Missing immediately; otherwise 24 hours for active scopes  /  | [021](../021-daily-refresh-worker.md) |
| 189 |  /  Player profiles/career-team lists, trophies and sidelined history  /  Missing immediately; otherwise 7 days; targeted… | [021](../021-daily-refresh-worker.md) |
| 190 |  /  Timezone catalog  /  Bootstrap and explicit invalidation  /  | [021](../021-daily-refresh-worker.md) |
| 191 |  /  Archived, finalized historical records  /  No routine full replay; exceptions below  /  | [021](../021-daily-refresh-worker.md) |
| 193 | These are application defaults. Check documented provider freshness and coverage; fetching more often cannot create upstr… | [021](../021-daily-refresh-worker.md) |
| 197 | Purpose: build the most complete database the account and provider history allow, without repeatedly downloading complete… | [022](../022-historical-worker.md) |
| 199 | On first initialization, complete today's currently obtainable missing data, then traverse yesterday, the day before, and… | [022](../022-historical-worker.md) |
| 200 | For each date, discover fixtures and fill every applicable dataset in Section 2. Enrich already-stored fixtures rather th… | [022](../022-historical-worker.md) |
| 201 | Also traverse all accessible competition-seasons and entity catalogs, including player-profile pages. A date-only fixture… | [022](../022-historical-worker.md) |
| 202 | Discover historical boundaries from available league seasons and account access. Do not stop at an arbitrary 30/90-day wi… | [022](../022-historical-worker.md) |
| 203 | Persist date, league/season where relevant, endpoint, parameters, page, batch IDs, item/section completion, stored-respon… | [022](../022-historical-worker.md) |
| 204 | On restart, resume the exact unfinished task. Skip successfully persisted pages/batches and fully completed historical sc… | [022](../022-historical-worker.md) |
| 205 | Advance the scan once its discovered tasks are committed or explicitly deferred. Keep date_scanned separate from date_com… | [022](../022-historical-worker.md) |
| 206 | On quota exhaustion or shutdown, persist progress and pause. Resume automatically after reset/restart. There must be no m… | [022](../022-historical-worker.md) |
| 207 | Treat finalized historical records as cached by default, not literally immutable. Reopen only for explicit force-refresh,… | [022](../022-historical-worker.md) |
| 208 | Store odds while available. Pre-match odds have a limited provider archive, and live odds are not a recoverable long-term… | [022](../022-historical-worker.md) |
| 209 | Do not substitute today's roster, injuries, season totals or knowledge for what was known before a historical match. Retr… | [022](../022-historical-worker.md) |
| 210 | Expose progress, next checkpoint, completed/partial dates, failures, quota wait, and an estimate of remaining work when t… | [022](../022-historical-worker.md), [048](../048-operational-dashboard.md) |
| 214 | Purpose: read database evidence, coordinate the existing three engines, evaluate markets, and save results fixture by fix… | [023](../023-prediction-worker.md) |
| 216 | Triggers: a new eligible fixture; a meaningful evidence change; an explicit model/market-version change; or an hourly rec… | [023](../023-prediction-worker.md) |
| 218 | Process the complete eligible queue, whether it contains 10, 1,000, or more fixtures. Default to one active fixture predi… | [023](../023-prediction-worker.md) |
| 220 | Use an idempotency key including fixtureId + forecastType + evidenceHash + engine/modelVersion + marketRegistryVersion. R… | [023](../023-prediction-worker.md), [041](../041-forecast-version-storage.md) |
| 222 | Implement the detailed decision logic in Section 6. Finished fixtures are used for settlement and training; do not create… | [023](../023-prediction-worker.md), [041](../041-forecast-version-storage.md) |
| 226 | Import all available bookmaker and market catalogs. Keep pre-match and live market ID namespaces separate; the same numer… | [024](../024-odds-catalog-mapping.md) |
| 227 | Fetch all pages of prices for the required scope without restricting to one bookmaker or one bet type. Normalize each exa… | [025](../025-odds-ingestion.md) |
| 228 | Store provider timestamps, observation timestamps, availability, and price history without duplicating identical snapshot… | [025](../025-odds-ingestion.md) |
| 229 | For the displayed reference price: use the configured preferred bookmaker if its exact selection is available and fresh;… | [026](../026-odds-reference-prices.md), [054](../054-market-details.md) |
| 230 | Preserve other bookmaker prices for match-detail comparison. Honor an existing user-selected bookmaker; identify when the… | [026](../026-odds-reference-prices.md), [054](../054-market-details.md) |
| 231 | Reject malformed prices and respect suspension flags. Label stale prices with their timestamp rather than presenting them… | [025](../025-odds-ingestion.md), [026](../026-odds-reference-prices.md), [054](../054-market-details.md) |
| 232 | A supported forecast remains visible without a price: “Odds unavailable.” A bookmaker offering a price does not prove tha… | [026](../026-odds-reference-prices.md), [044](../044-publication-repair.md), [054](../054-market-details.md) |
| 233 | An odds-only change updates prices. It must not rerun an odds-independent probability model unless its declared inputs ac… | [023](../023-prediction-worker.md), [025](../025-odds-ingestion.md), [026](../026-odds-reference-prices.md) |
| 234 | Do not introduce a minimum-odds requirement or force high-odds selections. Do not equate bookmaker implied probability wi… | [026](../026-odds-reference-prices.md) |
| 240 | Triangulation means connecting and combining relevant direct and indirect evidence to estimate an outcome when evidence i… | [028](../028-relationship-features.md) |
| 242 | Examples include team A's and B's direct history; their performance against common opponents; wider opponent-strength rel… | [028](../028-relationship-features.md) |
| 244 | If A performed well against C, and C performed well against B, that can inform A-versus-B analysis. It does not prove tha… | [028](../028-relationship-features.md) |
| 248 | Read every relevant available dataset, not merely head-to-head matches. Organize evidence by team, player, coach, opponen… | [027](../027-fixture-evidence.md) |
| 249 | Evaluate direct history, recent and longer-term form, opponent-adjusted attacking/defensive strength, table context, home… | [027](../027-fixture-evidence.md) |
| 250 | Build reusable relationship features from the historical match graph. Use regularized team/opponent strength estimates ac… | [027](../027-fixture-evidence.md), [028](../028-relationship-features.md) |
| 251 | Track provenance and avoid double-counting the same match as direct history, common-opponent evidence, and a season aggre… | [027](../027-fixture-evidence.md), [028](../028-relationship-features.md) |
| 252 | Weight relevance, recency, sample size, competition comparability, venue, roster continuity, source quality, and missingn… | [027](../027-fixture-evidence.md), [028](../028-relationship-features.md), [035](../035-context-adjustments.md), [036](../036-model-calibration.md) |
| 253 | Missing head-to-head history alone must not block a prediction. Evidence for an apparently missing team may exist in oppo… | [027](../027-fixture-evidence.md), [028](../028-relationship-features.md), [029](../029-probability-confidence-gates.md) |
| 254 | Produce a bounded, structured evidence package with source-record references. Do not send unrestricted raw archives, secr… | [027](../027-fixture-evidence.md) |
| 258 | Win probability: the model's estimated chance of the specified outcome under that market's settlement rules. | [029](../029-probability-confidence-gates.md), [042](../042-top-pick-ranking.md) |
| 259 | Evidence/model confidence: reliability of that estimate, considering support, completeness, freshness, disagreement, doma… | [029](../029-probability-confidence-gates.md), [042](../042-top-pick-ranking.md) |
| 260 | Ranking score: an internal selection aid, if needed; never label it probability or use it to silently override the requir… | [029](../029-probability-confidence-gates.md), [042](../042-top-pick-ranking.md) |
| 262 | Low confidence does not automatically mean a low probability. For example, a likely outcome can still have an uncertain p… | [029](../029-probability-confidence-gates.md), [042](../042-top-pick-ranking.md) |
| 264 | Define versioned, market-specific evidence gates and validate thresholds on held-out data. Do not require every optional… | [029](../029-probability-confidence-gates.md), [036](../036-model-calibration.md) |
| 268 | Use AI → local engine → API-Football predictions. | [038](../038-engine-routing.md) |
| 270 | Attempt the configured AI engine when available and suitable for the market family. | [038](../038-engine-routing.md) |
| 271 | Validate its structured response, evidence grounding, numerical coherence, model provenance, and calibration/quality elig… | [038](../038-engine-routing.md) |
| 272 | On failure, timeout, missing capability, or invalid/unreliable output, try the local engine for the affected market family. | [038](../038-engine-routing.md) |
| 273 | If local support fails, use the provider forecast only for outcomes it actually supports and for which a defensible proba… | [037](../037-provider-prediction-adapter.md), [038](../038-engine-routing.md) |
| 274 | If none qualifies, store an explicit abstention reason. Do not invent a prediction to make the catalog look complete. | [037](../037-provider-prediction-adapter.md), [038](../038-engine-routing.md) |
| 276 | Fallback should preserve successful independent market families rather than discard an entire fixture. However, coupled p… | [038](../038-engine-routing.md) |
| 278 | For the API adapter, preserve the documented meaning of every field: win_or_draw is a flag, not a probability; home/draw/… | [037](../037-provider-prediction-adapter.md) |
| 280 | An AI language model's unsupported percentage is not a validated probability. AI may structure evidence, produce bounded… | [038](../038-engine-routing.md) |
| 282 | Use a 60-second AI-call timeout, one transient retry, then local fallback. After five consecutive provider-level AI failu… | [038](../038-engine-routing.md) |
| 286 | Audit the existing local mechanism. Retain proven working components, but ensure the following explicit modeling capabili… | [030](../030-local-goal-model.md) |
| 288 | Result/goal baseline: fit regularized, time-weighted attack/defense parameters with opponent strength, competition contex… | [030](../030-local-goal-model.md) |
| 289 | Sparse-data handling: use hierarchical/league priors and shared-opponent information with uncertainty. Connected history… | [030](../030-local-goal-model.md) |
| 290 | Coherent goal distribution: generate a joint distribution of home/away goals. Extend the score grid until omitted probabi… | [031](../031-coherent-score-distribution.md), [040](../040-probability-invariants.md) |
| 291 | Half/time markets: fit period-aware scoring using actual period/event history. Derive half/full-time and combination mark… | [032](../032-period-and-half-models.md) |
| 292 | Player scoring: model expected participation/minutes, role, scoring contribution, penalties where evidenced, team scoring… | [033](../033-player-models.md) |
| 293 | Cards/corners/other statistics: use separate suitable count/event models with their own historical inputs and validation.… | [034](../034-statistic-models.md) |
| 294 | Context adjustments: integrate verified injuries, transfers, formations and related features with learned or validated ef… | [035](../035-context-adjustments.md) |
| 295 | Calibration: validate with time-ordered holdouts, appropriate probability calibration, reliability curves, Brier score an… | [036](../036-model-calibration.md) |
| 297 | Training/calibration may run as maintenance jobs managed by the prediction infrastructure; do not retrain the entire mode… | [036](../036-model-calibration.md) |
| 301 | Use one versioned market-definition registry across fixtures. Each entry defines period, selection set, line/player/team… | [005](../005-market-registry.md) |
| 303 | Reconcile the existing registry with API catalogs. Enumerate every catalog entry and map it explicitly, marking unsupport… | [005](../005-market-registry.md), [024](../024-odds-catalog-mapping.md) |
| 305 | Evaluate these families wherever the required evidence and models support them: | [005](../005-market-registry.md), [039](../039-market-evaluation.md) |
| 307 |  /  Family  /  Required variants to consider  /  | [005](../005-market-registry.md), [032](../032-period-and-half-models.md), [033](../033-player-models.md), [034](../034-statistic-models.md), [039](../039-market-evaluation.md) |
| 309 |  /  Results  /  Full-time home/draw/away; supported first-half and second-half results.  /  | [005](../005-market-registry.md), [032](../032-period-and-half-models.md), [039](../039-market-evaluation.md) |
| 310 |  /  Double chance  /  Home/draw, home/away, draw/away for supported periods.  /  | [005](../005-market-registry.md), [032](../032-period-and-half-models.md), [039](../039-market-evaluation.md) |
| 311 |  /  Draw no bet/handicaps  /  Supported draw-no-bet, European and Asian lines, with push/partial-settlement rules.  /  | [005](../005-market-registry.md), [039](../039-market-evaluation.md) |
| 312 |  /  Total goals  /  Over/under 0.5, 1.5, 2.5, 3.5, 4.5 and 5.5, plus other legitimate registered lines; handle integer/qu… | [005](../005-market-registry.md), [039](../039-market-evaluation.md) |
| 313 |  /  Team goals  /  Each team's supported totals, scoring yes/no and clean-sheet markets.  /  | [005](../005-market-registry.md), [039](../039-market-evaluation.md) |
| 314 |  /  BTTS / goal-goal  /  Yes/no at full time and supported half-specific variants.  /  | [005](../005-market-registry.md), [032](../032-period-and-half-models.md), [039](../039-market-evaluation.md) |
| 315 |  /  Correct score/ranges  /  Full-time and supported half scores; exact totals and registered bands such as 1–2, 1–3 or 1… | [005](../005-market-registry.md), [032](../032-period-and-half-models.md), [039](../039-market-evaluation.md) |
| 316 |  /  Half relationships  /  Highest-scoring half including equal; half-time/full-time outcomes; supported scoring-in-both-… | [005](../005-market-registry.md), [032](../032-period-and-half-models.md), [039](../039-market-evaluation.md) |
| 317 |  /  Combined outcomes  /  Result/double chance with goals, BTTS with totals, and other mapped combinations using their jo… | [005](../005-market-registry.md), [032](../032-period-and-half-models.md), [039](../039-market-evaluation.md) |
| 318 |  /  Players  /  Anytime/first/last scorer, player goal totals, assists, shots or bookings only with suitable models and p… | [005](../005-market-registry.md), [033](../033-player-models.md), [039](../039-market-evaluation.md) |
| 319 |  /  Discipline/set pieces  /  Team/match corners, cards, red cards and relevant handicaps/periods where supported.  /  | [005](../005-market-registry.md), [034](../034-statistic-models.md), [039](../039-market-evaluation.md) |
| 320 |  /  Other catalog markets  /  Register, map and evaluate with an appropriate model or give an explicit unsupported reason… | [005](../005-market-registry.md), [034](../034-statistic-models.md), [039](../039-market-evaluation.md) |
| 322 | For each supported parameterized market, compute its outcome distribution and choose the highest-probability supported ou… | [039](../039-market-evaluation.md) |
| 324 | Keep the following probability invariants: | [040](../040-probability-invariants.md) |
| 326 | Every probability is finite and within [0, 1]. Mutually exclusive, exhaustive outcomes sum to 1 within numerical tolerance. | [031](../031-coherent-score-distribution.md), [040](../040-probability-invariants.md) |
| 327 | P(1X) = P(home win) + P(draw). The three double-chance selections overlap; do not normalize them to sum to 1. | [031](../031-coherent-score-distribution.md), [040](../040-probability-invariants.md) |
| 328 | Goal-threshold probabilities are monotone: P(over 1.5) >= P(over 2.5) >= P(over 3.5). | [031](../031-coherent-score-distribution.md), [040](../040-probability-invariants.md) |
| 329 | Under the same period/settlement rules, BTTS implies at least two goals, so P(over 1.5) >= P(BTTS yes). | [031](../031-coherent-score-distribution.md), [040](../040-probability-invariants.md) |
| 330 | Combination probabilities cannot exceed either component probability. | [031](../031-coherent-score-distribution.md), [040](../040-probability-invariants.md) |
| 331 | Push/no-action/half-win/half-loss possibilities remain separate from outright win probability where applicable. | [031](../031-coherent-score-distribution.md), [040](../040-probability-invariants.md), [046](../046-settlement.md) |
| 332 | Correct scores, ranges, half results and player-related forecasts must not contradict the underlying modeled scenario def… | [031](../031-coherent-score-distribution.md), [040](../040-probability-invariants.md) |
| 334 | Never fabricate unrealistic new goal lines solely to obtain near-100% recommendations. Legitimate registered markets can… | [005](../005-market-registry.md), [039](../039-market-evaluation.md) |
| 338 | For each supported market save: fixture ID, market key/parameters, recommended selection, outcome probabilities, confiden… | [041](../041-forecast-version-storage.md), [054](../054-market-details.md) |
| 340 | Choose the match-card recommendation from eligible supported predictions by estimated win probability descending, then co… | [042](../042-top-pick-ranking.md) |
| 342 | Match details must expose every supported market's pick, probability, confidence and available bookmaker prices. Unsuppor… | [054](../054-market-details.md) |
| 344 | Freeze and retain each published pre-match forecast version. If live forecasting exists or is added within the approved s… | [041](../041-forecast-version-storage.md), [049](../049-performance-metrics.md) |
| 346 | For slips, retain existing functionality but do not claim that many low-odds selections are collectively safe. Multiplyin… | [043](../043-slip-integrity.md) |
| 350 | Fixture visibility and prediction availability are separate. Publish every valid fixture in the intended public scope eve… | [044](../044-publication-repair.md) |
| 351 | Do not block all publication until all 1,000 fixtures have been predicted. Publish and update incrementally as each fixtu… | [044](../044-publication-repair.md) |
| 352 | Use distinct fields for provider match status, data freshness, forecast availability, publication state, and prediction s… | [045](../045-status-separation.md) |
| 353 | A scheduled kickoff passing must not automatically produce void, cancellation, loss, or completion. Show an awaiting-upda… | [045](../045-status-separation.md) |
| 354 | Settle predictions from authoritative outcomes and exact market rules, including period boundaries, extra-time exclusions… | [046](../046-settlement.md), [057](../057-publication-settlement-tests.md) |
| 355 | Keep distinct admin totals for discovered, stored, public-scope, visible, prediction-ready, priced, awaiting data, and ex… | [047](../047-admin-coverage-counts.md) |
| 356 | Report worker heartbeat, last success/error, queue lag, next run, quota usage/reserve/reset, checkpoint, complete/partial… | [048](../048-operational-dashboard.md) |
| 357 | Preserve the performance panel's layout. Audit its counting definitions: do not mix fixture counts with multi-market pred… | [049](../049-performance-metrics.md) |
| 363 | Keep the existing wide-table layout and do not increase the current row height. | [050](../050-desktop-match-rows.md) |
| 364 | Stack the date above kickoff time in one narrow column. Start with 12px text / 14px line-height and adjust against the ac… | [050](../050-desktop-match-rows.md) |
| 365 | Move the country flag/name and then the league logo/name left into the freed space. Give the league flexible width so few… | [050](../050-desktop-match-rows.md) |
| 366 | When truncation is unavoidable, provide full league text through an accessible tooltip/focus or equivalent interaction. | [050](../050-desktop-match-rows.md) |
| 370 | Remove the match sequence number and reclaim its space. | [051](../051-mobile-match-cards.md) |
| 371 | Stack date above time, keeping a compact two-line block. Move the league logo/name left into the newly available space. | [051](../051-mobile-match-cards.md) |
| 372 | Continue omitting the country from the mobile card; do not introduce another column. | [051](../051-mobile-match-cards.md) |
| 373 | Slightly strengthen small text using font weight, not an outline/stroke. Start with weight 500 for secondary information… | [051](../051-mobile-match-cards.md) |
| 374 | Preserve the existing card structure and avoid unnecessary additional height or horizontal scrolling. | [051](../051-mobile-match-cards.md) |
| 378 | Remove the live badge's background and border. Show compact status/time text with the pulsing dot immediately to its left… | [052](../052-status-display.md) |
| 380 | Use accurate provider-derived timing. If only minutes are supplied, display minutes rather than an invented second-by-sec… | [052](../052-status-display.md) |
| 384 | Implement the same server-side comparator for mobile and desktop, before pagination: | [053](../053-sorting-filters.md) |
| 386 | Live matches first, with the most advanced match phase/progress first: later live phases, then greater elapsed time/added… | [053](../053-sorting-filters.md) |
| 387 | Upcoming matches next, ordered by nearest scheduled kickoff ascending. | [053](../053-sorting-filters.md) |
| 388 | Overdue-unverified, postponed, suspended/nonactive and completed fixtures remain visible in clearly defined subsequent gr… | [053](../053-sorting-filters.md) |
| 390 | Set Live first as the default for a new/reset filter state. Preserve explicitly selected alternatives: probability high-t… | [053](../053-sorting-filters.md) |
| 392 | Test phase changes, missing times, extra time, cross-midnight fixtures and pagination so matches are not duplicated, lost… | [053](../053-sorting-filters.md), [058](../058-responsive-regression-tests.md) |
| 396 | Implement automated tests plus manual responsive checks covering at least: | [GLOBAL-RULES](GLOBAL-RULES.md) |
| 398 | Replaying the same response/job does not create duplicate fixtures, events, odds, jobs or predictions. | [055](../055-ingestion-resilience-tests.md) |
| 399 | An authoritative correction updates records and settlement; an older in-flight response cannot overwrite newer state. | [055](../055-ingestion-resilience-tests.md), [057](../057-publication-settlement-tests.md) |
| 400 | Fixture batches split correctly at 20/21 IDs; an odds page size of 10 is not confused with the fixture batch limit. | [055](../055-ingestion-resilience-tests.md) |
| 401 | All supported paginated endpoints continue to their last page; partial-page failures resume without repeating committed p… | [055](../055-ingestion-resilience-tests.md) |
| 402 | Shared fixture, player, league and team dependencies are fetched once per required freshness scope, not once per consumer. | [055](../055-ingestion-resilience-tests.md) |
| 403 | A crash before/after response persistence and during normalization/checkpointing recovers without skipping work or corrup… | [055](../055-ingestion-resilience-tests.md) |
| 404 | Minute-rate limits, daily exhaustion, HTTP-200 API errors and permission errors cause the correct pause/retry/alert behav… | [055](../055-ingestion-resilience-tests.md) |
| 405 | Today's and live jobs retain quota priority; backfill pauses and automatically resumes at the correct account reset. | [055](../055-ingestion-resilience-tests.md) |
| 406 | An overdue fixture remains unresolved, not falsely cancelled; it continues receiving checks after midnight. | [057](../057-publication-settlement-tests.md) |
| 407 | Public fixture coverage reconciles independently of missing predictions or odds; no arbitrary fixture-count cap remains. | [057](../057-publication-settlement-tests.md) |
| 408 | Missing head-to-head data can use valid indirect evidence; a wholly unsupported market abstains with a reason. | [056](../056-prediction-validation-tests.md) |
| 409 | A common-opponent chain and a player transfer affect estimates without becoming guaranteed conclusions or double-counted… | [056](../056-prediction-validation-tests.md) |
| 410 | AI failure/invalid output falls back to local, then API only for supported outputs; partial success is retained and sourc… | [056](../056-prediction-validation-tests.md) |
| 411 | Outcome-sum, double-chance, threshold, BTTS, joint-event, score-tail and push-settlement invariants hold. | [056](../056-prediction-validation-tests.md) |
| 412 | A reliable prediction without odds is visible; another bookmaker's price never receives the preferred bookmaker's label. | [056](../056-prediction-validation-tests.md), [057](../057-publication-settlement-tests.md) |
| 413 | New meaningful evidence triggers one fresh forecast; unchanged data and ordinary odds-only updates do not trigger unneces… | [056](../056-prediction-validation-tests.md) |
| 414 | A queue of at least 1,000 fixtures saves progress fixture by fixture, survives interruption, and does not stop after a su… | [056](../056-prediction-validation-tests.md) |
| 415 | Pre-match results are evaluated against forecasts actually issued beforehand; historical reconstruction and live forecast… | [056](../056-prediction-validation-tests.md), [057](../057-publication-settlement-tests.md) |
| 416 | Desktop row height does not increase; mobile numbering disappears; date/time stacking, league width, font weight and plai… | [058](../058-responsive-regression-tests.md) |
| 417 | Existing authentication, subscriptions, filters, pagination, match details, slips and unrelated routes keep working. | [058](../058-responsive-regression-tests.md) |
| 419 | Run tests with mocked/replayed provider responses before spending production quota. Measure proposed daily/minute request… | [055](../055-ingestion-resilience-tests.md), [059](../059-quota-capacity-check.md), [GLOBAL-RULES](GLOBAL-RULES.md) |
| 421 | Deploy with reversible migrations, backups, feature flags and a staged rollout. Validate representative live, upcoming, c… | [060](../060-staged-rollout.md) |
| 423 | Completion report: provide changed files, migrations/configuration, actual worker schedules, batching matrix, coverage/ma… | [061](../061-completion-report.md) |
| 429 | These references support provider mechanics and modeling methods. The application design, scheduling defaults, validation… | [GLOBAL-RULES](GLOBAL-RULES.md), [REFERENCES](REFERENCES.md) |
| 431 | R1 — API-Football v3 documentation: endpoint schemas, additional batch parameters, profiles/career endpoints, half statis… | [REFERENCES](REFERENCES.md) |
| 432 | R2 — API-Football, “How to Optimize API-Sports Calls and Quota Usage” (2026): coverage-aware requests, shared fetching, c… | [REFERENCES](REFERENCES.md) |
| 433 | R3 — API-Football, “How to Get All Data from a League with API-Football” (2026): league-season scope, coverage, team stat… | [REFERENCES](REFERENCES.md) |
| 434 | R4 — API-Football, “How to Get Started with API-Football: The Complete Beginner's Guide” (2026): forecasts, endpoint pagi… | [REFERENCES](REFERENCES.md) |
| 435 | R5 — API-Football, “How to Get All Fixtures Data from One League” (2024): enriched fixture requests and the 20-ID limit.… | [REFERENCES](REFERENCES.md) |
| 436 | R6 — API-Football, “FIFA World Cup 2026: Group Stage Recap and Complete Match Reports”: enriched fixture/statistical resp… | [REFERENCES](REFERENCES.md) |
| 437 | R7 — API-Football, “How to Get All Teams and Players from a League ID”: team/player traversal and complete player paginat… | [REFERENCES](REFERENCES.md) |
| 438 | R8 — API-Football terms, subscription-specific quota-reset sections: verify the actual subscription channel. https://www.… | [REFERENCES](REFERENCES.md) |
| 439 | R9 — Dixon and Coles (1997), “Modelling Association Football Scores and Inefficiencies in the Football Betting Market”: a… | [REFERENCES](REFERENCES.md) |
| 440 | R10 — scikit-learn, probability calibration documentation: reliability and probability evaluation. https://scikit-learn.o… | [REFERENCES](REFERENCES.md) |
| 441 | R11 — scikit-learn, TimeSeriesSplit documentation: avoiding future-to-past validation leakage; implement chronological fo… | [REFERENCES](REFERENCES.md) |
| 442 | User-supplied product reference: GoalHint screenshots of /en/matches, desktop/mobile filters, and /admin, dated 14 Novemb… | [REFERENCES](REFERENCES.md) |
| 443 | User-supplied market-vocabulary reference, not a verified complete catalog: https://gsb.ug/sportsbook/upcoming | [REFERENCES](REFERENCES.md) |
