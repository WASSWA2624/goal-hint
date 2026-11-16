# 002 — Build the versioned provider endpoint inventory

**Phase:** Data contracts  
**Key prerequisites:** [001 — Audit the existing application and record the baseline](001-audit-baseline.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R1–R8** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Create or repair the endpoint-and-field manifest that defines the accessible provider surface before any new ingestion work is enabled.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Inventory rules

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 31, 39.*

Create a versioned endpoint-and-field manifest from the current API-Football documentation and actual permitted response schemas. Include every supported endpoint, parameter combination needed for coverage, pagination rule, batch limit, scope, freshness rule, and historical limitation.

Implement or verify each applicable endpoint below. Consult references R1–R7 for endpoint structure and usage. Do not invent endpoints for data absent from the provider.

### Minimum endpoint inventory

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 41–42, 43–74.*

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

## Scope boundary

This task defines the inventory. Endpoint implementations are separate tasks. Verify current provider documentation and actual account access during implementation; the bundled references have not been independently refreshed by this file split.

## Acceptance checks

- [ ] Enumerate every documented, permitted endpoint and required parameter scope; the supplied checklist is a minimum, not a maximum.
- [ ] Record pagination, batching, access, freshness and historical limits with documentation/schema evidence and explicit unknowns.
- [ ] Link every endpoint to its intended importer or a documented unavailable/not-applicable reason, without inventing endpoints.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md).
