# 190 — Saved filters dialog

Move saved configuration controls into a single builder-only dialog opened by
**Saved filters** under Actions. Reuse the filter toolbar styling and shared
criteria dialog. Start with the chooser, with edit, rename, default and delete
controls. Keep the main builder as the only interface for viewing and changing
filter values; Edit filters returns focus there. Keep Save current filters and
Update selected in the footer; keep their editors and confirmations inside the
same dialog. Remove the standalone row and account management panel.
Keep all desktop filter and action buttons on one row using responsive input
and action widths, including at the 1024px desktop breakpoint.

Loading populates local filters and today's reporting date, retains the saved
time range, clears previous results and updates the canonical URL without
generation or closing the dialog. Preserve the ten-item limit, account-backed
persistence, optional default and optimistic revision checks.

Verify strict typing, changed-file lint, focused domain/service tests and the
isolated production fixture. Check desktop/phone layouts in both themes, all
management actions, settings fidelity, dates/times, explicit generation,
keyboard/focus behavior and the existing criteria dialogs. Record actual results
before committing and pushing main.

Completed verification:

- Strict TypeScript checking and changed-file ESLint passed.
- The focused domain/service/HTTP/builder suite passed 153 tests; one genuine
  MySQL integration test skipped because its server binary is unavailable.
- The isolated production fixture built and passed builder/account SSR,
  authenticated private-collection and idle-generation checks.
- Browser checks passed create, rename, edit, update from the main draft,
  optional default application/clearing, delete, stale revision refresh and
  persistence through generation. Loading retained every saved field and time
  range, supplied today's dates, cleared results and issued no server navigation
  or generation request. Inline editors kept a single native dialog.
- The dialog has no settings summary. All six desktop filter/action buttons
  share one 32px row at 1024px, 1280px and 1440px, including edited criteria
  badges; footer buttons share one row. Light/dark desktop and responsive
  layouts through 320px fit without horizontal overflow or clipped footers.
- Existing range Enter/Apply, date/time Apply and markets Cancel behavior,
  Edit filters focus, Escape focus restoration and native modal Tab navigation
  passed. The account page has no saved-filter management panel/link.
- Browser checks used synthetic account storage with production components,
  handlers and services. Real database locking and physical devices were not
  exercised. Screenshots and logs remain ignored under output/.
