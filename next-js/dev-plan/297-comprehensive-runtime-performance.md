# 297 — Comprehensive runtime performance review

## Scope

Review and fix confirmed performance bottlenecks while preserving all screens,
control geometry, themes, navigation, permissions, business results, polling
cadences and data freshness. Extend the evidence from 287 rather than repeat
already completed optimizations as new findings.

The owner's additional requirement is incremental updates: retain already
rendered content, component identity, scroll, focus and drafts; unchanged polls
must not replace equivalent data or unnecessarily rerender unchanged cards.

The baseline is `bb2d8b82` plus the pre-existing working-tree changes captured in
an ignored source snapshot. Other chats' contact, summary-control and database
documentation changes remain outside this change's ownership. Preserve linked
worktrees and stashes; commit only this review's intended changes.

## Method

1. Inventory public, member, checkout, administration, analytics, API, database,
   worker, native-host, offline and deployment paths.
2. Use isolated production fixtures and actual component interactions; record
   development compilation separately. Keep private configuration and live
   provider/payment operations outside benchmark fixtures.
3. Reproduce query, request, rendering and cache work with deterministic scaling
   checks before changing the corresponding path.
4. Apply minimal shared implementations with unchanged result and interaction
   contracts. Retain authorization, transaction consistency and integrity checks.
5. Validate changed paths with behavioral/scaling tests, isolated MySQL where
   available, browser checks in both themes and mobile/desktop viewports, lint,
   type checks and an integrated production build. Compare existing failures to
   the unchanged baseline instead of silently attributing them to this work.
6. Publish coverage, evidence, confirmed fixes and remaining measurement gaps in
   `docs/reports/runtime-performance-297.md`, then commit and push integrated main.

## Implementation and evidence

- Batch settlement reads and reuse verified projections within one read-only
  transaction; prepare quote payload sizing once per exact cohort.
- Coalesce checkout background reads, cancel obsolete work and bound explicit
  revalidation so paused polling can recover after a stalled request.
- Share unchanged plain-data branches in checkout, slip and analytics snapshots.
  Keep live-page subscribers and memoized slip cards independent of unchanged
  report/count/summary updates without suppressing real data or access changes.
- Keep tab scrolling separate from desktop label measurement. Use ordinary
  panel-only left/width properties so positioning does not invalidate inherited
  custom properties throughout a large option list; geometry stays identical.
- Validate complete offline bundles with the existing four-asset concurrency
  bound while preserving all hashes, expiry and corruption recovery.

Detailed coverage, measurements, verification and remaining limits are in
[the review report](../docs/reports/runtime-performance-297.md).
Browser fixture timings establish local
synthetic behavior, not hosted latency, field responsiveness or physical-device
performance. Concurrent process/resource pressure must be recorded when timing.
