# Borderless filled components

## Scope

Apply the approved header action treatment throughout the shared web app and
all ten complete theme definitions. Preserve the existing mobile card spacing,
subtle shared radii, disclosure geometry, form behavior, and business rules.

## Implementation

- Set decorative border and accent widths to zero in the theme foundations and
  theme factory. Derive distinct field and hover fills from each palette and
  strengthen caption contrast on those fills.
- Remove explicit component borders, decorative outlines, inset-shadow frames,
  selection rails, and slip-header separators. Match chips also remain borderless.
- Reuse filled field/action styles across public and admin controls. Give forms,
  filters, date selectors, numeric inputs, phone controls, menus, dialogs, cards,
  account/payment panels, feedback, and loading surfaces appropriate tonal fills.
- Use filled selections, inset floating labels, alternating table/match rows,
  and spacing to retain hierarchy. Keep keyboard focus indicators and meaningful
  graphics such as disclosure chevrons, charts, and football-pitch markings.
- Keep native checkbox/radio semantics with filled visuals, checked marks, and
  a forced-color system fallback.

## Verification

Theme contrast tests cover filled field text and captions in all ten definitions.
Browser acceptance checks computed border widths on actual shared screens and
controls, including desktop/mobile and expanded menus/dialogs.

- Full ESLint and application TypeScript checks passed. Final changes to the
  loading indicator and browser acceptance helper also passed scoped lint.
- 116 focused theme, control, match/slip card, navigation, phone, account, and
  paywall tests passed. All ten palettes retain readable field/action text.
- Production fixtures built successfully. Desktop acceptance passed 120 cases
  (12 screens across all ten themes). The final build passed another 72 cases:
  both active themes across all 12 screens at 1440, 390, and 320px, without
  decorative borders, overflow, contrast failures, or console errors.
- All 18 collapsed-slip, expanded-slip, and open-dialog checks passed in both
  active themes at all three widths. Fourteen interaction checks passed,
  including keyboard focus, filtering, disclosure, sharing-related observation,
  navigation, persistence, and reduced motion.
- Loading tracks have opacity zero while idle and become visible with a named
  progress indicator while loading. They no longer form permanent header edges.
- An AST comparison of 103 changed component files confirmed unchanged code
  outside style templates, apart from removing an unused CSS helper.
- The broad application suite was stopped after unrelated existing navigation
  assertions and database-tool timeouts. The admin-navigation failures were also
  reproduced against the saved baseline; they are outside this styling change.

Ignored screenshots and browser reports remain in `output/playwright/borderless/`.
