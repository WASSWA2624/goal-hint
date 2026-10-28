# Slip Builder filter design samples

## Approved scope

- Create ten review samples for the upper filters and settings section of the
  Slip Builder page, each pairing desktop and mobile layouts.
- Reduce persistent height while keeping every setting easy to find and edit.
- Follow the existing Matches filters and slip-card styling, reuse preview
  controls, and prefer square edges.
- Let the user choose a concept before implementing production changes.

## Deliverable

- Add the isolated interactive fragment at
  `design/slip-builder-filter-designs/slip-builder-filter-designs.html` and an
  accompanying README with comparison notes and the local preview command.
- Include these concepts in order: Compact toolbar, Visible field grid,
  Range ledger, Editable summary cells, Essentials plus expand, Grouped tabs,
  Summary accordions, Inline builder sentence, Side-tab editor, and Quiet
  settings header.
- Share local editing and validation behavior so comparisons concern layout
  and access patterns rather than different feature sets.

## Behavior boundaries

- Default to 5 slips; total and individual odds minimum 0.01 with blank
  maxima; matches minimum 1 with a blank maximum; probability minimum blank
  and maximum 100%.
- A blank maximum means Any. A blank minimum uses the valid floor: 0.01 odds,
  1 match, or 0% probability. Reject invalid numbers and reversed ranges.
- Default both dates to today in Africa/Kampala and retain full-day times
  of 00:00–23:59 EAT.
- Keep markets on Auto with all four market families selected, Automatic
  result selection, and match reuse off. Include Reset and the primary action.
- Simulate the viewer's account state locally so the primary action shows
  Sign in, Subscribe, or Build slips as appropriate.
- Keep all interactions local to the samples. Do not generate actual slips,
  change production access, or edit production routes and business logic.
- Represent the default estimator-disabled configuration; the optional
  combined-probability mode is outside this preview.
- Reconcile existing production odds floor 1.01 and maximum caps with the
  requested defaults and blank-bound semantics during later implementation.
- Preserve unrelated uncommitted work, existing stashes, and linked worktrees.
  Commit only the intended sample and documentation files.

## Original preview verification

- Passed: JavaScript syntax for the single inline script, approximately 45KB.
- Passed: all 300 layout cases across ten concepts, both themes,
  320/340/390px phone widths, and 320/390/768/1056/1440px host widths. No page
  or control overflow or visibly cramped default 0.01 numeric fields remained.
- Passed for all ten concepts: requested defaults, paired input synchronization,
  Reset, blank-minimum floors, zero-match rejection, reversed probability/date
  rejection, multi-result market selection, Automatic restoration, and
  rejection when no markets are selected.
- Passed: all 20 primary buttons in the three account-label states through
  a Tweak binding test shim. No runtime exceptions during interaction checks.
- Visually reviewed: Compact toolbar and Side-tab editor screenshots. Corrected
  cramped Side-tab editor fields; revised layout checks passed.
- Original host controls were checked with a Tweak binding shim; actual
  in-conversation integration depends on host support.
- Passed: inline editor focus entry, trigger association, Escape dismissal,
  focus restoration, and whitespace checks.
- Passed: all 100 expanded/editor/tab layout states at 320px and 1056px host
  widths, without controls overflowing their product frames.
- Exhaustive keyboard accessibility has not been audited.
- Scope: isolated design samples. Production build and backend verification
  are outside this review stage; production implementation awaits selection.

## Standalone navigation follow-up — 2026-10-29

- The user opened the existing HTML file directly in Chrome. Only the first
  sample was accessible because the original fragment relied on host-supplied
  carousel navigation.
- Add a toolbar only when the fragment is the top-level page. Include
  Previous/Next, a numbered native sample picker, Show all 10, and account,
  mobile-width, and appearance controls.
- Toggle existing sections without replacing their DOM so local edits survive
  navigation. Keep the in-conversation host carousel unchanged.
- Update the README to lead with opening or refreshing the same HTML file;
  provide a simple local HTTP server as an alternative.
- Passed: all ten numbered selections, Previous/Next endpoint behavior,
  Show all 10/Show one, and preserved edited inputs during navigation.
- Passed: all three account states update all 20 action labels; 390px mobile
  width applies; light/dark selection and the UTF-8 title display correctly.
- Passed: all 100 standalone layout cases across ten concepts, both themes,
  and 320/390/768/1024/1440px host widths, without horizontal overflow.
- Passed: JavaScript syntax and whitespace checks. No runtime exceptions
  occurred during the standalone checks.
- The top-level HTTP page had both Tweak and `window.openai` undefined.
- Passed: the embedded host had no standalone toolbar, and native carousel Next
  switched from Compact toolbar to Visible field grid without duplicate navigation.
- Automated browser tools block `file:` URLs, so direct file opening has not
  been automated. HTTP checks exercise the exact file rather than a wrapper.
