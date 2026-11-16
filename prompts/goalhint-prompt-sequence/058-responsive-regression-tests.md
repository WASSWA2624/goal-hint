# 058 — Verify responsive layouts and existing application behavior

**Phase:** Testing  
**Key prerequisites:** [043 — Preserve slips without misleading independence claims](043-slip-integrity.md); [044 — Publish valid fixtures independently of forecast and odds availability](044-publication-repair.md); [045 — Separate match, freshness, forecast, publication and settlement states](045-status-separation.md); [047 — Reconcile admin fixture totals and publication exclusions](047-admin-coverage-counts.md); [048 — Expose truthful worker, quota and completeness health](048-operational-dashboard.md); [049 — Correct performance metric denominators without changing the panel layout](049-performance-metrics.md); [050 — Refine desktop match rows without increasing their height](050-desktop-match-rows.md); [051 — Refine mobile cards within the existing compact structure](051-mobile-match-cards.md); [052 — Render compact, accurate and accessible match status](052-status-display.md); [053 — Apply shared server-side Live first sorting before pagination](053-sorting-filters.md); [054 — Show supported market forecasts and correctly sourced bookmaker prices](054-market-details.md); [055 — Test idempotent ingestion, recovery and quota coordination](055-ingestion-resilience-tests.md); [056 — Test forecasting evidence, fallback, invariants and queue scale](056-prediction-validation-tests.md); [057 — Test complete public coverage and authoritative settlement](057-publication-settlement-tests.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Run the manual responsive checks and application regression tests required to preserve existing behavior.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Responsive and compatibility acceptance

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 416–417.*

19. Desktop row height does not increase; mobile numbering disappears; date/time stacking, league width, font weight and plain live status work in light/dark modes and at **360, 390, 412, 768, 1280 and 1440px** widths.
20. Existing authentication, subscriptions, filters, pagination, match details, slips and unrelated routes keep working.

### Sort edge cases

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 392.*

Test phase changes, missing times, extra time, cross-midnight fixtures and pagination so matches are not duplicated, lost, or differently ordered across devices.

## Scope boundary

This is a verification task with scoped fixes for failed checks. Do not replace the established visual design or bypass paid access to make tests pass.

## Acceptance checks

- [ ] Check light/dark layouts at 360, 390, 412, 768, 1280 and 1440px, comparing desktop row heights against the baseline.
- [ ] Verify mobile number removal, date/time stacking, league width, font weights, plain status, reduced motion and accessible truncation.
- [ ] Verify authentication, subscriptions, every filter/sort, pagination, match details, slips and unrelated routes.
- [ ] Confirm phase, missing-time, extra-time and midnight transitions never duplicate/lose/reorder fixtures inconsistently between devices; save actual test evidence.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [059 — Measure request demand against the actual account plan](059-quota-capacity-check.md).
