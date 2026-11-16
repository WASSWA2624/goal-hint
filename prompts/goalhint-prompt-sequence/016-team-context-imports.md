# 016 — Implement complete standings and team-statistics ingestion

**Phase:** Endpoint ingestion  
**Key prerequisites:** [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md); [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [008 — Persist responses and normalize them idempotently](008-transactional-ingestion.md); [009 — Coalesce requests and reuse fresh shared responses](009-shared-fetch-cache.md); [010 — Implement documented batching and resumable pagination](010-batching-pagination.md); [014 — Implement reference and competition catalog ingestion](014-catalog-imports.md); [015 — Implement team and venue identity ingestion](015-entity-imports.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R1, R3** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Implement team–competition–season statistics and standings handlers without truncating groups or conflating current and historical aggregates.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Team context endpoints

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 41–42, 48, 50.*

| Dataset | Endpoint(s) | Required ingestion scope |
|---|---|---|
| Team aggregates | `/teams/statistics` | Each accessible team–competition–season combination; dated snapshots where supported. |
| Tables | `/standings` | All groups and table sections, not just the first group. |

### Required aggregate fields

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 82.*

- **Standings/team season:** position, points, goal difference, form and table movement; home/away/overall played, won, drawn and lost; goals for/against and averages; scoring/conceding intervals; total-goal thresholds; clean sheets, failures to score, streaks, biggest results, penalties, formations and discipline distributions where supplied.

### Statistics request scope

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 124.*

| Request | Required treatment |
|---|---|
| `/teams/statistics` | One request per required team–league–season/date scope; not an invented 20-team batch. [R3] |

## Scope boundary

Implement aggregate-context importers only; scheduling and predictive interpretation are separate tasks.

## Acceptance checks

- [ ] Capture all standings groups/table sections and every supplied aggregate statistical field.
- [ ] Use one documented team–league–season/date scope per statistics request, not an invented team batch.
- [ ] Preserve dated snapshots when supported and never present current aggregates as pre-kickoff historical knowledge.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [017 — Implement complete fixture-scoped data ingestion](017-fixture-data-imports.md).
