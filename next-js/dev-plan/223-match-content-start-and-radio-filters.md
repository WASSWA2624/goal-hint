# 223 · Match content start and radio filters

## Intended result

- When changing tabs after scrolling down, reveal the new section's beginning
  directly below the sticky tabs and desktop header. Reset the previous section's
  excess reserved space before paint. Keep near-top switches and controls within
  a section stable, without remounting the prediction or navigating the page.
- Show Teams, Venues and Matches in one labelled desktop row with clear vertical
  separators. Keep these radio groups stacked on mobile.
- Replace mobile Team Stats venue and result-window dropdowns with the shared
  native radio groups, retaining URL state and existing desktop controls.
- Replace the Lineups Player detail dropdown with radio choices on both screen
  sizes. Preserve pitch, team sheets, availability and supplied player values.
- Keep Markets & Odds, Players and News & Insights controls unchanged.

## Verification

- Extend native browser acceptance for scrolled content resets, stable sticky
  navigation and the unchanged prediction, compact responsive filter groups,
  radio selection and persistence, desktop exclusions, keyboard behavior,
  mobile pitch and access boundaries.
- Full TypeScript, scoped ESLint and all 35 focused view/navigation tests passed.
  The native production fixture compiled successfully. All 256 browser checks
  passed without console errors, including 80 content switches at four screen
  widths and four scroll depths, mobile centering, desktop separators, all five
  lineup detail modes, team sheets and mobile statistics radio persistence.
- Reviewed the desktop results row, mobile statistics and full mobile lineup
  screenshots. The live preview at localhost:3118 remains connected to shared
  source changes. No access rules, fixture data or excluded tab controls changed.
- The additional legacy lineup suite reported two 320px player-target overlap
  failures. A read-only comparison with the previous compiled preview confirmed
  the same 281 × 421.5px pitch and exactly the same nine overlapping target pairs.
  This pre-existing limitation remains; pitch positioning and target geometry
  were preserved as requested. Other legacy lineup checks passed.
