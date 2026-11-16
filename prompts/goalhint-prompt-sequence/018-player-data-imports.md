# 018 — Implement the complete player-data import handlers

**Phase:** Endpoint ingestion  
**Key prerequisites:** [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md); [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [008 — Persist responses and normalize them idempotently](008-transactional-ingestion.md); [009 — Coalesce requests and reuse fresh shared responses](009-shared-fetch-cache.md); [010 — Implement documented batching and resumable pagination](010-batching-pagination.md); [014 — Implement reference and competition catalog ingestion](014-catalog-imports.md); [015 — Implement team and venue identity ingestion](015-entity-imports.md); [017 — Implement complete fixture-scoped data ingestion](017-fixture-data-imports.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R1, R4, R7** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Implement player profile, season, squad, career-team and ranking ingestion as a complete player-data pipeline.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Player endpoints

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 41–42, 61–65.*

| Dataset | Endpoint(s) | Required ingestion scope |
|---|---|---|
| Player availability catalogs | `/players/seasons`, `/players/profiles` | Available statistical seasons and the complete paginated player-profile catalog. |
| Player season statistics | `/players` | All pages for every accessible relevant competition/season; preserve multiple team stints. |
| Current squads | `/players/squads` | Current squad associations; do not label these historical lineups. |
| Player career teams | `/players/teams` | Available team and season associations for each player. |
| Player rankings | `/players/topscorers`, `/players/topassists`, `/players/topyellowcards`, `/players/topredcards` | All four ranking datasets; do not use rankings as a substitute for the complete player population. |

### Player field coverage

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 85.*

- **Player:** identity, birth details, nationality, physical/profile fields and photo; team/competition/season associations; appearances, starts, minutes, position, rating, captain/substitution information; shots, goals, assists, conceded goals, saves, passes, tackles, blocks, interceptions, duels, dribbles, fouls, cards and penalty statistics where supplied.

### Player pagination

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 127–128.*

| Request | Required treatment |
|---|---|
| `/players` | Follow all pages; documented page size **20**. |
| `/players/profiles` | Follow all pages; documented page size **250**. |

## Scope boundary

Implement player importers only. Player outcome models are separate, and current squad data is not permission to reconstruct historical participation.

## Acceptance checks

- [ ] Traverse complete profile and season-statistics pagination, preserving multiple team stints and all supplied statistical fields.
- [ ] Retain current squad scope and dated team/season associations without relabeling them as historical lineups.
- [ ] Import all four ranking datasets in addition to, not instead of, the full player population.
- [ ] Use shared entity/request keys so player dependencies are not fetched once per consuming fixture.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [019 — Implement coaching, transfer and career-history ingestion](019-career-data-imports.md).
