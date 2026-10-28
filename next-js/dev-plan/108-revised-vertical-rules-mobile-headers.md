# Revised Vertical rules mobile header samples

## Scope

- Revise the mobile header comparison into ten alternatives based on Vertical
  rules, before choosing a final production header.
- Keep fixed column tracks and separator positions across slip numbers, odds,
  probabilities, match counts and Pending/Won/Lost/Void states.
- Reserve the same 48px status cell for every outcome at the default text size.
- Rename Picks to Matches and Average to Probability, retaining the current
  probability calculation and full accessible explanations.
- Reduce visible header height from 44px to 28–34px with zero vertical padding.
- Keep the production Clean ledger match components and layouts unchanged.

## Implementation

- Share one native disclosure/markup and one column grid across ten scoped
  presentation variants. Keep the chevron slot reserved in status-only examples.
- Use Probability where space permits and Prob. in narrow containers. Keep
  Matches and full status words visible; never ellipsize numeric values.
- Reuse the existing scenarios, controls, isolated preview workflow and match rows.

## Verification

- Focused ESLint passed. Existing slip-card, prediction-label and timezone tests
  passed (21 tests). The isolated review production build and TypeScript check
  passed.
- Browser checks passed 70 combinations: five phone viewport widths (320–430px),
  both themes and all seven scenarios, across all ten headers. Verified fixed
  column boundaries, equal 48px status cells, complete values, one row, zero
  vertical padding, intended heights and no document overflow. Native keyboard
  expansion and gallery controls passed.
- Odds boundary checks at 320px passed for 9.99, 10.00, 99.99, the builder maximum
  100000.00 and the saved-snapshot maximum 999999.99, with complete values.
- At 200% text, both themes at 320px and 768px retain the values in locally
  scrollable headers without document overflow. Reviewed light/dark screenshots
  and the full ten-option gallery.
- The reused Clean ledger match component and its styles have no changes in this
  revision. The full application build was not run; the isolated review build
  verifies this prototype while other application work remains concurrent.
- Preserve concurrent application/desktop work, worktrees and Git stashes;
  commit only intended changes and push main.
