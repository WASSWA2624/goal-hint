# 081 Desktop search title row

Replace visible feed page titles with the existing search field on desktop.

1. Move search into the first filter row beside the period selector, removing
   the separate search row and visible Period label.
2. Keep semantic page headings and accessible selector names without displaying
   them. Hide the fallback desktop heading too, avoiding a title flash before
   hydration. Keep the phone layout and other filters unchanged.
3. Verify both themes at desktop widths, including search submission and period
   selection, plus unchanged phone rendering. Run targeted lint and TypeScript,
   then commit and push the integrated change to `main`.

## Verification

- Targeted ESLint and application TypeScript passed. The actual shared feed
  compiled in an isolated production fixture.
- Twelve desktop browser cases passed: 1024 and 1440 px, light and dark modes,
  and Matches, Live and Results. Each rendered one search field beside the
  selector, matching 44 px heights, no visible title or Period prefix, an
  accessible semantic heading/selector name and no horizontal overflow.
- Search clicks, Enter, period changes, pagination reset and preservation of
  applied filters passed. Phone field, toolbar and first-card geometry at 390 px
  matched the previous layout in both themes. Screenshots were inspected.
- Generated records and browser output remain ignored under
  `output/playwright/desktop-search-row/`. Only the fixture's known missing
  offline-worker registration messages occurred.
