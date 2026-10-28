# Compact Slip Builder toolbar

## Approved scope

- Implement selected sample 1, Compact toolbar, in the Slip Builder settings
  section for desktop and mobile.
- Match the compact Matches search/filter chrome, use shared reusable controls,
  and keep settings surfaces and controls square.
- Keep the slip count, total-odds range, and matches-per-slip range visible.
  Put individual odds/probability, date/time, and markets in popup dialogs.
- Retain the generated-slip presentation and existing subscriber access checks.

## Defaults and blank bounds

| Setting | Default |
| --- | --- |
| Requested slips | 5 |
| Total odds per slip | Minimum 0.01; maximum blank (Any) |
| Matches per slip | Minimum 1; maximum blank (Any) |
| Individual odds | Minimum 0.01; maximum blank (Any) |
| Match probability | Minimum blank; maximum 100% |
| From/to dates | Both today in Africa/Kampala |
| From/to times | 00:00–23:59 EAT |
| Markets and outcomes | All four families; Automatic results |
| Reuse matches | Off |

- Blank numeric minima use the valid floor: 0.01 odds, 1 match, or 0%
  probability. A slip must contain at least one match.
- Blank maxima mean Any. Keep parsing, serialization, form defaults, and actual
  generation consistent with these meanings.
- Keep criteria bounds separate from approved bookmaker-price validation.
  Preserve bounded work and accurate limited-search reporting.
- Represent unrestricted total-odds, individual-odds, and match-count maxima as
  omitted optional values in the contract and blank fields in canonical URLs.
  Accept explicit positive match counts above eight and exact odds criteria
  within safe-integer precision.
- Bound actual generation by the retained candidate pool and distinct fixtures,
  with the existing 800-candidate, 100,000-node, 2,000-combination, and
  100,000-batch-node budgets. Use conservative exact completion-price pruning.
- Also cap retained aggregate legs at 16,000, plus at most 800 disjoint reserve
  legs, and charge long-slip search nodes by `max(1, ceil(target / 8))` against a
  100,000-unit work budget. Keep the former up-to-eight-match behavior while
  bounding longer Any searches and reporting truncation.
- Keep daily Best Slips publication bounds unchanged. Adapt saved-snapshot size
  compatibility for longer custom slips while preserving independent refresh
  and forecast-hydration work limits. Keep approved quote formats unchanged,
  allow exact large total strings, compare ranking totals exactly, and hydrate
  saved history in at most 31-row batches within the 24,800-leg read budget.
- Reset restores the requested defaults, including after a criteria URL.

## Popup interactions and access action

- Reuse the shared native CriteriaDialog for Odds & probability, Match date &
  time, and Markets. Preserve optional combined-probability fields when the
  existing estimator capability enables them.
- Apply validates and retains dialog changes. Cancel, Escape, and backdrop
  dismissal restore the dialog-opening snapshot. Preserve focus containment,
  focus restoration, and accessible invalid-field associations.
- Keep one named input per criterion in the same native GET form. Before
  hydration or without JavaScript, retain the complete enabled form.
- Show Sign in for signed-out locked viewers and open the login form with the
  Slip Builder return destination. Show Subscribe for signed-in viewers who
  need a subscription, and Build slips for viewers with access.

## Verification

- Passed: all 192 tests across the final 12 focused suites, including optional
  maxima, exact large-total ranking, larger snapshots, saved-history batching,
  and bounded long-slip work. Durable output is in the ignored
  `.tmp/compact-slip-builder-tests.log`.
- Passed: final full TypeScript checking (`tsc --noEmit`), full ESLint, and the
  final scoped header/i18n lint checks.
- Passed: the final stable-source rendering-fixture production build and all
  server-rendered Slip Builder assertions, including the long-odds header
  ellipsis styling.
- Passed: 12 browser layout cases across 320/360/390/768/1024/1440px widths in
  light and dark appearance, with no horizontal overflow. Settings measured
  198px on phones and 155–156px on tablet/desktop.
- Passed at 320px and 1440px: popup first-field focus, Escape and backdrop Cancel
  rollback, Apply retention, local Reset followed by Cancel rollback, invalid
  101% probability, date ordering, market Cancel/Apply and reuse, global Reset,
  and zero-match rejection. Focus returns to the trigger; background controls
  remain inert while the native modal is open. No custom strict DOM-only Tab
  trap is claimed; normal browser-chrome focus behavior remains available.
- Passed: JavaScript-disabled native GET submission from the real form, with
  four requested slips, 0.01/1 minima, blank maxima, and `build=1` retained.
- Passed: coarse-touch checks at 320/360/390/430px, minimum 44px targets, and no
  overflow. Touch settings measured 225px high.
- Passed: final-bundle smoke checks for all three access actions and modal
  opening. A 400-digit total-odds header stress check passed at 320/390/1440px
  without overflow: mobile odds text stayed within its 80px column and desktop
  text within its 224px column, with ellipsis active. The unmodified header title
  retained the full original value.
- No JavaScript exceptions occurred in browser checks. The isolated fixture
  emitted 404s for account-session and service-worker stubs it does not supply.

## Full-suite limitations and baseline audit

- The final full `npm test` run completed in 204.3 seconds: 2,370 tests,
  2,365 passed, four failed, and one skipped. Durable output is in the ignored
  `.tmp/compact-slip-builder-full-tests.log`. All four failures match the
  baseline cases below; the full suite is not claimed clean.
- Existing admin/private-header and SEO cache tests expect a private-route
  list that omits the already-present `/api/slips/:path*` rule. Their tests,
  `next.config.ts`, and the private-header source are unchanged from HEAD;
  targeted reruns reproduced both failures.
- An existing SEO metadata source-pattern assertion expects `const viewer`
  immediately after the legacy redirect, while the unchanged route already
  uses `initialViewer` followed by a fresh viewer read. Its targeted rerun
  reproduced the failure.
- The recommendation-publication automatic-slip test expects Home or Away,
  while the current engine selects the qualifying higher-probability Home or
  Draw outcome. A copy of the HEAD builder and matching test, with only local
  import paths adjusted in ignored temporary files, fails identically. The
  mismatch predates this implementation.
- The offline Prisma CLI test passed in the final full run. An earlier timeout
  resolved and is not an outstanding limitation.
