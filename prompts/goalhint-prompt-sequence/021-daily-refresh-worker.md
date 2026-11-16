# 021 — Implement Worker 2: current-day refresh and reconciliation

**Phase:** Coordinated workers  
**Key prerequisites:** [013 — Configure the supervised runtime for logical workers](013-worker-runtime.md); [014 — Implement reference and competition catalog ingestion](014-catalog-imports.md); [015 — Implement team and venue identity ingestion](015-entity-imports.md); [016 — Implement complete standings and team-statistics ingestion](016-team-context-imports.md); [017 — Implement complete fixture-scoped data ingestion](017-fixture-data-imports.md); [018 — Implement the complete player-data import handlers](018-player-data-imports.md); [019 — Implement coaching, transfer and career-history ingestion](019-career-data-imports.md); [020 — Implement Worker 1: live match updates](020-live-worker.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R2, R4** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Implement the hourly current-day coordinator and its durable unresolved-fixture reconciliation, including the shared freshness policy.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Hourly worker requirements and freshness defaults

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 168–193.*

**Default schedule:** once every hour at minute **00**, with a catch-up run after downtime. A concurrent run must be coalesced rather than overlapped.

1. Discover every accessible fixture in today's `Africa/Kampala` date window. Use broad date discovery, not just fixtures already known to the app. Reconcile returned IDs against storage and public listing.
2. Ensure all applicable checklist sections have jobs. Fetch missing or stale sections; reuse still-fresh shared entities. Do not require every optional field before making a fixture visible or a supported prediction possible.
3. Batch due enriched fixtures in groups of **20**. Share today's fetch receipts with the live and backfill workers.
4. Check current team/player/league context, provider predictions, and odds using the freshness policy below. An hourly coordinator does **not** mean refetching static catalogs every hour.
5. Revisit every unresolved fixture whose scheduled kickoff has passed, including fixtures from earlier dates. Maintain a durable unresolved queue independent of “today.”
6. Retry unresolved results **hourly for the first 48 hours**, then **daily**; flag them for investigation after 48 hours without inventing a result or cancellation. A provider-verified unavailability decision may close a specific missing-data task, but must retain its reason.
7. Publish changed data, invalidate affected application caches, and enqueue only affected predictions or settlements.

**Default freshness policy for active scopes:**

| Resource | Default refresh/check |
|---|---|
| Today's fixture discovery; unresolved recent fixtures; active standings | 1 hour |
| Provider forecasts for eligible fixtures | Initial capture; then 1 hour while relevant and permitted |
| Pre-match odds | Initial capture; then 3 hours |
| Injuries | Initial capture; then 4 hours |
| Team season statistics | Initial capture; then 12 hours |
| Active league coverage, teams, coaches, squads, transfers, catalogs and rankings | Missing immediately; otherwise 24 hours |
| Player season statistics | Missing immediately; otherwise 24 hours for active scopes |
| Player profiles/career-team lists, trophies and sidelined history | Missing immediately; otherwise 7 days; targeted refresh after relevant detected changes |
| Timezone catalog | Bootstrap and explicit invalidation |
| Archived, finalized historical records | No routine full replay; exceptions below |

These are application defaults. Check documented provider freshness and coverage; fetching more often cannot create upstream updates. Reuse a newer shared response rather than issuing another call. [R2, R4]

## Scope boundary

Implement only Worker 2 and its freshness scheduling. Use the existing publication/cache interfaces, with final publication rules repaired in task 044. Odds jobs use the shared importer completed in tasks 024–025.

## Acceptance checks

- [ ] Run at minute 00 with downtime catch-up and overlap coalescing; discover the complete Kampala local-day window.
- [ ] Schedule missing/stale applicable sections with shared 20-fixture enrichment, without hourly refetching of static catalogs.
- [ ] Apply every named freshness default in the source table and prefer newer shared receipts over additional requests.
- [ ] Keep overdue fixtures in a durable queue across dates: hourly for 48 hours, then daily with investigation flags.
- [ ] Invalidate affected caches and emit only meaningful prediction/settlement work; missing optional data never blocks fixture visibility.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [022 — Implement Worker 3: resumable historical backfill](022-historical-worker.md).
