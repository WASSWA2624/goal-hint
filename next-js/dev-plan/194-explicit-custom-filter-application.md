# 194 — Explicit Custom Filters application

Use Create, Rename, Update and Delete in the parent footer, followed by a primary
Use Selected Filter action at the far right. Keep the centered parent/child
dialogs and explicit dismissal controls.

Separate the dialog's managed record selection from the builder's applied
configuration ID. Choosing an option only changes the managed selection. Use
Selected Filter applies its values for today with saved times, clears old results
without generating slips, updates the applied ID/URL and returns to the builder.
Update replaces the chosen record with the main draft. Create, rename and default
changes must not apply a record. Delete only clears the applied ID when removing
the applied record, preserving the main values/results. Refresh stale or removed
selections consistently. Retain optional default application on a fresh visit.

Verify strict typing, changed-file lint, configuration tests and the production
fixture. Browser-check selection-only behavior against main values, URL, hidden
applied ID and generated results; explicit use, CRUD on a different selected
record, deletion/refresh cleanup, defaults, nested dialogs, focus, responsive
footer order and no generation on load. Record results before committing/pushing.

Completed verification:

- Strict TypeScript checking and changed-file ESLint passed. Configuration tests
  passed 9 cases; one genuine MySQL integration case skipped without its test
  server. The isolated production fixture built and passed SSR/private API/idle checks.
- Browser checks used two distinct time/market/count configurations and compared
  the complete builder form, URL, applied ID and result state. Selecting another
  record, choosing the placeholder, closing without Use, creating, renaming and
  changing defaults preserved those values and generated results.
- Use applied every saved value for today's date with saved times, cleared prior
  results, set the applied ID and returned to the builder. It caused no server
  navigation/generation request. Reapplying the same ID replaced unsaved edits.
- Update saved the main draft into a different selected record without applying
  it. Deleting a non-applied record left the builder untouched. External deletion
  of the applied record only cleared its association, retained the staged choice
  and preserved values/results. UI deletion of the last applied record preserved
  values, disabled Use and restored focus to the header X.
- Optional default behavior on a fresh visit passed and synchronized the picker.
  Nested dialogs, explicit dismissal, focus restoration, centered geometry,
  five actions on one desktop row, far-right Use placement, light/dark themes and
  a 320px phone layout passed. Screenshots were visually inspected.
- Browser checks used synthetic account storage with production UI, handlers
  and services. Real database locking and physical devices were not exercised.
  Generated screenshots/logs remain ignored under output/.
