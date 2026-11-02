# 241 · Complete application theming

- Keep main light-mode content and slip bodies white. App and dialog headers,
  footers, selected sections, status fills and slip headers may use their semantic
  theme surfaces. Preserve the complete dark appearance.
- Move component spacing, dimensions, typography, opacity, stacking, motion and
  responsive thresholds into shared theme scales. Publish primitive CSS variables
  once through GlobalStyle so native styles, keyframes and SVG fills also adapt.
- Theme the common 40px/44px fine/coarse control heights and floating-label reserve.
  Keep shared control rows, restrained semantic corners and wrapping button labels.
- Keep football-symbol palettes and portable image-export colors in the theme.
- Add a source audit and missing-token regression check to prevent local styling
  literals from returning. Verify the real public, member and owner components
  across light/dark mode, phone/tablet/desktop widths and pointer types.

Structural zeroes, percentages, fractions, grid tracks, intrinsic CSS keywords,
SVG coordinate systems and data-driven chart/pitch geometry remain local. Image
export/upload dimensions are output-format and processing constraints. Historical
design catalogs retain their authored comparison directions; production components
consume the shared theme.

## Verification · 2026-11-02

- Source contract audit, lint, type checking and production compilation passed.
- All 39 targeted theme, boundary, palette, sidebar, payment and image-export
  regressions passed.
- Browser acceptance passed 648 checks: 480 uniform-control row checks, 24 mixed
  row checks, 72 real-screen row checks, 24 page/dialog theme checks and 48 gallery
  screen checks. Coverage includes both active themes, fine/coarse pointers and
  320/390/768/1024/1440/1920px viewports. Gallery checks also verify contrast,
  white text fields, outer rails, overflow and browser errors.
- Reviewed screenshots of light slips, mobile matches, the owner workspace and
  dark matches. Generated captures and logs stay outside commits.
- The broad unit run reported 2,711 passes, 14 failures and one skip. A payment
  utility import regression was fixed and its tests passed; the database CLI
  timeout passed when rerun alone. The other 12 failures reproduced against an
  untouched baseline: existing admin navigation/exclusions, demo context, stream
  loader, settings/offline projections, published-slip and SEO expectations.
  These business and test-fixture issues remain outside the visual changes.
