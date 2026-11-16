# 015 — Implement team and venue identity ingestion

**Phase:** Endpoint ingestion  
**Key prerequisites:** [002 — Build the versioned provider endpoint inventory](002-endpoint-inventory.md); [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md); [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [008 — Persist responses and normalize them idempotently](008-transactional-ingestion.md); [009 — Coalesce requests and reuse fresh shared responses](009-shared-fetch-cache.md); [010 — Implement documented batching and resumable pagination](010-batching-pagination.md); [014 — Implement reference and competition catalog ingestion](014-catalog-imports.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R1, R3, R7** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Implement or repair team, team-season and venue import handlers with stable relationships and reusable records.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Team and venue endpoints

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 41–42, 47, 49.*

| Dataset | Endpoint(s) | Required ingestion scope |
|---|---|---|
| Teams | `/teams`, `/teams/seasons` | Team profiles, competition membership, available seasons, and venue associations. |
| Stadiums | `/venues` | Venue profiles and media references. |

### Identity and relationship requirements

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 35, 80.*

Use provider IDs and explicit league/season/team/fixture/player relationships. Do not confuse current entity information with historical information applicable at an earlier kickoff.

- **Identity/context:** provider IDs; names and aliases; country/code/flag; competition type/logo; season, dates, round and group; coverage flags; team code, founding year and national-team flag; venue name, address, city, capacity, surface and image.

## Scope boundary

Implement identity importers only. Team aggregate statistics, player records and coaching/career history have separate tasks.

## Acceptance checks

- [ ] Retain team profiles, competition membership, available seasons, venue relationships and all returned venue/media fields.
- [ ] Normalize provider IDs and reuse each entity by actual scope/freshness rather than once per fixture.
- [ ] Retain temporal scope and unknown nested fields under the shared contracts.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [016 — Implement complete standings and team-statistics ingestion](016-team-context-imports.md).
