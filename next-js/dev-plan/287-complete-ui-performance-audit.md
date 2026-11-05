# 287 — UI performance audit

## Scope

Audit public, member, checkout, admin and analytics navigation and nested controls
without changing their appearance, access rules, freshness or business behavior.
The owner clarified that the reported delays concern the local development app.
Coordinate with payment-details (286), prediction evaluation (285) and the
separate authentication/routing work; preserve their files and active worktrees.

## Implementation

- Replace quadratic shared picker lookups with indexed option identity and reuse
  derived lists/unchanged rows during keyboard and pointer focus changes.
- Ignore unrelated DOM mutations when checking whether slip polling should pause
  for navigation; retain cancellation, retry and navigation restoration.
- Separate browser download presentation helpers from catalog validation so the
  persistent theme provider does not import Zod just to identify the native host.
- Reuse the verified current-cycle display inside one match-detail transaction,
  avoiding a second cycle/schedule/revision/market read.
- Start independent analytics breakdown reads alongside summary/series reads;
  retain the existing connection limit, queries and final percentage calculation.
- Share only concurrent offline bundle validation, while retaining per-asset
  hashes, separate complete checks, expiry, corruption detection and rollback.
- Add repeatable production/browser/development and analytics scheduling
  measurement tools. Never present synthetic scheduling or helper-bundle results
  as production-wide speed gains.

## Verification

Use separate baseline and changed source trees, actual production components with
synthetic fixtures, both themes and mobile/desktop viewports. Record cold
development compilation separately from warm responses and browser interactions.
Check host resource pressure and avoid overlapping expensive builds when timing.
Run focused behavioral/scaling/security tests, real isolated MySQL acceptance
where available, lint/type checks, the existing test suites and an integrated build.

Turbopack was historically disabled after an instrumentation hang. A synthetic
fixture comparison alone does not qualify changing the application's bundler.
Preserve the working launcher unless actual application startup, routing and
hydration are verified with its instrumentation and proxy.

See [audit evidence and limitations](../docs/reports/ui-performance-287.md).
