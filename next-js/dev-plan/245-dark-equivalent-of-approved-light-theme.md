# 245 · Dark equivalent of the approved light theme

- Treat Porcelain Blue as the source of truth for composition. Inherit its font
  and shape choices, and keep spacing, control geometry, corners and responsive
  behavior shared between modes.
- Replace the white content canvas with one deep navy surface for page, cards,
  filters, slip bodies/selections and field bodies. Use a distinct shared chrome
  layer for app/dialog/slip headers and footers, plus quiet section and selection
  fills. Retain thin visible separators and outlined input bodies.
- Keep primary header actions on the approved light-theme blue with white labels
  and readable hover contrast through explicit shared
  action roles; lighter blue navigation/focus colors remain independent. Preserve
  every existing light-theme token value and rendered treatment.
- Verify contrast and structural parity in unit tests, then inspect real public,
  member and owner screens and open dialogs at phone, tablet and desktop widths.
- Preserve concurrent layout work, linked worktrees and stashes; commit and push
  only this task's intended changes on main after verification.

## Verification

- All 31 targeted theme, source-contract, boundary, market-color, native-appearance
  and slip-image tests passed. Contrast includes the primary header hover state.
- The final production build and changed-file ESLint passed. The rebuilt production
  fixture also typechecked the rendering helpers.
- A before/after comparison confirms every existing light-theme token is unchanged;
  the two added header-action roles reproduce its existing colors exactly.
- Browser checks passed for 144 screen/theme/width combinations, 36 comparisons of
  actual light/dark component geometry, and 48 page/open-dialog states in fine and
  coarse pointer contexts. Widths: 320, 390, 768, 1024, 1440 and 1920px.
- Cached repeated color conversions and added a check revision to the fixture so
  browser automation waits for a fresh completed result after theme/viewport changes.
- The full business-rule suite was not repeated; its previously documented baseline
  failures are outside this palette update. Concurrent layout work is preserved.
