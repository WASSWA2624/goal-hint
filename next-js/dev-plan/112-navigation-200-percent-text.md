# Navigation at 200% text

## Scope

- Fix navigation overflow at 200% text on phones, tablets and desktop.
- Keep slip headers, match rows, labels and destinations unchanged.
- Preserve named actions, touch targets, native menus and keyboard access.

## Implementation

- Share a wrapping header-row primitive across app, public, administrator and
  match-detail phone headers. Allow account actions and their wrapper to reflow
  within available space.
- Let measured desktop fitting move fewer than three destinations, including
  all destinations, into More when their actual enlarged sizes require it.
- Reserve enough desktop navigation width for the More trigger.
- Keep useful minimum brand widths on admin/detail phone bars, wrap long detail
  section-navigation titles only in their existing narrow-container rule, and
  constrain account popovers for scrollbar gutters and two control rows.
- Add reproducible 100%/200% production-header fixtures for synthetic sessions.

## Verification

- Focused navigation tests (17) and targeted ESLint passed.
- Production fixture build, TypeScript and all 100%/200% SSR assertions passed.
- Browser acceptance passed 220 combinations across public/app/admin/detail,
  synthetic guest/member/admin sessions with 99+ counts, both themes, normal and
  200% text, and 320–1440px widths. Verified no page/control overflow or overlaps,
  readable branding, 48px default rails, desktop admin sticky alignment, complete
  destinations, menu bounds and Escape focus restoration. Five additional
  320×480 menu checks passed. No JavaScript page errors occurred.
- Three focus-preserving desktop/phone resize checks and outside-click dismissal
  passed, including moving the focused destination into More.
- The actual `/en` app at 320px now has a 320px document at both text sizes.
  Slip headers retain their previous 28px/64px heights, 302px width, grid tracks,
  zero vertical padding and status widths at 100%/200%. Slip header and match-row
  source has no changes in this task. Reviewed light/dark 200% screenshots.
- Preserve concurrent Match card work, Git stashes and worktrees; commit only this
  task's changes and push main.
