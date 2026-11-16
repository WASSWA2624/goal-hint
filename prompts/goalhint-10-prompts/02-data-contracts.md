# 02 — Establish the shared data contracts

**Step:** 2 of 10  
**Key prerequisites:** [01-audit-baseline.md](01-audit-baseline.md)  
**Original source:** Section 2; the registry contract in Section 6.6

## Focused task

Create or repair the versioned provider inventory, lossless record contracts, completeness ledger, and shared market-definition contract that all later components will use.

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

Use the audit to extend existing schemas and types rather than creating competing records. Inventory every applicable endpoint and field; define relationships, raw-payload retention, nullability, temporal scope, uniqueness requirements, and resource/page/section completion tracking. Implement the necessary contract/schema changes with reversible migrations where required.

Establish the shared versioned market registry now, before its consumers. Consult the market families and invariants in 07 when defining its schema; declaring a family does not mean a validated model exists. Record unsupported/unmapped states explicitly and do not guess an unavailable market file.

This step owns contracts and inventory, not the provider execution pipeline. In 03, implement the endpoint handlers and durable fetching machinery against these contracts; in 05, populate and reconcile odds mappings; in 06–07, implement model capability and market evaluation. The source's requirement to implement or verify every applicable endpoint remains mandatory across those named steps.

## Original requirements

The following text retains the supplied requirements and their original section numbers. Implement this file’s assigned scope; references to later consumers are fulfilled by the named later files, not by inventing substitute behavior.

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

### 6.6 Shared market registry and per-market evaluation

Use one **versioned market-definition registry across fixtures**. Each entry defines period, selection set, line/player/team parameters, settlement rules, evidence needs, model capability, source mappings, and display name. The registry is shared; applicable players, lines, available odds and supported predictions vary by fixture.

## Acceptance checks

- [ ] Account for every listed endpoint and field family, plus any additional permitted documented fields, as normalized, retained raw, unavailable, or not applicable with a reason.
- [ ] Represent provider IDs, entity relationships, historical versus current context, unknown nested properties, and null/missing values without information loss.
- [ ] Implement all named completeness states with endpoint/scope/page/section granularity, attempts, reasons, timestamps, retries, and remaining work.
- [ ] Define one versioned market contract for period, selections, line/player/team parameters, settlement, evidence/capability, mappings, and display labels; keep fixture-specific applicability separate.
- [ ] Supply the manifest, actual schema/type changes, migration/rollback instructions where applicable, and adapter contracts needed by 03.

## Handoff

Return the actual changed files or produced artifacts, commands/checks run and their results, configuration/migration changes, evidence-backed deviations, remaining limitations or blockers, and the inputs needed by the next step. Record them in the project's existing handoff/report location so 10 can compile the final completion report. Do not mark planned, blocked, untested, or unobserved work as verified.

**Next:** [03-shared-ingestion.md](03-shared-ingestion.md).

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

- **User-supplied market-vocabulary reference, not a verified complete catalog:** `https://gsb.ug/sportsbook/upcoming`
