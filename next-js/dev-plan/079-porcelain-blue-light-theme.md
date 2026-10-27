# 079 Porcelain Blue light theme

Implement approved light-theme sample 01 across the shared web application.

1. Promote the Porcelain Blue page, card, header, typography-color, border,
   input, navigation, focus and primary-action tokens into `lightTheme`.
2. Use the approved flat market fills, softer market tints and tinted performance
   states while preserving market and result meanings.
3. Preserve typography, spacing, dimensions, square corners, behavior and every
   resolved dark-theme value. Keep the Flutter app as the shared web host.
4. Update palette/contrast regression assertions and the styling documentation.
5. Verify shared components in production fixtures at phone, tablet and desktop
   widths, theme switching/persistence, inputs and dialogs. Run lint, TypeScript,
   targeted tests and the production build, then commit and push `main`.

## Verification

- Full ESLint, application TypeScript, forty targeted theme/market/card/native
  appearance/performance tests and the production build passed. The updated
  offline manifest generated successfully with twenty-four pinned assets.
- The shared synthetic production fixture passed SSR and browser checks in
  light mode at 320, 390, 768 and 1440 px, and dark mode at 390 and 1440 px,
  without horizontal overflow. Phone and desktop screenshots were inspected.
- Theme toggling, preference persistence after reload, native appearance
  metadata, visible keyboard focus and real modal surfaces passed in both modes.
- The entire resolved dark-theme object matched its pre-change snapshot exactly.
  Light typography, spacing, breakpoints, layout, controls and border geometry
  also matched their original values.
- Browser artifacts remain ignored under `output/playwright/porcelain-blue/`.
  The isolated fixture does not include the offline worker, so its registration
  logs expected 404 responses; the production offline bundle built successfully.
