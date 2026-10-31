# 189 — Distinct desktop shell backgrounds

Give the shared desktop header and footer a subtly different background from
the body. Reuse `theme.color.surfaceMuted` for both: `#E8EDF5` in Light and
`#0D253B` in Dark. Keep the body, subscription bar, layout, alignment, borders,
control styles and all phone/tablet fills unchanged.

Apply the fill through the existing desktop media rules in the shared shell.
Update the theme rendering fixture's desktop header expectation. Check Light/
Dark at 1024px, 1440px and 1920px, including header/footer distinction and text
contrast. Compare original and current layout at those widths and original
mobile/tablet styling at 320px, 375px, 768px and 1023px. Run changed-file lint,
strict type checking and the existing theme/navigation tests.

Verified: all 28 theme/navigation tests, six desktop viewport/theme checks and
eight original-versus-current mobile/tablet comparisons passed. Desktop text
contrast remains at least 4.5:1. Measured layout is identical at every width.
Changed-file ESLint with zero warnings and strict TypeScript checking also
passed under Node 24.18.1.
