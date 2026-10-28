# 083 Comprehensive development football demo

Populate the normal application from reproducible API-Football v3 synthetic data
for every Kampala reporting day from 1 January through 30 November 2026,
with at least 500 distinct fixtures per day.

1. Generate deterministic provider envelopes, fixtures and complete detail
   endpoints, including geographically diverse competitions, squads, statistics,
   events, injuries, standings, history, predictions and bookmaker prices.
2. Store canonical fixtures in the normal MySQL schema and materialize rich
   projections for requested dates, preserving production validation, services,
   filtering, pagination, settlement and slip generation.
3. Start development against an exclusively owned local MySQL instance with
   synthetic member access and prices. Keep private settings and production
   services isolated. Preserve demo data across restarts.
4. Support raw provider inspection/export and document startup, date coverage,
   opt-out, synthetic identities and data lifecycle. Populate the protected owner
   workspace and analytics through their normal tables and authorization.
5. Verify the complete date range and endpoint contracts, meaningful database
   acceptance, normal desktop/mobile pages and slip-builder interactions;
   run lint/typecheck/regression/build checks and commit/push main.

## Verification

- All 334 reporting dates contain exactly 560 distinct fixtures (187,040 total).
- Raw fixture and detail export manifests each cover all 334 dates and 187,040
  fixtures. January 1 and November 30 detail archives each contain 560 envelopes
  with events, lineups, statistics and players. Generated archives remain ignored.
- Real MySQL acceptance passed feed, details, insights, results/settlements,
  exact raw bookmaker prices, Best Slips, saved history and a real member save.
  A separate clock test passed scheduled-to-live transitions, source provenance,
  version changes and protection against delayed requests rewinding state.
- Owner acceptance passed overview, all payment tabs, subscriber/credit/access
  history, reset requests, analytics conversions, administrator authentication
  and repeat-seed preservation of financial records and visit history.
- Pinned Node 24.18.1: the broad 2,225-test run passed 2,220 tests, skipped one,
  and hit four timing/timeout failures under memory pressure. All 65 tests in the
  affected files passed serially. All 82 Python tests passed. Subsequent provider,
  coverage/slip, streaming/cache and bulk-feed/slip regression runs passed 23,
  21, 12 and 147 checks respectively. Lint and TypeScript passed.
- Desktop/mobile checks passed the populated feed, live/results, match detail
  panels, account, Best Slips, custom slip generation and the real Save action.
  The default 31-day build examined 500 fixtures and generated three slips;
  normal member Save and login/logout flows passed.
- Normal startup warmed both full-month reports and verified all 187,040 stored
  fixtures. Default performance rendered 16,800 fixtures, calculated metrics and
  published history at desktop and 375 px widths without horizontal overflow.
  Dense performance batches reuse their proven byte bound. Isolated demo report
  snapshots retain their original observation time for an hour; production cache
  lifetime, permission checks and historical invalidation remain unchanged.
- Source comparison replays preserve immutable original audits/order and use
  sealed, schema-validated synthetic counterparts. An actual 560-fixture proof
  passed matched match-result/double-chance metrics and idempotent storage.
  Cold historical comparison ranges now prepare all required sealed source pairs;
  startup rejects partially populated comparisons.
- The real default 31-day custom build examines 500 fixtures and generates three
  slips. Shared bulk hydration preserves individual-reader projections, archive
  seals and field validation. The mobile browser Save action completed normally.
- The protected Forecast sources browser page rendered the complete 16,800-fixture
  cohort, including 16,313 sealed replay pairs and matched-source metrics. Desktop
  and 375 px mobile layouts have no horizontal overflow. The final production
  build passed and generated an offline manifest with 24 pinned assets.
