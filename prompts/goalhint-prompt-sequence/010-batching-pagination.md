# 010 — Implement documented batching and resumable pagination

**Phase:** Shared ingestion  
**Key prerequisites:** [002 — Build the versioned provider endpoint inventory](002-endpoint-inventory.md); [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [006 — Implement durable job ownership and overlap protection](006-durable-job-control.md); [007 — Repair the shared server-side provider client](007-shared-provider-client.md); [008 — Persist responses and normalize them idempotently](008-transactional-ingestion.md); [009 — Coalesce requests and reuse fresh shared responses](009-shared-fetch-cache.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R1, R3, R4, R5** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Implement shared endpoint-specific batching and pagination adapters using only verified provider parameters.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Batch and page rules

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 116–131.*

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

## Scope boundary

Implement the shared traversal mechanisms and their focused tests. This task does not start catalog scans or historical backfill.

## Acceptance checks

- [ ] Split fixture/injury ID batches and documented person batches at 20, without applying that limit to broad date/live results.
- [ ] Handle odds pages of 10, player pages of 20 and profile pages of 250 as documented, with final-page detection and durable progress.
- [ ] Resume after a partial-page failure without refetching committed pages; reuse enriched fixture subresources.
- [ ] Reject invented multi-fixture prediction, multi-team statistics, mixed-person batch and unsupported pagination parameters.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [011 — Implement the shared quota budget and priority scheduler](011-quota-scheduler.md).
