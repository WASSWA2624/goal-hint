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
