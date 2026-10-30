# 171 — Clearer match scores and clock

## Scope

- Reuse larger score figures and a wider separator across desktop Matches,
  expanded slips, Slip Builder, mobile match cards and compact saved results.
- Use the theme's red for live scores and keep finished scores steady.
- Bring FT, HT and supplied minutes closer to the score separator without
  changing card heights, desktop columns or surrounding typography.
- Animate only the minute prime, including supplied stoppage-time clocks;
  reduced motion retains a still glow. Preserve localized text, accessible
  score descriptions, saved-result boundaries and missing-score fallbacks.

## Verification

- TypeScript, scoped ESLint, Python syntax and whitespace checks passed.
- All 32 focused match-card, saved-slip-card and stoppage-time tests passed.
- Both isolated production fixtures built successfully. Match-card SSR passed
  all 13 examples; desktop-slip SSR passed all 12 scenarios.
- Playwright passed 6,641 checks across 20 before/after comparisons: Matches,
  Slip Builder and saved desktop results, in light/dark themes at 1440/1024px
  and responsive routes at 390/320px. Card dimensions, relative spacing and
  column geometry stayed unchanged. Scores render at 16px with a 16px separator
  slot; live scores match the red live palette. Digits and clock labels remain
  unanimated, while only the minute prime glows. Reduced motion keeps it still.
- Visually reviewed desktop and mobile Matches captures. Synthetic fixture
  logo DNS failures and the fixture's absent service worker remain isolated
  acceptance-environment limitations.
