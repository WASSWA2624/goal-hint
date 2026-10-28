# Mobile match filter and search design samples

## Approved scope

- Review duplicated mobile Matches filters and their visual relationship to the
  existing match cards.
- Produce ten interactive browser previews for the user to compare before
  selecting a production design.
- Reduce persistent filter height, give dates one editing owner, and keep search
  and refinements easy to discover.
- Match the existing cards' typography, colors, quiet boundaries, and compact
  spacing. Prefer square components and reusable preview controls.
- Keep the production mobile and desktop Matches screens unchanged. Production
  implementation requires the user's later concept selection.

## Source review

- `src/components/match/feed-filters.tsx` currently stacks search,
  status/period, the day strip, and Sort/Reset/Advanced filters. Four minimum
  44px rows and three 6px gaps imply at least 194px before summaries, counts,
  and surrounding spacing.
- Dates can be changed through Period, the Calendar entry in
  `src/components/match/feed-dates.tsx`, or the advanced sheet's date pair.
  `src/components/match/feed-controls.tsx` also repeats dates in the applied
  summary. They share one underlying date scope.
- Current immediate status/date/sort changes and draft search/advanced changes
  need an understandable applied-versus-draft presentation in a future design.
- Production defaults remain Last 30 days, Latest first, all market families,
  unrestricted time/probability, and access/status-dependent Predictions only.
  The preview intentionally starts at Today for a consistent sample snapshot.
- `src/components/match/sheet-parts.tsx` already supplies focus containment,
  Escape/backdrop dismissal, scroll locking, focus restoration, and safe-area
  spacing. Preserve these interaction qualities when implementing the chosen
  design.
- `src/components/match/match-card.tsx` and `src/styles/theme.ts` provide the
  visual reference: compact 12–13px text, flat brand selections, neutral
  borders, small padding, and market-specific accents.

## Deliverable

- Add the isolated static gallery under `design/mobile-match-filter-designs/`,
  with `index.html` as its browser entry point and an accompanying README.
- Include exactly these concepts in order:
  1. Compact stack: search, then Date/Status/Filters.
  2. Search first: one search row with date scope/filter action; status in scope.
  3. Status tabs: visible All/Live/Upcoming/Finished and a date/search/filter row.
  4. Day navigator: Previous/Today/Next and a search/filter row.
  5. Week strip: one week/date strip with Calendar and search/filters.
  6. Reveal search: one date/status/filter/search row; search expands.
  7. Filter rail: search, then horizontal Date/Status/League/Market/More.
  8. Match header: one Today · All summary with search/filter/count actions.
  9. Bottom dock: top date/status scope and search/filter above navigation.
  10. Inline expander: search and Refine summary with inline editing.
- Provide focused and all-ten views, 320/360/390/430px phone widths, light/dark
  appearance, and a shortlist.
- Reuse sample cards, filter primitives, and interaction state so the concepts
  can be compared on layout and access patterns.
- Document serving the `next-js` root with
  `python -m http.server 8348 --bind 127.0.0.1 --directory "D:\coding\apps\nextjs\goal-hint\next-js"`,
  then opening `http://127.0.0.1:8348/design/mobile-match-filter-designs/`.
  Serving this root makes the shared local font asset available.

## Behavior boundaries

- Use local illustrative data dated 2026-10-28 and the same initial Today scope
  for all ten concepts; no live match requests, backend
  integration, private configuration, or production account/query changes.
- Sheet fields edit local drafts. Apply retains edits; Cancel, Escape, and
  dismissal discard unapplied sheet changes. Keep labels and focus usable.
- Keep presets/custom ranges behind each concept's single date entry point;
  avoid duplicating date controls in the separate advanced editor.
- Preserve usable touch targets while reducing the number of persistent rows.
- Include enough card context to judge how filters and results fit together.
- Present recommendations as review judgment only. No design is preselected
  for production; the user makes the implementation choice.
- Preserve existing unrelated desktop-filter edits, stashes, and linked
  worktrees. Commit only the intended preview and documentation changes.

## Verification

- Passed: JavaScript syntax, scoped ESLint with zero warnings, and whitespace
  checks.
- Passed: all ten concepts at 320/360/390/430px in both themes (80 browser
  scenarios), with no page overflow, missing resources, or runtime errors.
- Passed: all-ten search/reset, narrow sheet sizing, date presets/custom ranges,
  Live normalization, probability and market validation, draft Apply/Cancel,
  Escape/backdrop dismissal and focus restoration.
- Passed: Advanced status reset in 04/05, off-strip date summaries, inline
  expansion/count/focus, dock clearance, gallery navigation, exact requested
  widths where space permits, and persisted shortlist.
- Passed: visual inspection of the shared light cards, narrow dark date sheet,
  bottom dock, inline editor, and gallery. All ten comparison frames load.
- Resting top filter areas measure 44–107px at 390px. Concept 09 separately
  reserves a 57px dock; the gallery reports both areas. Detailed measurements
  are recorded in the preview README.
- Scope: standalone local-data prototypes. Full application build/backend
  verification is outside this stage; production component files were not
  changed by this work.
- Awaiting user selection before any production mobile implementation.
