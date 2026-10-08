# 031 Public response cache

**Feature:** Shared caching and reliable invalidation of stored public reads.

**Depends on:** [020-durable-jobs.md](020-durable-jobs.md), [022-revision-publication.md](022-revision-publication.md), [023-cutoff-locking.md](023-cutoff-locking.md), [024-schedule-lifecycle.md](024-schedule-lifecycle.md), [026-fixture-result-sync.md](026-fixture-result-sync.md), [027-market-settlement.md](027-market-settlement.md), [028-match-feed-api.md](028-match-feed-api.md), [029-match-detail-api.md](029-match-detail-api.md), [030-performance-api.md](030-performance-api.md)

**Source:** [app-write-up.md](../app-write-up.md) §§5, 9–13, 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, repository instructions and implemented read/change-event contracts. Implement the shared public-response cache only, using the approved hosting/cache capabilities. Do not introduce an unapproved external subscription or change endpoint semantics.

Cache stored public query responses by normalized locale, date/range, fixture identity and permitted filter/sort/page parameters. Reuse one key/tag strategy across feed, detail/history and performance services; keep invalid requests and transient errors from becoming authoritative empty responses. Preserve all snapshot/version, coverage, run-progress and freshness fields. A visitor still cannot cause provider, research or AI work.

Consume durable changes from publication, cycle locking, material score/status changes, rescheduling and settlement. Invalidate affected fixture responses, old/new date/range feeds and relevant performance cohorts. Include run progress/coverage changes so Updating and partial-coverage labels cannot become permanently stale. Make event consumption idempotent and recoverable after downtime, with acknowledgements only after safe invalidation. Address the race where an older read fills a cache after its invalidation; use versions/generation fencing or an equivalent documented strategy.

Choose active-match lifetimes compatible with 15-second live and 60-second date/result cadences and the proposed two-minute final-badge target. Use appropriately longer bounds for historical immutable revision payloads while keeping mutable result/correction envelopes fresh. Handle EAT midnight rollover and filters without cross-locale/query leakage. Report actual data sync time; a cache hit cannot masquerade as a new provider observation. Serve stored records safely during provider outages and expose delay/partial states.

If cache infrastructure is unavailable, fall back to bounded stored-data reads or truthful degraded responses; never bypass provider limits or conceal a database outage with false fresh data. Keep cache implementation server-only. Do not implement the later browser polling feature here.

## Acceptance checks

- Test cache hits plus invalidation after publication, locking, score changes, reschedule, settlement corrections and progress changes.
- Simulate duplicate/lost-delivery recovery, stale-fill races, two replicas, cache outage and EAT rollover.
- Measure active-response freshness under normal configured cadences; stale responses retain versions so clients can reject regression.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Record changed files, cache/race/freshness checks and blockers in `docs/development-progress.md`; document key, lifetime and recovery policies in `docs/implementation-decisions.md`.
