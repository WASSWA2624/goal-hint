# Compact mobile matches filters

## Scope

- Implement the user's selected concept 1, Compact stack, below the 64rem
  desktop breakpoint.
- Use one full-width search row with a labeled submit icon, followed by a
  Date button, match-status selector, and icon-only Advanced filters button.
- Use square controls, 12–13px Manrope labels, theme borders and colors, and
  targets of at least 44px to match the mobile match cards.
- Keep spacing minimal: no extra compact-panel inline padding and 4px row/control
  gaps. Use 10px date-sheet body padding, 10px section gaps, and 4px preset gaps
  while retaining 44px targets.
- Remove the enhanced phone day strip, second period selector, persistent
  sort/reset row, and repeated active Showing summary.
- Keep the enhanced desktop toolbar and dialog behavior unchanged. Preserve
  the original server-rendered native GET form and no-JavaScript fallback.

## Interaction

- One date sheet contains all nine relative presets and custom From/To dates.
  Date edits remain local until Apply dates; Cancel, Escape, close, and backdrop
  dismissal discard them and restore focus to the Date button.
- Preserve named presets across midnight and reuse the established query/date
  validation. Live selects Today, clears time restrictions, and disables dates.
- Match status keeps its immediate application behavior. Search applies through
  its submit icon or Enter, with normalization at submission.
- Preserve immediate typing through hydration: the initial provider query must
  not reset the draft through a deferred effect. Synchronize real canonical
  query changes before paint.
- Advanced filters contains sorting and the existing optional filters, with
  Reset filters and Apply filters at its foot. It contains no duplicate dates.
  Sorting joins its local draft and applies with Apply filters.
- Preserve searchable league/country lists, market minimums, probability and
  kickoff-time validation, subscriber restrictions, timezone behavior, applied
  counts, focus containment, scroll locking, and responsive sheet dismissal.
- Preserve Last 30 days, Latest first, market and Predictions-only defaults,
  URL parsing/navigation, Back restoration, and the stored feed service.

## Verification

- Scoped ESLint and the full application TypeScript check passed. All 48
  targeted query, control, state, pagination and feed-page tests passed, with
  no skips.
- The isolated optimized production build passed using the existing SQL
  capture. All 46 server-rendered scenarios, 11 status/date redirects, and
  five invalid-query guards passed. No fresh database capture or full
  application production build was run.
- Mobile controls passed at 320/360/390/430/1023px in both themes. The resting
  panel measures 93px, with zero additional inline padding and 4px gaps.
  Controls retain square edges and 44px targets, including in a fresh coarse
  pointer context. At 200% text, 320/390px layouts remain usable without
  overlap or page overflow; the panel grows to 143px.
- Date presets, custom-range validation/Cancel, Apply dates, Live/Today
  locking, sorting drafts/Cancel/Apply, reset defaults and local badge counts
  passed. Draft edits made no feed requests. Escape/Tab focus containment,
  focus restoration, date-sheet scroll unlock and resize dismissal passed.
- Three immediate search submissions after fresh page loads passed with the
  captured league results and retained input. Query synchronization now skips
  a redundant mount reset and completes real changes before interaction.
- The existing desktop acceptance passed unchanged at 1024/1440px, including
  all five dialogs, local resets, independent counts, Cancel rollback,
  unrelated drafts, complete Apply, Back restoration, and responsive lifecycle.
- Unified desktop/mobile status and future-period checks passed, along with
  JavaScript-disabled native future periods, Live/Today and custom archives.
- Visual checks covered light and dark phone controls, dates and advanced
  sheets. The capture intentionally lacks some badge/offline-worker assets;
  existing logo fallbacks remain usable, and mobile checks reported no
  JavaScript exceptions. Generated build, capture and screenshot output stays
  outside commits.
- Keep only the intended source, acceptance scripts and documentation in the
  commit; preserve the existing stashes and detached worktree files.
