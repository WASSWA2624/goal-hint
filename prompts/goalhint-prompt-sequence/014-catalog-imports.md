# 014 — Implement reference and competition catalog ingestion

**Phase:** Endpoint ingestion  
**Key prerequisites:** [002 — Build the versioned provider endpoint inventory](002-endpoint-inventory.md); [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md); [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [008 — Persist responses and normalize them idempotently](008-transactional-ingestion.md); [009 — Coalesce requests and reuse fresh shared responses](009-shared-fetch-cache.md); [010 — Implement documented batching and resumable pagination](010-batching-pagination.md); [011 — Implement the shared quota budget and priority scheduler](011-quota-scheduler.md); [012 — Implement failure classification and quota-aware retries](012-retries-errors.md); [013 — Configure the supervised runtime for logical workers](013-worker-runtime.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R1, R3** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Implement or repair the reference-catalog import handlers that discover timezones, countries, competitions, seasons and rounds.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Catalog endpoints

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 41–42, 44–46, 51.*

| Dataset | Endpoint(s) | Required ingestion scope |
|---|---|---|
| Time references | `/timezone` | Supported timezone identifiers. |
| Country catalogs | `/countries`, `/teams/countries` | Both catalogs; retain their distinct purposes. |
| Competitions and seasons | `/leagues`, `/leagues/seasons` | All accessible competitions, available seasons, coverage, and season boundaries. |
| Rounds | `/fixtures/rounds` | Round identifiers and available round dates. |

### Relevant identity fields

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 80.*

- **Identity/context:** provider IDs; names and aliases; country/code/flag; competition type/logo; season, dates, round and group; coverage flags; team code, founding year and national-team flag; venue name, address, city, capacity, surface and image.

## Scope boundary

Implement these catalog handlers, not their hourly schedules. Freshness scheduling belongs to task 021; bookmaker/odds catalogs belong to task 024.

## Acceptance checks

- [ ] Import both country catalogs without merging away their distinct meanings.
- [ ] Retain all accessible leagues/seasons, coverage, boundaries, round identifiers/dates and supplied identity fields.
- [ ] Route every fetch through the shared infrastructure and register scope/page completeness; do not hardcode a small competition list.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [015 — Implement team and venue identity ingestion](015-entity-imports.md).
