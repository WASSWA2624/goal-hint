# 003 — Define lossless, temporal provider-data contracts

**Phase:** Data contracts  
**Key prerequisites:** [001 — Audit the existing application and record the baseline](001-audit-baseline.md); [002 — Build the versioned provider endpoint inventory](002-endpoint-inventory.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R1, R3, R4, R6, R7** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Extend the existing data contracts and necessary reversible schema changes so provider responses can be retained without losing fields, identity relationships or historical meaning.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Retention and relationships

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 33–35.*

**The checklist below is a minimum inventory, not permission to discard other returned fields.** Preserve complete successful response payloads in durable, access-controlled storage, excluding credentials. Normalize useful fields, retain unknown nested fields, and flag schema changes. Every documented response field must be accounted for as normalized, retained raw, unavailable, or not applicable—with a reason.

Use provider IDs and explicit league/season/team/fixture/player relationships. Do not confuse current entity information with historical information applicable at an earlier kickoff.

### Required field families

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 78–89.*

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

### Time and null semantics

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 108–110.*

6. **Maintain temporal integrity:** store event time, provider update time where available, observation time, and the evidence version. Keep UTC in storage; use `Africa/Kampala` for the default local-day scope and display.
7. **Separate freshness from change:** an unchanged response updates the last-checked timestamp but does not trigger a new forecast. Exclude request timestamps and cosmetic metadata from prediction evidence hashes.
8. **Do not equate missing with zero:** preserve nullability. An unknown score/statistic is not 0; missing odds are not 0.00.

## Scope boundary

Implement data contracts and storage shape, not scheduled fetching or predictive models. Do not add unsupported provider fields or choose a new stack.

## Acceptance checks

- [ ] Account for each documented field as normalized, retained raw, unavailable or not applicable, with a reason; retain unknown nested fields and detect schema changes.
- [ ] Define access-controlled raw-response storage, stable provider relationships and event/provider/observation timestamps with UTC storage and Kampala day/display semantics.
- [ ] Distinguish omitted values, explicit corrections, nulls and actual zero values; define meaningful evidence hashes separately from last-checked metadata.
- [ ] Keep current squads and other current facts distinct from legitimate historical as-of evidence; document reversible migrations against the inspected schema.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [004 — Implement resource-level completeness tracking](004-completeness-ledger.md).
