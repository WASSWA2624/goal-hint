# Compact desktop matches toolbar

## Scope

- Implement the user's selected sample 1, Compact toolbar, for desktop Matches
  filters at 64rem and above.
- Place search, match status, period and sorting on the first row.
- Place Match Date & Time, Leagues, Countries, Markets and Limits on the second
  row, followed by Predictions only, quiet Reset and primary Apply filters.
- Use square 32px controls, compact 12px labels, 8px panel padding and 6px gaps
  consistent with the predicted-match rows.
- Keep existing dialog fields, dimensions, transactions and validation intact.
  Preserve the mobile/tablet interface and native fallback form.

## Acceptance

- Preserve every status, all ten period choices, four sorting choices, search,
  section counts, subscriber restrictions and the Predictions only default.
- Keep edits as drafts until Search/Enter or Apply; Done retains a section
  draft, Cancel/Escape restores it, section Reset remains local, and the main
  Reset applies defaults immediately.
- Preserve date/timezone and probability validation, disabled odds, searchable
  league/country lists, market minimums, canonical navigation and Back behavior.
- Keep the two-row layout at normal desktop sizes. Allow controls to wrap for
  enlarged text and longer labels without overlap or clipping; retain at least
  44px targets for coarse pointers.
- Verify both themes, 1024px and wider desktops, active badges, subscriber
  restrictions, keyboard focus, all five popup dialogs and mobile breakpoints.

## Verification

- Targeted ESLint and the full application TypeScript check passed.
- All 29 targeted filter-control, query and feed-page tests passed, with no skips.
- The isolated optimized production build passed using the existing SQL capture.
  All 46 server-rendered scenarios, 11 status/date redirects and five invalid
  query guards passed. This reused stored database projections rather than
  running a new database capture; the full production application was not built.
- Existing desktop browser acceptance passed all five popup dialogs, local
  resets, Cancel rollback, independent counts, unrelated draft preservation,
  zero draft-time feed requests, complete Apply and Back restoration.
- Unified desktop/mobile and JavaScript-disabled native checks passed all
  statuses, future periods, Live/Today, stale time clearing and custom archives.
- Light/dark layouts passed at 1024/1280/1440/1600px. The default panel is about
  88px high with two 32px rows. Active badges, 200% text and the subscriber-label
  layout wrap without overlap or clipped buttons. Subscriber-label geometry
  used a presentation-only fixture adjustment; access policy is unchanged.
- A fresh coarse-pointer browser context confirmed Search, selectors, all
  filter buttons, Predictions only and both actions have targets of at least
  44px. Dialog dismissal passed and no JavaScript exceptions occurred.
- Commit and push only the intended toolbar files. Preserve unrelated mobile
  design work, existing stashes and detached worktrees.
