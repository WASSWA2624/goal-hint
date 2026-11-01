# White page and preserved mobile slip bodies

## Scope

Use a white application canvas and filter sections on phones, tablets, and
desktops. Give formerly white components a distinct porcelain fill. Reuse the
former page color for mobile bet slip headers while preserving their body,
selection, status, and interaction colors and existing geometry.

## Implementation

- Update Porcelain Blue in the shared theme factory so live screens, native
  appearance metadata, and review screens consume the same palette.
- Keep cards, panels, menus, and navigation distinct from the white canvas.
  Preserve readable field labels and blue actions, including hovered controls.
- Add independent compact slip header and selection colors to the complete
  theme contract. Keep mobile inset bodies, selection numbers, and desktop
  slip header colors intact.
- Use the page token for shared filter section backgrounds while retaining
  distinct editable fields, actions, dialogs, and selected states.
- Extend existing theme contrast and browser acceptance checks to cover the
  white canvas, filter section, mobile headers, and preserved selections.

## Verification

- Full ESLint and application TypeScript checks passed. Final source files also
  passed scoped lint after the last formatting and documentation updates.
- All 44 focused theme, contrast, boundary, market-color, match-card, and
  slip-card tests passed. All ten theme definitions retain readable control text.
- Both production fixtures built successfully; the shared theme fixture passed
  its server-rendered markup checks.
- Browser acceptance passed 120 cases: 12 real shared screens in both active
  themes at 320, 390, 768, 1024, and 1440px. No horizontal overflow, contrast
  failure, decorative borders, or console errors occurred in this screen matrix.
- All 15 explicit background checks passed for Best slips, Matches, and Slip
  Builder filter sections at those five widths.
- All 30 collapsed-slip, expanded-slip, and open-dialog checks passed across
  both modes and all five widths. Mobile selections retain their white fill;
  the original inset, selection number, and status colors remain intact.
  Reloading preserves the selected light theme and white canvas.
- The minimal theme fixture emits expected missing-route/service-worker 404
  console messages; no uncaught page errors occurred. The screen matrix has
  complete synthetic routes and reported no console errors.
- Screenshots were visually reviewed at desktop and mobile widths. Ignored
  reports and captures are in `output/playwright/white-theme*`.
