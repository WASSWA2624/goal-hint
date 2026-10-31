# 212 · Adopt the approved application themes

## Selection

- Light mode: 01 · Porcelain Blue.
- Dark mode: 08 · Cobalt Night.
- Use the exact reviewed complete theme objects, including typography, quiet
  borders, corners, spacing, aligned gutters, motion, and native chrome colors.

## Implementation

- Promote the selected directions and shared theme factory into production
  styles, keeping semantic foundations separate from active application modes.
- Keep the existing `lightTheme` / `darkTheme` exports, theme preference,
  system detection, SSR fallback, and native appearance projection intact.
- Make the review gallery reuse the same approved objects. Keep all ten review
  directions identical to their pre-adoption definitions.
- Update palette and rendered checks to the selected designs, including mixed
  border colors, quiet dark result fills, and rounded desktop slip frames.
- Preserve unrelated match-details preview work, all existing stashes, and
  detached worktrees. Commit only this theme adoption.

## Verification

- `npm run typecheck`: passed.
- Targeted ESLint and Git whitespace checks: passed.
- 35 theme, palette contrast, navigation, boundary, selected-review identity,
  preference, and native appearance tests: passed.
- Captured all ten reviewed definitions before the move and compared every
  resulting object afterward: unchanged.
- Production rendering fixture build and SSR assertions: passed.
- Exact rendered color, corner, frame, branding, and overflow checks passed in
  both modes at 1440px, 1280px, 768px, and 390px. Reduced motion was used for
  deterministic color assertions; normal 160ms feedback was verified separately.
- Live application Help and Best Slips rendered the selected light/dark palettes.
  Live Help checks confirmed dark preference survives reload, saved light mode
  overrides system dark mode, and both modes fit a 390px phone viewport.
- Dialog surface, 8px corners, focus containment, and native metadata checked.
- The isolated fixture omits unrelated navigation/offline-worker endpoints;
  those synthetic-only resource 404s are outside the appearance assertions.
