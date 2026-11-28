# 311 Performance and reliability

## Scope

Reproduce production-sized feed and archive reads, navigation and document failures, Best Slips sharing, login and administrator directory refresh. Preserve the presentation, exact reporting cohorts, publication seals and account permissions. Compare public reachability and cold page delivery in separate checks.

## Implementation and acceptance

1. Collect privacy-safe HTTP, browser, host and isolated database evidence. Record baseline failures and unresolved causes.
2. Move the browser Matches header ahead of the stored feed where eligible. Keep crawler metadata and HTTP error semantics. Preserve verified outcome counts for compatible reads and bound recovery.
3. Reduce redundant Best Slips archive and viewer work. Preserve accepted data on transient refresh failures and keep canonical link sharing available independently of the image.
4. Isolate login dependencies and keep administrator session failures fail-closed with a retryable status. Distinguish document, connection and render failures. Correlate affected API response IDs with fixed server phase names.
5. Run matching before and after lab measurements, focused fail-then-pass regressions and the production build. Verify staging release and database evidence before promoting the same artifact to production.

## Rollout status

Staging accepted `87d3c727` and verified all 95 required migrations. The candidate rendered 50 Matches rows and coherent counts in production Chrome. The Best Slips route committed and encountered an archive 503. Production restored `64aba48b`. A later SSH disconnect left a pending release record and held lock. Production promotion, the broad Matches API and PageSpeed reachability remain open.

[Implementation evidence and known limits](../docs/reports/performance-reliability-2026-11-28.md).
