# 165 — Global corner radius system

## Scope

Replace the square-corner preference with a subtle shared radius scale based
on the Best slips date controls. Keep the web application in `next-js/` so the
Flutter host receives the same interface.

## Implementation

- Define `shape.radius` in the brand tokens and expose it as `theme.radius` in
  both themes: 2px small items, 4px controls, 6px surfaces and 8px overlays.
- Migrate shared UI, navigation, matches, slips, account/payment flows,
  analytics and owner screens to semantic tokens.
- Remove broad descendant resets that forced nested components square.
- Preserve straight joined seams and functional circle/pill geometry; match
  exposed header/row corners to their outer frame without clipping overlays.
- Apply the record-card radius at every breakpoint and share the phone frame
  between compact slips and match cards.
- Update brand exports, their generator, the repository policy and design docs.
- Extend the existing browser acceptance fixture to check resolved radii on
  production components, including nested admin/payment controls.

## Verification

- Repository ESLint, TypeScript and the integrated production build passed,
  including offline bundle generation. Final scoped lint and TypeScript checks
  also passed after refining the rendering fixture.
- All 104 focused Node checks passed; the 15 theme/slip-card checks passed again
  after the final phone-frame refinements.
- The production theme fixture passed SSR verification. Browser checks passed
  in light and dark themes at 320, 390, 1024 and 1440px, including resolved
  corner values, joined segments, shared controls, admin/payment nesting,
  match/slip frames and no page overflow.
- Both phone dialog checks passed: 8px dialog, 4px field and focus inside the
  modal. Desktop date controls and the existing custom menu/dialog were also
  inspected. Phone screenshots were visually reviewed.
- Brand generator syntax and source/exported JSON/CSS token consistency passed.
- A full-suite pass is not claimed: the broad run encountered the existing
  owner phone-form source assertion, also reproduced against the pre-refactor
  revision, and was stopped. The unrelated assertion was left unchanged.
