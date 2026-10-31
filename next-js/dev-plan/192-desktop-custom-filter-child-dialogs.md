# 192 — Desktop Custom Filters child dialogs

Render save, rename, update and delete forms/confirmations as smaller native
modal dialogs above the visible Custom Filters parent at the shared desktop
breakpoint. Keep the parent open and inactive through native top-layer modality;
offset the layers enough to show their relationship. Reuse CriteriaDialog and
the same fields/actions for the existing phone/tablet inline presentation.

Keep validation errors in the active child. Cancel, Escape, backdrop and close
affect only the child; guard dismissal while writing and return focus to an
enabled parent control. Preserve editor values/errors across responsive layout
changes. Use Create New Filter, Rename, Update and Delete in the parent footer;
remove Edit filters and the footer Close action, keeping the header X. Preserve
persistence, CRUD semantics, the ten-filter limit, optional default and today/time
loading without generation.

Verify strict typing, changed-file lint, focused configuration/builder/service
tests and the production rendering fixture. Browser-check both modal layers,
inert background controls, CRUD/cancel/errors, keyboard/focus, pending writes,
long names, breakpoint transitions, light/dark themes and compact viewports.
Record results before committing and pushing main.

Completed verification:

- Strict TypeScript checking and changed-file ESLint passed. The focused
  configuration/builder/service suite passed 122 tests; one genuine MySQL
  integration test skipped because its test-server binary is unavailable.
- The final isolated production fixture built and passed builder/account SSR,
  private collection and idle-generation checks.
- Browser checks verified two open native modal layers on desktop: a smaller
  offset child above the visible parent, no inline desktop form, and an inert
  parent that could not receive focus. Create, rename, update and delete passed;
  Enter created exactly once and update used the main draft without saving dates.
- Cancel, child X, Escape and backdrop returned to the parent without mutation;
  successful writes returned focus to the initiating action. Deleting the final
  filter preserved the main draft and focused the parent's header X. Duplicate
  name errors stayed in the child; stale-edit refresh/focus recovery passed.
- A deliberately held POST verified pending-write dismissal protection. Native
  keyboard navigation stayed in the child. The four renamed parent actions and
  removal of Edit filters/footer Close were verified.
- Breakpoint transitions at 1023/1024px preserved form values, optional default
  and validation errors without leaving orphan modal layers. Shared phone fields
  still created a filter. Long names, light/dark themes and a 1024x400 viewport
  fit with visible footers. Screenshots were visually inspected.
- Existing criteria-dialog cancellation, persistence/default behavior, today's
  dates, saved time ranges, no generation on load, and the main desktop toolbar's
  single row passed. Tests used synthetic storage with production components,
  handlers and services; real database locking and physical devices were not
  exercised. Generated screenshots/logs remain ignored under output/.
