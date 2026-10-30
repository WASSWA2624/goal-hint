# 168 — Blue Signal desktop implementation

## Scope

Apply approved design 1 to Best Slips and shared desktop slip cards. Keep the
blue rail visible along the full height of expanded slips. Keep mobile and
match contents unchanged. Remove the result-button container's white fill.

## Implementation

- Put Blue Signal typography, blue values, neutral surfaces and a decorative
  outer rail in the shared production `DesktopSlipLayout`, reused by Best Slips,
  Slip Builder and saved slips. The rail follows card height and does not change
  layout, clip tooltips/focus, or intercept clicks.
- Keep the larger 44px collapsed headers, 15px primary facts, 13px labels and
  actions, and 12px metadata. Expanded match/header styling stays original.
- Apply the selected filter sizing/spacing, blue selected All state, date-control
  outlines and pagination; wrap controls below 1280px. Keep the result-button
  container transparent and retain each outcome's individual color.
- Increase the desktop list gap by 1.5×, from 3px to 4.5px, and use square desktop
  cards/rails. Keep mobile geometry unchanged.
- Consolidate desktop access guidance in the existing subscription status bar,
  with context-specific guest, free member, pending and expired copy. Hide the
  duplicate desktop access panel; preserve its original mobile presentation.
  Keep existing authentication/subscription routes and state logic.
- Preserve the other design samples without an inherited blue outer rail.
- Expose `/implemented` in the isolated review fixture using the real production
  page without gallery styling or controls.

## Verification

- Project TypeScript and scoped ESLint passed; all 66 targeted browsing, paging,
  status, slip-card, subscription-state and theme unit tests passed.
- The production-component acceptance app built successfully, including real
  Best Slips, shared Slip Builder cards and the consolidated status bar.
- 197 desktop assertions passed across guest/member/subscriber views, both
  themes and 1440/1280/1024px: full-height rails in both native disclosure states,
  square corners, transparent result groups, larger typography, 4.5px list gaps,
  no overlapping columns or page overflow, and header contrast at least 6:1.
- Six exact old/new rendered comparisons passed for expanded match contents in
  both themes and mobile headers/list spacing at 390px and 320px in both themes.
- 22 behavior checks passed for filtering, custom dates, 50-slip paging and final
  page counts, sharing/focus restoration, shared builder cards, and pending or
  expired subscription guidance/actions without a duplicate desktop panel.
- Nine touch-desktop assertions passed at 1440/1024px: result/share controls keep
  44px targets and the square expanded rail remains continuous without overflow.
- The shared theme acceptance fixture now expects square desktop slip corners
  and retains its existing mobile surface-radius expectation.
- Separate uncommitted match edits from parallel work are preserved and excluded
  from this implementation commit.
