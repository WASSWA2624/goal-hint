# 078 Light-theme design samples

Create ten light-theme proposals for review before implementing a selected theme.

1. Reuse the real desktop and phone match feed, controls, navigation, cards,
   performance summary and slip components with synthetic records.
2. Keep the existing layout, typography, spacing and square component corners.
   Explore page and panel separation, neutral text, restrained outlines, light
   header treatments, accent colors and readable result states.
3. Keep review palettes and their isolated Next.js fixture in
   `design/light-theme-samples/`. Production screens and theme tokens remain
   unchanged until the user selects and approves a direction.
4. Provide a browsable gallery containing both desktop and mobile for all ten
   themes. Capture actual rendered components and keep generated review output
   local and ignored.
5. Verify each theme at desktop and phone widths, check palette contrast and
   type/lint checks, then commit and push the review sources to `main`.

## Verification

- The isolated Next.js production build and its TypeScript check passed. The
  fixture rendered the real feed, seven synthetic matches, performance summary
  and slip without a provider or database connection.
- Full repository ESLint and application TypeScript checks passed. Targeted
  review-source lint, JavaScript syntax and Python compilation checks passed.
- All ten palettes rendered at 1440 × 1000 and 390 × 844, with seven cards and
  no horizontal overflow in each of the twenty screens.
- All seventy palette contrast checks passed: normal text and actions at least
  4.5:1, editable-field boundaries at least 3:1.
- The review gallery uses actual captured component markup and styles with
  embedded local assets. Generated captures, screenshots and reports remain
  ignored under `output/playwright/light-themes/`; the conversation fragment is
  saved in the thread's visualization directory.
- Browser gallery checks passed all ten theme selections and both device views
  at 1024 and 390 px, with no horizontal overflow or browser errors. Visual
  review confirmed phone cards and bottom navigation, desktop performance
  states, and the stable carousel controls.
- Application actions in the gallery are visual samples. The chosen palette
  still requires approval before any production theme implementation.
