# 193 — Centered Custom Filters dialogs and explicit actions

Use Rename Selected Filter, Update Selected Filter and Delete Selected Filter
in the parent footer alongside Create New Filter. Widen the desktop parent to
fit the longer labels on one row. Shorten child action labels to Create, Rename,
Update and Delete. Center both layers using the shared dialog layout and retain
native top-layer modality and focus restoration.

Add a reusable backdrop-dismissal option to CriteriaDialog and turn it off for
the Custom Filters parent and child. Outside clicks must preserve both dialogs
and pending values. Retain Escape, explicit close/cancel controls, successful
action dismissal and busy-write guards. Preserve other criteria dialogs' normal
backdrop behavior and the phone/tablet inline editor.

Verify strict typing, changed-file lint, configuration tests and the isolated
production fixture. Browser-check centering, desktop footer geometry, all four
CRUD actions, child/parent outside clicks, keyboard/close/focus behavior, pending
writes and responsive light/dark layouts before committing and pushing main.

Completed verification:

- Strict TypeScript checking and changed-file ESLint passed. Configuration
  tests passed 9 cases; one genuine MySQL integration case skipped because its
  test-server binary is unavailable.
- The isolated production fixture built and passed builder/account SSR,
  authenticated collection and idle-generation checks.
- Browser CRUD checks verified all parent and child labels, the wider 48rem
  desktop parent, its single-row footer, and viewport centering of both layers.
  Native modality kept the background parent inert; Enter created exactly once.
- Outside clicks preserved the parent, child and data, including during a
  deliberately held write. Escape, explicit Cancel/X controls, successful writes,
  last-record deletion and header-focus fallback passed. Errors stayed in the
  child; stale-revision refresh and focus recovery passed.
- Both layers remained centered and fit at 1440x1000, 1024x768 and 1024x400.
  Long names, light/dark themes, keyboard isolation and a 320x568 phone layout
  with visible footer actions passed. Screenshots were visually inspected.
- Breakpoint changes preserved names/default choices/errors and phone creation
  worked. Other criteria dialogs retained their normal backdrop dismissal.
  Persisted defaults still loaded today's dates and saved times without
  generating slips. The main desktop toolbar remained on one row.
- Browser checks used synthetic storage with production UI/handlers/services;
  real database locking and physical devices were not exercised. Generated
  screenshots/logs remain ignored under output/.
