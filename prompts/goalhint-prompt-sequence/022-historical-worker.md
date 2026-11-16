# 022 — Implement Worker 3: resumable historical backfill

**Phase:** Coordinated workers  
**Key prerequisites:** [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [008 — Persist responses and normalize them idempotently](008-transactional-ingestion.md); [010 — Implement documented batching and resumable pagination](010-batching-pagination.md); [011 — Implement the shared quota budget and priority scheduler](011-quota-scheduler.md); [012 — Implement failure classification and quota-aware retries](012-retries-errors.md); [013 — Configure the supervised runtime for logical workers](013-worker-runtime.md); [014 — Implement reference and competition catalog ingestion](014-catalog-imports.md); [015 — Implement team and venue identity ingestion](015-entity-imports.md); [016 — Implement complete standings and team-statistics ingestion](016-team-context-imports.md); [017 — Implement complete fixture-scoped data ingestion](017-fixture-data-imports.md); [018 — Implement the complete player-data import handlers](018-player-data-imports.md); [019 — Implement coaching, transfer and career-history ingestion](019-career-data-imports.md); [020 — Implement Worker 1: live match updates](020-live-worker.md); [021 — Implement Worker 2: current-day refresh and reconciliation](021-daily-refresh-worker.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R4** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Implement the quota-subordinate historical scanner that resumes exact unfinished work and covers both fixture dates and non-date catalogs.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Backfill requirements

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 197–210.*

**Purpose:** build the most complete database the account and provider history allow, without repeatedly downloading completed work.

1. On first initialization, complete today's **currently obtainable** missing data, then traverse **yesterday, the day before, and earlier dates**. Capture a fixed work manifest so newly arriving live data does not prevent historical progress forever.
2. For each date, discover fixtures and fill every applicable dataset in Section 2. Enrich already-stored fixtures rather than importing duplicates. Shared entities are fetched once per actual scope/freshness window, not once per fixture.
3. Also traverse all accessible competition-seasons and entity catalogs, including player-profile pages. A date-only fixture loop must not leave non-date-based datasets unvisited. Prioritize today's dependencies, then newest history, then remaining catalog work.
4. Discover historical boundaries from available league seasons and account access. Do not stop at an arbitrary 30/90-day window, scan empty dates indefinitely, or repeatedly query expired odds history.
5. Persist **date, league/season where relevant, endpoint, parameters, page, batch IDs, item/section completion, stored-response reference, retry state and next action**. A date alone is an insufficient checkpoint.
6. On restart, resume the **exact unfinished task**. Skip successfully persisted pages/batches and fully completed historical scopes. Do not restart from today or refetch the last completed date just to locate the next date.
7. Advance the scan once its discovered tasks are committed or explicitly deferred. Keep `date_scanned` separate from `date_complete`: deferred or failed sections must not disappear from completeness reporting. A failed optional item must not block the entire historical archive indefinitely.
8. On quota exhaustion or shutdown, persist progress and pause. Resume automatically after reset/restart. There must be no manual reconstruction of the cursor.
9. Treat finalized historical records as cached by default, **not literally immutable**. Reopen only for explicit force-refresh, known provider corrections, invalidation, schema migrations, or unresolved sections. Current squads, injuries and standings must not be frozen merely because a historical task requested them.
10. Store odds while available. Pre-match odds have a limited provider archive, and live odds are not a recoverable long-term history. Mark expired/unavailable history honestly; never claim that all historical odds can be backfilled. [R4]
11. Do not substitute today's roster, injuries, season totals or knowledge for what was known before a historical match. Retrospective prediction tests require legitimate as-of evidence.
12. Expose progress, next checkpoint, completed/partial dates, failures, quota wait, and an estimate of remaining work when the total is knowable. Use “not yet measured” instead of a fictional exact remaining count.

## Scope boundary

Implement only Worker 3. Do not impose an arbitrary 30/90-day horizon or invent recoverable historical odds, past squads or exact remaining counts.

## Acceptance checks

- [ ] Capture a fixed initialization manifest, complete currently obtainable current-day gaps and traverse history newest-first without live-data starvation.
- [ ] Visit every applicable date-based dataset plus accessible competition-seasons and entity/profile catalogs.
- [ ] Persist exact endpoint/parameters/page/batch/section/receipt/retry state and resume without restarting from today or repeating committed work.
- [ ] Keep date_scanned distinct from date_complete, retain deferred failures, pause/resume automatically and respect verified historical/access boundaries.
- [ ] Reopen finalized history only for the stated exceptions; report unavailable odds/as-of evidence and unknowable remaining totals honestly.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [023 — Implement Worker 4: the durable prediction lifecycle](023-prediction-worker.md).
