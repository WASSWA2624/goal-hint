# 191 — Clear Custom Filters actions

Rename the builder action and dialog to Custom Filters and use consistent,
concise filter terminology. Remove persistent explanatory/empty-state text.
Keep the chooser, optional default and Edit filters in the body. Keep Save
current filters, Rename, Update selected, Delete and Close in the footer.

Preserve the chooser and all five footer actions during inline editors and
confirmations. Name the affected filter, provide explicit confirmation and
Cancel controls, disable competing actions while editing, and restore focus
when returning to management. Save creates a new filter; Rename changes only
its name; Update replaces saved values with the current builder draft; Delete
removes only the selected saved record. Keep persistence, cap/default rules,
today/time loading and explicit-only slip generation intact.

Verify typing, changed-file lint, existing configuration/domain/service tests,
and an isolated production rendering fixture. Exercise complete CRUD, cancel,
errors, keyboard/focus, desktop footer alignment and responsive light/dark
layouts in a browser. Record actual results before committing and pushing main.

Completed verification:

- Strict TypeScript checking and changed-file ESLint passed.
- The focused configuration/domain/builder/service suite passed 122 tests.
  One genuine MySQL integration test skipped because its test server is unavailable.
- The final isolated production fixture built and passed builder/account SSR,
  Custom Filters label, authenticated collection and idle-generation checks.
- Browser CRUD checks passed creation, rename, replacement from the main draft,
  deletion, cancellation and duplicate-name errors. Confirmations retained the
  chooser, title and all five footer actions inside one native dialog. Unselected
  actions disable correctly; brief success messages identify the completed action.
- Verified optional default application/clearing, today's dates and saved time
  ranges, no generation/server navigation on loading, clearing previous results,
  the ten-filter cap and freeing a slot by deletion. Deleting preserved the draft.
- A stale-edit browser check exposed a focus race. Restoring focus after React
  commits the enabled controls fixed it; conflict refresh, cancellation and focus
  recovery passed on the final build.
- Desktop toolbar/footer controls stayed on one row, including the 1024px
  breakpoint. Light/dark layouts from 320px through 1440px, long filter names,
  visible footer controls, native keyboard modality and account-panel absence passed.
- Browser checks used synthetic account storage with production UI, handlers
  and services. Real database locking and physical devices were not exercised.
  Generated screenshots and logs remain ignored under output/.
