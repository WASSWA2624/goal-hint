# 247 · Align page filters with the app header

- Reuse the shell's themed content gutter for the page-level filters on Best
  Slips, Matches and Slip Builder, removing the extra horizontal section inset.
- Share the treatment through `pageFilterPanel`, retaining vertical spacing,
  control heights, responsive wrapping and other panels' existing insets.
- Apply it to both the native/phone Matches form and the enhanced desktop
  toolbar so hydration preserves the same alignment.
- Verify actual control edges against the desktop/phone header in both themes,
  including narrow screens and coarse pointers, and check for horizontal overflow.

## Verification

- All 18 focused theme, theme-contract and provider-boundary checks passed.
- Changed-file ESLint and TypeScript validation passed.
- Chrome passed 72 real-page combinations: three screens, light/dark themes,
  fine/coarse pointers and 320/390/768/1024/1440/1920px widths. Panel and outer
  control edges matched the visible header within one pixel. The shared layout
  audit found no clipped controls, control-size errors or horizontal overflow.
- Inspected desktop and phone screenshots, including hydrated desktop Matches
  and both theme versions of Slip Builder. Screenshots and measurements stay in
  ignored `output/playwright/header-filter-alignment/`.
- The production build and full business-rule suite were not rerun for this
  spacing-only change.
