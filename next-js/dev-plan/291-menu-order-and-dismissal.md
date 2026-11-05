# Shared menu order and dismissal

## Approved scope

Order desktop and mobile navigation as Matches (home), Best slips, Slip builder,
Community, Invite friends, Results & performance, Download app, Contact, Privacy,
Terms. Keep the existing canonical routes, Community visibility and dialog,
administrator destination, and shared theme/control styles. Help stays available
in the footer.

## Implementation

- Keep one ordered destination list, including the Community dialog action.
  Measure links and actions together, moving the remaining items into More.
  Preserve focused destinations when Community visibility changes. Render its
  dialog outside the responsive navigation so resizing cannot hide the open
  dialog, and return focus to the visible action or More after closing.
- Opt navigation into outside pointer dismissal without changing filter menus'
  click timing. Close on outside focus, Escape, route/history changes and when
  a responsive navigation copy becomes hidden; retain native toggle and internal
  scrolling, and restore focus deliberately for keyboard dismissal.
- Verify menu order, home routing, visibility, dialog interaction and dismissal
  on desktop/mobile in both themes. Use an isolated worktree and lightweight
  synthetic fixture to avoid other chats' builds, live accounts or payments.

## Verification

- The 25 focused navigation/community/dismissal tests passed, including after
  rebasing onto the performance changes in `main`. Scoped ESLint, the shared
  theme-token contract and full-project TypeScript checking passed on Node
  24.18.1. Checks were serialized after browser teardown to reduce host memory
  contention. Final lint and focused tests also passed after tightening the
  dialog cleanup's connected-element guard.
- Twelve browser groups passed at 320, 390 and 1440px in both themes, with zero
  page errors. They cover order, home routing, Community visibility/dialog,
  outside pointer/touch, toggle, Escape/focus, query/link/history/hash navigation,
  internal scrolling and desktop/mobile transitions. Screenshots were inspected.
- Eight additional browser groups passed for runtime visibility/focus, open
  dialog resizing in both directions, and normal dialog focus in both themes
  at 320/1440px. All 20 groups reported zero browser errors and followed no
  external community links. The reusable verifier records these regressions.
- Initial HTML navigation assertions and Python syntax checks passed. Browser
  evidence is kept outside Git under `next-js/output/playwright/menu-navigation/`.
