# GoalHint — Production Improvement Implementation Prompt

## Objective and boundaries

Improve the **existing GoalHint Next.js application**, not a replacement application. Implement the following phases in order: audit → data contracts → imports and workers → odds → predictions → publication → interface → testing and rollout.

GoalHint is a **prediction and analysis platform**, not a staking platform. Maximize evidence-supported prediction coverage and prioritize estimated win probability over odds. Do not promise perfect predictions, guaranteed profits, or data the provider does not supply.

Preserve the existing stack, routes, authentication, subscription controls, unrelated features, and established visual design. Inspect the repository before choosing infrastructure or changing schemas. Reuse and repair existing components and workers instead of creating competing implementations. Do not disable paid access as part of this work.

**Source boundary:** These requirements come from the discussion and five supplied screenshots of the match lists, filters, and admin dashboard. No source code or market-definition file was supplied while this prompt was prepared. Therefore, investigate the current implementation rather than assuming how it works. API references are listed at the end. The GSB page was supplied as a market-vocabulary reference, but its dynamic market inventory was not readable during preparation; do not claim that its complete inventory has been verified.

**Implementation defaults:** Operational intervals, retry settings, and layout measurements below are proposed implementation defaults, not claims about existing behavior. Make them named configuration values with these defaults. Provider limits and actual account permissions take precedence. Document any necessary deviation with evidence; do not silently omit requirements.

---

## 1. Audit the existing application and establish the baseline

1. Trace the complete path: provider request → raw response → normalized records → prediction engines → publication query → API response → rendered match.
2. Locate existing workers, schedules, queues, locks, API clients, caching, pagination, market registries, bookmaker mappings, prediction adapters, settlement rules, and admin counters.
3. Investigate the screenshot showing **1,008 stored fixtures, 1,008 in public scope, but 674 published**: reconcile the **334-fixture difference** by fixture ID and explicit exclusion reason. Do not assume that a missing prediction should exclude a fixture.
4. Investigate the visible **“Import failed,” “No recent imports,” “Waiting on quota,”** and unavailable odds-mapping states. Inspect actual logs, response errors, credentials configuration, endpoint parameters, pagination, and quota allocation. Screenshots identify symptoms, not root causes.
5. Trace matches that remain “upcoming” after their scheduled kickoff. Check timezone conversion, provider coverage, missing refresh jobs, cache invalidation, incorrect status mapping, and delayed provider updates.
6. Trace repeated **double-chance selections and 90% probabilities** to their source. Determine whether they are genuine provider values, incorrect mappings, fixed defaults, or a selection bias. Never replace them with different invented percentages.
7. Record baseline API usage, data coverage, worker lag, publication counts, prediction availability, and desktop/mobile screenshots before making changes.

Deliver an audit-to-requirement map naming the actual files and functions to modify. Continue into implementation; do not stop at an audit report.

## 2. Establish a complete provider-data inventory

### 2.1 Inventory rules

Create a versioned endpoint-and-field manifest from the current API-Football documentation and actual permitted response schemas. Include every supported endpoint, parameter combination needed for coverage, pagination rule, batch limit, scope, freshness rule, and historical limitation.

**The checklist below is a minimum inventory, not permission to discard other returned fields.** Preserve complete successful response payloads in durable, access-controlled storage, excluding credentials. Normalize useful fields, retain unknown nested fields, and flag schema changes. Every documented response field must be accounted for as normalized, retained raw, unavailable, or not applicable—with a reason.

Use provider IDs and explicit league/season/team/fixture/player relationships. Do not confuse current entity information with historical information applicable at an earlier kickoff.

### 2.2 Endpoint checklist

Implement or verify each applicable endpoint below. Consult references R1–R7 for endpoint structure and usage. Do not invent endpoints for data absent from the provider.

| Dataset | Endpoint(s) | Required ingestion scope |
|---|---|---|
| Account and usage | `/status` | Subscription/access information and request usage; keep account details admin-only. |
| Time references | `/timezone` | Supported timezone identifiers. |
| Country catalogs | `/countries`, `/teams/countries` | Both catalogs; retain their distinct purposes. |
| Competitions and seasons | `/leagues`, `/leagues/seasons` | All accessible competitions, available seasons, coverage, and season boundaries. |
| Teams | `/teams`, `/teams/seasons` | Team profiles, competition membership, available seasons, and venue associations. |
| Team aggregates | `/teams/statistics` | Each accessible team–competition–season combination; dated snapshots where supported. |
| Stadiums | `/venues` | Venue profiles and media references. |
| Tables | `/standings` | All groups and table sections, not just the first group. |
| Rounds | `/fixtures/rounds` | Round identifiers and available round dates. |
| Fixtures | `/fixtures` | Schedules, participants, scores, periods, statuses, and enriched fixture responses. |
| Direct history | `/fixtures/headtohead` | Relevant team-pair history; reuse equivalent local fixture history first. |
| Match statistics | `/fixtures/statistics` | Full-match statistics and supported half-specific statistics using `half=true`. |
| Match events | `/fixtures/events` | Complete timelines, including corrections and VAR events. |
| Lineups | `/fixtures/lineups` | Formations, starters, substitutes, positions, coaches, and other supplied lineup fields. |
| Player match statistics | `/fixtures/players` | Every available player and statistical field for each covered fixture. |
| Absences | `/injuries` | Fixture-related injury and suspension information. |
| Provider forecasts | `/predictions` | All supplied prediction and comparison fields, not only double chance. |
| Coaches | `/coachs` | Profiles and dated career associations; preserve the provider's endpoint spelling. |
| Player availability catalogs | `/players/seasons`, `/players/profiles` | Available statistical seasons and the complete paginated player-profile catalog. |
| Player season statistics | `/players` | All pages for every accessible relevant competition/season; preserve multiple team stints. |
| Current squads | `/players/squads` | Current squad associations; do not label these historical lineups. |
| Player career teams | `/players/teams` | Available team and season associations for each player. |
| Player rankings | `/players/topscorers`, `/players/topassists`, `/players/topyellowcards`, `/players/topredcards` | All four ranking datasets; do not use rankings as a substitute for the complete player population. |
| Transfers | `/transfers` | Player/team transfer histories and dated origin/destination relationships. |
| Achievements | `/trophies` | Available player and coach records. |
| Historical absences | `/sidelined` | Available player/coach absence records. |
| Bookmakers | `/odds/bookmakers` | Complete available bookmaker catalog. |
| Pre-match markets | `/odds/bets` | Complete pre-match market catalog. |
| Odds availability mapping | `/odds/mapping` | All available mapping pages. |
| Pre-match prices | `/odds` | All available bookmakers, markets, outcomes, lines, and pages for the requested fixtures/date scope. |
| Live market catalog | `/odds/live/bets` | Separate live-market identifiers and definitions. |
| Live prices | `/odds/live` | Available live selections, lines, prices, and availability/status flags. |

### 2.3 Field-level coverage checklist

For each applicable record, retain all returned properties, including these families. These are ingestion requirements; availability must be checked rather than assumed. References R1, R3, R4, R6, and R7 provide the underlying response structures.

- **Identity/context:** provider IDs; names and aliases; country/code/flag; competition type/logo; season, dates, round and group; coverage flags; team code, founding year and national-team flag; venue name, address, city, capacity, surface and image.
- **Fixture:** date, UTC timestamp, timezone, referee, venue, home/away teams, period timestamps, status code/description, elapsed/added time, winner flags, current goals, halftime/full-time/extra-time/penalty scores, and update metadata where supplied.
- **Standings/team season:** position, points, goal difference, form and table movement; home/away/overall played, won, drawn and lost; goals for/against and averages; scoring/conceding intervals; total-goal thresholds; clean sheets, failures to score, streaks, biggest results, penalties, formations and discipline distributions where supplied.
- **Team match statistics:** shots by supplied category, chances/expected-goal statistics where actually returned, possession, passes and accuracy, fouls, corners, offsides, cards, goalkeeper saves, and each available period-specific breakdown. Preserve statistical names and units.
- **Events/lineups:** event time and added time, team, player, assist, event type/detail/comments; goals and reversals, penalties, cards, substitutions and VAR; formation, starters, bench, shirt numbers, positions/grid, coach and colors where returned.
- **Player:** identity, birth details, nationality, physical/profile fields and photo; team/competition/season associations; appearances, starts, minutes, position, rating, captain/substitution information; shots, goals, assists, conceded goals, saves, passes, tackles, blocks, interceptions, duels, dribbles, fouls, cards and penalty statistics where supplied.
- **Career/availability:** transfer dates/types and both teams; coach career dates; injury/suspension type, reason and dates; trophies and placement; squad/career associations with their actual temporal scope.
- **Forecasts/prices:** provider advice and numeric forecasts where supplied, comparison components and source history; bookmaker identity when present, market/outcome IDs, raw labels, handicaps/lines, decimal prices, provider update time, observation time, and suspension/main-selection flags.

Do not claim that API-Football supplies news, weather, tactical assessments, manager ratings, or psychological states as standard fields. Use existing authorized external sources only when genuinely available, attributable, and timestamped. Derived metrics must be labeled derived. Never invent a player's mental state.

### 2.4 Coverage and completeness

Track state per **resource + scope + endpoint + page/section**, using:

`not_requested | queued | fetching | complete | partial | unavailable | not_applicable | retryable_failure | blocked_by_quota | blocked_by_access`.

Record reasons, attempts, timestamps, last successful response, next retry, and known remaining work. A successful empty response is not automatically an error, proof of permanent unavailability, or proof that the entire date is complete. Validate parameters, API body errors, coverage, timing, and pagination first. Coverage is specific to competition and season and is not a guarantee for every match. [R2, R3]

## 3. Build one shared, idempotent ingestion layer

All four logical workers must share the same provider client, request scheduler, cache, quota accounting, and durable job infrastructure.

1. **Deduplicate requests:** use a canonical key containing provider, endpoint, normalized parameters, page, and freshness window. Coalesce identical in-flight requests across workers. Reuse already-stored team, league, player, and venue data.
2. **Deduplicate records:** enforce database uniqueness using stable provider IDs or documented composite keys. Use transactional upserts and content hashes. Do not append duplicates on retries.
3. **Preserve corrections:** idempotency must not prevent legitimate score, event, lineup, or schedule corrections. Merge partial responses without erasing known data merely because a field was omitted. Treat explicit authoritative corrections separately.
4. **Persist before advancing:** durably save each validated response/receipt, then transactionally update normalized data and the checkpoint. A restart should replay a stored response rather than repeat its API call when possible.
5. **Prevent overlapping jobs:** durable leases, heartbeats, ownership/fencing checks, and unique active job keys. Expired workers must not overwrite newer committed work.
6. **Maintain temporal integrity:** store event time, provider update time where available, observation time, and the evidence version. Keep UTC in storage; use `Africa/Kampala` for the default local-day scope and display.
7. **Separate freshness from change:** an unchanged response updates the last-checked timestamp but does not trigger a new forecast. Exclude request timestamps and cosmetic metadata from prediction evidence hashes.
8. **Do not equate missing with zero:** preserve nullability. An unknown score/statistic is not 0; missing odds are not 0.00.
9. **No frontend provider calls:** browsers read GoalHint's database/cache. API keys stay server-side and out of logs and AI prompts.
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
- If the plan cannot sustain the workload, pause backfill first, then reduce enrichment frequency. Degrade live polling from **60 → 120 → 300 seconds** only as needed; show actual freshness and raise an admin capacity warning. Do not claim unchanged accuracy/freshness under insufficient quota.
- Network/temporary server failures: retry after **5, 30, then 120 seconds**, with up to 10% positive jitter. Then persist the failure and retry after **one hour**. Respect a longer provider `Retry-After`.
- For rate limits, distinguish short-window throttling from daily exhaustion. Daily exhaustion pauses eligible jobs until the verified reset plus **15 seconds**; do not repeatedly probe an exhausted quota.
- Authentication, access, and invalid-parameter errors require configuration correction, not endless retries. Check the JSON `errors` field even on HTTP 200.
- Run workers as supervised server processes or durable scheduled jobs suitable for the existing deployment. They must not depend on a browser tab, an open admin page, or a long-running web request.

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

## 6. Upgrade the prediction mechanism

### 6.1 Define triangulation correctly for this project

**Triangulation means connecting and combining relevant direct and indirect evidence to estimate an outcome when evidence is diverse or incomplete. It does not mean only checking the same fact against independent sources.**

Examples include team A's and B's direct history; their performance against common opponents; wider opponent-strength relationships; player performance before and after transfers; lineup availability; changes in coach, formation or venue; and season, home/away and timing patterns. These examples are not an exhaustive feature list.

If A performed well against C, and C performed well against B, that can inform A-versus-B analysis. It **does not prove** that A must beat B. A transferred striker's past goals can inform a new team's attack, but those goals do not automatically transfer unchanged to the new team.

### 6.2 Build one evidence representation per fixture

1. Read every relevant available dataset, not merely head-to-head matches. Organize evidence by team, player, coach, opponent, competition, season, venue, period and observation time.
2. Evaluate direct history, recent and longer-term form, opponent-adjusted attacking/defensive strength, table context, home/away/neutral performance, scoring/conceding timing, player roles and expected minutes, availability, transfers, goalkeeper performance, discipline, rest, scheduling, coach/formation changes, and supported contextual information.
3. Build reusable relationship features from the historical match graph. Use regularized team/opponent strength estimates across connected fixtures, rather than endless recursive A→C→D comparisons or assumed transitive wins.
4. Track provenance and avoid double-counting the same match as direct history, common-opponent evidence, and a season aggregate. Distinguish independent observations from multiple summaries of one observation.
5. Weight relevance, recency, sample size, competition comparability, venue, roster continuity, source quality, and missingness. Learn or validate numerical weights; do not invent universal weights that merely produce confident-looking outputs.
6. Missing head-to-head history alone must not block a prediction. Evidence for an apparently missing team may exist in opponent fixtures, player histories or the wider model. If there is genuinely no reliable signal for that team/market, use a validated prior with disclosed uncertainty or abstain.
7. Produce a bounded, structured evidence package with source-record references. Do not send unrestricted raw archives, secrets, or unrelated account data to an AI service. Treat imported news/text as untrusted data, never as executable instructions.

### 6.3 Keep probability, confidence, and ranking distinct

- **Win probability:** the model's estimated chance of the specified outcome under that market's settlement rules.
- **Evidence/model confidence:** reliability of that estimate, considering support, completeness, freshness, disagreement, domain fit and measured calibration.
- **Ranking score:** an internal selection aid, if needed; never label it probability or use it to silently override the required ranking order.

Low confidence does not automatically mean a low probability. For example, a likely outcome can still have an uncertain probability estimate. Do not multiply probability by a made-up confidence percentage. Store uncertainty/support diagnostics; label any confidence score as a model-reliability measure, not another chance of winning.

Define versioned, market-specific evidence gates and validate thresholds on held-out data. Do not require every optional field, use one universal minimum-match count, or consider team names and kickoff alone sufficient evidence.

### 6.4 Preserve the requested engine priority

Use **AI → local engine → API-Football predictions**.

1. Attempt the configured AI engine when available and suitable for the market family.
2. Validate its structured response, evidence grounding, numerical coherence, model provenance, and calibration/quality eligibility.
3. On failure, timeout, missing capability, or invalid/unreliable output, try the local engine for the affected market family.
4. If local support fails, use the provider forecast only for outcomes it actually supports and for which a defensible probability is available.
5. If none qualifies, store an explicit abstention reason. Do not invent a prediction to make the catalog look complete.

Fallback should preserve successful independent market families rather than discard an entire fixture. However, coupled probabilities must come from one coherent distribution or pass reconciliation checks; do not combine contradictory AI/local/API outputs.

For the API adapter, preserve the documented meaning of every field: `win_or_draw` is a flag, not a probability; home/draw/away percentages refer to those outcomes; signed goal/under-over strings may describe thresholds, not expected-goal means. Derive double-chance probability only from compatible outcome probabilities. Advice without a defensible numeric probability can be shown as provider advice, but must not receive a fabricated percentage or enter probability-based ranking.

An AI language model's unsupported percentage is not a validated probability. AI may structure evidence, produce bounded sourced adjustments, explain results, or invoke a validated numerical model. Without a supported numerical basis, it must defer. Label the actual source honestly; local calculations explained by AI remain locally calculated.

Use a **60-second AI-call timeout**, one transient retry, then local fallback. After **five consecutive provider-level AI failures**, open a **10-minute circuit breaker** and use local/API during that period. Log engine transitions and per-market reasons.

### 6.5 Local numerical mechanism

Audit the existing local mechanism. Retain proven working components, but ensure the following explicit modeling capabilities or document a validated equivalent:

1. **Result/goal baseline:** fit regularized, time-weighted attack/defense parameters with opponent strength, competition context and home advantage. Use a Poisson score model with an appropriate low-score dependence correction, such as Dixon–Coles, as the baseline—not a guarantee of superior performance. Compare alternatives through chronological validation. [R9]
2. **Sparse-data handling:** use hierarchical/league priors and shared-opponent information with uncertainty. Connected history should influence team strengths; do not turn a single indirect chain into certainty.
3. **Coherent goal distribution:** generate a joint distribution of home/away goals. Extend the score grid until omitted probability mass is below **0.000001**, or explicitly retain a tail bucket. Derive result, double chance, totals, team totals, BTTS, correct scores, goal ranges and compatible handicap markets from this shared distribution.
4. **Half/time markets:** fit period-aware scoring using actual period/event history. Derive half/full-time and combination markets from a joint time/score model or simulation that preserves dependence. Do not simply halve full-time rates or multiply correlated marginal probabilities without validation.
5. **Player scoring:** model expected participation/minutes, role, scoring contribution, penalties where evidenced, team scoring environment and opposing defense. Represent lineup uncertainty. Do not force a player forecast when participation or historical evidence is insufficient.
6. **Cards/corners/other statistics:** use separate suitable count/event models with their own historical inputs and validation. Do not estimate cards, corners or player bookings from the goal model. Missing relevant models/data means unsupported, not fabricated coverage.
7. **Context adjustments:** integrate verified injuries, transfers, formations and related features with learned or validated effects and limits. Derived referee/coach trends need real historical support; no invented provider ratings.
8. **Calibration:** validate with time-ordered holdouts, appropriate probability calibration, reliability curves, Brier score and log loss, alongside coverage and abstention. Use only evidence available before the forecast time; avoid future-data leakage. [R10, R11]

Training/calibration may run as maintenance jobs managed by the prediction infrastructure; do not retrain the entire model for every fixture. Version all fitted models and feature definitions. A market without a tested model must not be advertised as validated.

### 6.6 Shared market registry and per-market evaluation

Use one **versioned market-definition registry across fixtures**. Each entry defines period, selection set, line/player/team parameters, settlement rules, evidence needs, model capability, source mappings, and display name. The registry is shared; applicable players, lines, available odds and supported predictions vary by fixture.

Reconcile the existing registry with API catalogs. Enumerate every catalog entry and map it explicitly, marking unsupported/unmapped entries with reasons rather than silently dropping them. Do not guess the contents of an unprovided market file.

Evaluate these families wherever the required evidence and models support them:

| Family | Required variants to consider |
|---|---|
| Results | Full-time home/draw/away; supported first-half and second-half results. |
| Double chance | Home/draw, home/away, draw/away for supported periods. |
| Draw no bet/handicaps | Supported draw-no-bet, European and Asian lines, with push/partial-settlement rules. |
| Total goals | Over/under **0.5, 1.5, 2.5, 3.5, 4.5 and 5.5**, plus other legitimate registered lines; handle integer/quarter lines correctly. |
| Team goals | Each team's supported totals, scoring yes/no and clean-sheet markets. |
| BTTS / goal-goal | Yes/no at full time and supported half-specific variants. |
| Correct score/ranges | Full-time and supported half scores; exact totals and registered bands such as 1–2, 1–3 or 1–4. |
| Half relationships | Highest-scoring half including equal; half-time/full-time outcomes; supported scoring-in-both-halves variants. |
| Combined outcomes | Result/double chance with goals, BTTS with totals, and other mapped combinations using their joint probability. |
| Players | Anytime/first/last scorer, player goal totals, assists, shots or bookings only with suitable models and participation evidence. |
| Discipline/set pieces | Team/match corners, cards, red cards and relevant handicaps/periods where supported. |
| Other catalog markets | Register, map and evaluate with an appropriate model or give an explicit unsupported reason. |

For each supported **parameterized market**, compute its outcome distribution and choose the highest-probability supported outcome. For example, over/under 1.5 and over/under 2.5 are separate market instances. A recommended pick is not a claim that it is highly likely; correct-score markets can have low top probabilities.

Keep the following probability invariants:

- Every probability is finite and within [0, 1]. Mutually exclusive, exhaustive outcomes sum to 1 within numerical tolerance.
- `P(1X) = P(home win) + P(draw)`. The three double-chance selections overlap; do not normalize them to sum to 1.
- Goal-threshold probabilities are monotone: `P(over 1.5) >= P(over 2.5) >= P(over 3.5)`.
- Under the same period/settlement rules, BTTS implies at least two goals, so `P(over 1.5) >= P(BTTS yes)`.
- Combination probabilities cannot exceed either component probability.
- Push/no-action/half-win/half-loss possibilities remain separate from outright win probability where applicable.
- Correct scores, ranges, half results and player-related forecasts must not contradict the underlying modeled scenario definitions.

Never fabricate unrealistic new goal lines solely to obtain near-100% recommendations. Legitimate registered markets can be predicted without current bookmaker odds, but must have clear, meaningful settlement definitions.

### 6.7 Top pick, stored output, and historical integrity

For each supported market save: fixture ID, market key/parameters, recommended selection, outcome probabilities, confidence/support diagnostics, optional uncertainty interval, explanation/evidence references, engine/model version, evidence hash/cutoff, generation time, forecast type, and status. Join odds separately with source and timestamp. Save unavailable-market reasons as well.

Choose the match-card recommendation from eligible supported predictions by **estimated win probability descending**, then **confidence**, then available comparable odds only as a final tie-break, followed by a stable market/selection key. Do not force double chance, artificial diversity, minimum odds, or fixed 90% probabilities. Diversity should follow the evidence, not a quota for different market labels.

Match details must expose every supported market's pick, probability, confidence and available bookmaker prices. Unsupported markets may show an explanation but no invented percentage.

Freeze and retain each published pre-match forecast version. If live forecasting exists or is added within the approved scope, store and label it separately, conditioned on current time/score. Never overwrite a pre-match forecast with hindsight, silently change its outcome after kickoff, or count post-event forecasts as successful pre-match predictions.

For slips, retain existing functionality but do not claim that many low-odds selections are collectively safe. Multiplying probabilities assumes independence; correlated selections require dependence-aware handling. Do not promise that a target combined odd can also achieve a guaranteed hit rate.

## 7. Repair publication, settlement, and admin visibility

1. **Fixture visibility and prediction availability are separate.** Publish every valid fixture in the intended public scope even when optional data, odds or a reliable forecast are missing. Show the appropriate unavailable/awaiting-data state while preserving subscription restrictions on protected content.
2. Do not block all publication until all 1,000 fixtures have been predicted. Publish and update incrementally as each fixture/data section becomes ready.
3. Use distinct fields for provider match status, data freshness, forecast availability, publication state, and prediction settlement. “Pending prediction result” is not the same as “upcoming match.”
4. A scheduled kickoff passing must not automatically produce void, cancellation, loss, or completion. Show an awaiting-update state where appropriate while retaining the source status and next check.
5. Settle predictions from authoritative outcomes and exact market rules, including period boundaries, extra-time exclusions, pushes, VAR corrections and player participation conditions. Handle provider corrections idempotently.
6. Keep distinct admin totals for discovered, stored, public-scope, visible, prediction-ready, priced, awaiting data, and excluded fixtures. Every excluded ID must have a reason. Reconcile the original 334-fixture gap without hardcoding the screenshot's counts.
7. Report worker heartbeat, last success/error, queue lag, next run, quota usage/reserve/reset, checkpoint, complete/partial/unavailable sections, odds freshness and market-mapping coverage. Do not claim a complete import when only its first page or fixture list was saved.
8. Preserve the performance panel's layout. Audit its counting definitions: do not mix fixture counts with multi-market prediction counts or label wins/all fixtures as a resolved-pick hit rate. Any metric wording change must make the denominator explicit.

## 8. Apply the agreed desktop and mobile improvements

### 8.1 Desktop match rows

- Keep the existing wide-table layout and **do not increase the current row height**.
- Stack the **date above kickoff time** in one narrow column. Start with **12px text / 14px line-height** and adjust against the actual existing row height; the objective is two readable lines within the previous vertical space, not blindly halving text into unreadability.
- Move the country flag/name and then the league logo/name left into the freed space. Give the league flexible width so fewer names truncate. Preserve team, score, prediction, odds and probability information.
- When truncation is unavoidable, provide full league text through an accessible tooltip/focus or equivalent interaction.

### 8.2 Mobile match cards

- Remove the match sequence number and reclaim its space.
- Stack date above time, keeping a compact two-line block. Move the league logo/name left into the newly available space.
- Continue omitting the country from the mobile card; do not introduce another column.
- Slightly strengthen small text using font weight, not an outline/stroke. Start with weight **500** for secondary information and **600** for key values; retain hierarchy and confirm legibility on real mobile widths.
- Preserve the existing card structure and avoid unnecessary additional height or horizontal scrolling.

### 8.3 Status on both layouts

Remove the live badge's background and border. Show compact status/time text with the pulsing dot immediately to its left, starting with a **4px gap**, without the old badge's excess padding.

Use accurate provider-derived timing. If only minutes are supplied, display minutes rather than an invented second-by-second clock. Freeze clocks for halftime/interruption and label statuses correctly. Respect reduced-motion preferences and provide a non-color-only status label.

### 8.4 Shared default sorting

Implement the same server-side comparator for mobile and desktop, **before pagination**:

1. Live matches first, with the most advanced match phase/progress first: later live phases, then greater elapsed time/added time. Missing-progress live matches follow live matches with known progress. Use a stable fixture-ID tie-break.
2. Upcoming matches next, ordered by nearest scheduled kickoff ascending.
3. Overdue-unverified, postponed, suspended/nonactive and completed fixtures remain visible in clearly defined subsequent groups; document their stable ordering and preserve explicit status filters. Do not disguise overdue fixtures as future upcoming matches.

Set **Live first** as the default for a new/reset filter state. Preserve explicitly selected alternatives: probability high-to-low, probability low-to-high, earliest first and latest first. Preserve match-status, date/time, league, country, probability, odds and recommended-only controls.

Test phase changes, missing times, extra time, cross-midnight fixtures and pagination so matches are not duplicated, lost, or differently ordered across devices.

## 9. Tests, acceptance criteria, and rollout

Implement automated tests plus manual responsive checks covering at least:

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
13. AI failure/invalid output falls back to local, then API only for supported outputs; partial success is retained and source labels remain accurate.
14. Outcome-sum, double-chance, threshold, BTTS, joint-event, score-tail and push-settlement invariants hold.
15. A reliable prediction without odds is visible; another bookmaker's price never receives the preferred bookmaker's label.
16. New meaningful evidence triggers one fresh forecast; unchanged data and ordinary odds-only updates do not trigger unnecessary AI runs.
17. A queue of at least **1,000 fixtures** saves progress fixture by fixture, survives interruption, and does not stop after a subset or one bad fixture.
18. Pre-match results are evaluated against forecasts actually issued beforehand; historical reconstruction and live forecasts are not counted as pre-match wins.
19. Desktop row height does not increase; mobile numbering disappears; date/time stacking, league width, font weight and plain live status work in light/dark modes and at **360, 390, 412, 768, 1280 and 1440px** widths.
20. Existing authentication, subscriptions, filters, pagination, match details, slips and unrelated routes keep working.

Run tests with mocked/replayed provider responses before spending production quota. Measure proposed daily/minute request demand using actual fixture volumes and the configured plan. Report infeasible freshness targets instead of silently exhausting quota.

Deploy with reversible migrations, backups, feature flags and a staged rollout. Validate representative live, upcoming, completed, sparse-data and odds-missing fixtures before enabling globally. Observe the first hourly cycle and backfill checkpoint/resume cycle.

**Completion report:** provide changed files, migrations/configuration, actual worker schedules, batching matrix, coverage/mapping manifest, explained publication exclusions, before/after quota estimates, test results, measured forecasting validation, remaining provider limitations, and exact rollback/run commands. Do not claim live-site fixes or improved forecasting accuracy without verification.

---

## Reference notes for the implementing agent

These references support provider mechanics and modeling methods. The application design, scheduling defaults, validation policy, and acceptance criteria above are implementation requirements—not provider guarantees. Recheck the current documentation and account access during implementation.

- **R1 — API-Football v3 documentation:** endpoint schemas, additional batch parameters, profiles/career endpoints, half statistics and status semantics. `https://www.api-football.com/documentation-v3`
- **R2 — API-Football, “How to Optimize API-Sports Calls and Quota Usage” (2026):** coverage-aware requests, shared fetching, caching and quota control. `https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage`
- **R3 — API-Football, “How to Get All Data from a League with API-Football” (2026):** league-season scope, coverage, team statistics, standings and complete response validation. `https://www.api-football.com/news/post/how-to-get-all-data-from-a-league-with-api-football`
- **R4 — API-Football, “How to Get Started with API-Football: The Complete Beginner's Guide” (2026):** forecasts, endpoint pagination, odds namespaces/retention and refresh behavior. `https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide`
- **R5 — API-Football, “How to Get All Fixtures Data from One League” (2024):** enriched fixture requests and the 20-ID limit. `https://www.api-football.com/news/post/how-to-get-all-fixtures-data-from-one-league`
- **R6 — API-Football, “FIFA World Cup 2026: Group Stage Recap and Complete Match Reports”:** enriched fixture/statistical response structure; this prompt does not rely on the article's tournament-result narrative. `https://www.api-football.com/news/post/fifa-world-cup-2026-group-stage-recap-and-complete-match-reports-with-api-football`
- **R7 — API-Football, “How to Get All Teams and Players from a League ID”:** team/player traversal and complete player pagination. `https://www.api-football.com/news/post/how-to-get-all-teams-and-players-from-a-league-id`
- **R8 — API-Football terms, subscription-specific quota-reset sections:** verify the actual subscription channel. `https://www.api-football.com/terms`
- **R9 — Dixon and Coles (1997), “Modelling Association Football Scores and Inefficiencies in the Football Betting Market”:** a baseline modeling reference, not evidence of GoalHint's performance. `https://academic.oup.com/jrsssc/article-abstract/46/2/265/6990546`
- **R10 — scikit-learn, probability calibration documentation:** reliability and probability evaluation. `https://scikit-learn.org/stable/modules/calibration.html`
- **R11 — scikit-learn, TimeSeriesSplit documentation:** avoiding future-to-past validation leakage; implement chronological football-data splits appropriate to the dataset rather than assuming equally spaced fixtures. `https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit`
- **User-supplied product reference:** GoalHint screenshots of `/en/matches`, desktop/mobile filters, and `/admin`, dated 14 November 2026. Live source code was not inspected during prompt preparation.
- **User-supplied market-vocabulary reference, not a verified complete catalog:** `https://gsb.ug/sportsbook/upcoming`
