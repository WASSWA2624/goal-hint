# 017 — Implement complete fixture-scoped data ingestion

**Phase:** Endpoint ingestion  
**Key prerequisites:** [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md); [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [008 — Persist responses and normalize them idempotently](008-transactional-ingestion.md); [009 — Coalesce requests and reuse fresh shared responses](009-shared-fetch-cache.md); [010 — Implement documented batching and resumable pagination](010-batching-pagination.md); [014 — Implement reference and competition catalog ingestion](014-catalog-imports.md); [015 — Implement team and venue identity ingestion](015-entity-imports.md); [016 — Implement complete standings and team-statistics ingestion](016-team-context-imports.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R1, R3, R5, R6** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Implement or repair the fixture importer and its supported enrichment handlers, reusing included data before requesting subresources.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Fixture-scoped endpoints

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 41–42, 52–59.*

| Dataset | Endpoint(s) | Required ingestion scope |
|---|---|---|
| Fixtures | `/fixtures` | Schedules, participants, scores, periods, statuses, and enriched fixture responses. |
| Direct history | `/fixtures/headtohead` | Relevant team-pair history; reuse equivalent local fixture history first. |
| Match statistics | `/fixtures/statistics` | Full-match statistics and supported half-specific statistics using `half=true`. |
| Match events | `/fixtures/events` | Complete timelines, including corrections and VAR events. |
| Lineups | `/fixtures/lineups` | Formations, starters, substitutes, positions, coaches, and other supplied lineup fields. |
| Player match statistics | `/fixtures/players` | Every available player and statistical field for each covered fixture. |
| Absences | `/injuries` | Fixture-related injury and suspension information. |
| Provider forecasts | `/predictions` | All supplied prediction and comparison fields, not only double chance. |

### Required fixture fields

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 81, 83–85.*

- **Fixture:** date, UTC timestamp, timezone, referee, venue, home/away teams, period timestamps, status code/description, elapsed/added time, winner flags, current goals, halftime/full-time/extra-time/penalty scores, and update metadata where supplied.

- **Team match statistics:** shots by supplied category, chances/expected-goal statistics where actually returned, possession, passes and accuracy, fouls, corners, offsides, cards, goalkeeper saves, and each available period-specific breakdown. Preserve statistical names and units.
- **Events/lineups:** event time and added time, team, player, assist, event type/detail/comments; goals and reversals, penalties, cards, substitutions and VAR; formation, starters, bench, shirt numbers, positions/grid, coach and colors where returned.
- **Player:** identity, birth details, nationality, physical/profile fields and photo; team/competition/season associations; appearances, starts, minutes, position, rating, captain/substitution information; shots, goals, assists, conceded goals, saves, passes, tackles, blocks, interceptions, duels, dribbles, fouls, cards and penalty statistics where supplied.

### Fixture request rules

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 118–121, 123, 125.*

| Request | Required treatment |
|---|---|
| `/fixtures?live=all` | One broad live-fixture request per scheduled sweep; the 20-ID limit does not restrict this result set. |
| `/fixtures?ids=ID-ID-...` | Maximum **20 fixture IDs per request**. Reuse returned events, lineups, team statistics and player statistics; do not immediately request identical subresources again. [R5] |
| `/fixtures?date=...` | Broad date discovery; use the documented timezone behavior and validate local-day boundaries. Do not impose a 20-result limit. |
| `/injuries?ids=...` | Maximum **20 fixture IDs** per documented batch. [R1] |
| `/fixtures/statistics?fixture=...&half=true` | Fixture-specific supplemental request when required half data is not already present. Respect season/competition availability. |
| `/predictions` | Fixture-specific; no invented multi-fixture parameter. |

## Scope boundary

Implement fixture ingestion, not live scheduling or forecast generation. The numerical interpretation of /predictions is task 037; cadence and lifecycle are tasks 020–022.

## Acceptance checks

- [ ] Store schedules, statuses, full scores, timelines/corrections, lineups, player-match statistics, supported half statistics, absences and complete provider-forecast payloads.
- [ ] Reuse included enriched-response sections and equivalent local head-to-head history; request only genuinely missing supported sections.
- [ ] Keep raw provider forecasts uninterpreted here and preserve missing values/coverage reasons rather than fabricating fields.
- [ ] Register each section independently in the completeness ledger and use the shared transaction/checkpoint path.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [018 — Implement the complete player-data import handlers](018-player-data-imports.md).
