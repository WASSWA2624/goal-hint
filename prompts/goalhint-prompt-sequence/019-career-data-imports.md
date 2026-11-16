# 019 — Implement coaching, transfer and career-history ingestion

**Phase:** Endpoint ingestion  
**Key prerequisites:** [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md); [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [008 — Persist responses and normalize them idempotently](008-transactional-ingestion.md); [009 — Coalesce requests and reuse fresh shared responses](009-shared-fetch-cache.md); [010 — Implement documented batching and resumable pagination](010-batching-pagination.md); [015 — Implement team and venue identity ingestion](015-entity-imports.md); [018 — Implement the complete player-data import handlers](018-player-data-imports.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R1** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Implement the remaining career/availability history handlers with correct entity relationships and dates.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Career-history endpoints

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 41–42, 60, 66–68.*

| Dataset | Endpoint(s) | Required ingestion scope |
|---|---|---|
| Coaches | `/coachs` | Profiles and dated career associations; preserve the provider's endpoint spelling. |
| Transfers | `/transfers` | Player/team transfer histories and dated origin/destination relationships. |
| Achievements | `/trophies` | Available player and coach records. |
| Historical absences | `/sidelined` | Available player/coach absence records. |

### Career fields and person batching

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 86, 122.*

- **Career/availability:** transfer dates/types and both teams; coach career dates; injury/suspension type, reason and dates; trophies and placement; squad/career associations with their actual temporal scope.

| Request | Required treatment |
|---|---|
| `/trophies`, `/sidelined` | Use documented `players` or `coachs` batches of at most **20 IDs**; do not invent a mixed-person batch parameter. [R1] |

## Scope boundary

Implement career-history ingestion only; do not invent manager ratings, player mental states or numerical transfer effects.

## Acceptance checks

- [ ] Preserve the /coachs spelling and retain profiles, career dates, transfer origins/destinations, trophies and sidelined records.
- [ ] Use only documented players or coachs batches of at most 20 IDs, never a mixed-person parameter.
- [ ] Keep historical scope and availability reasons explicit, and retain all returned fields through the shared pipeline.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [020 — Implement Worker 1: live match updates](020-live-worker.md).
