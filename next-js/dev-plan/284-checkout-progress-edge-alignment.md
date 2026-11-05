# 284 — Checkout progress edge alignment

## Scope

Align the shared Package → Pay → Details → Review indicator with each screen's
content rails. Preserve the concurrent Pay and Details body layouts and variant
dispatch. Pay owns the combined checkpoint and push after coordinated QA.

## Implementation

- Apply one connected progress treatment to every four-step wizard, independent
  of the body variant. Preserve the existing three-step presentation.
- On phones/tablets, place the first marker and label on the left content edge
  and the fourth marker and label on the right. Equally space marker centers
  between these anchors; center each middle label beneath its marker.
- Keep compact desktop inline markers/labels and stretch the outside groups to
  the same content rails. Connectors use shared spacing and size tokens.
- Restrict source changes to progress styles/rendering in `payment-wizard.tsx`.

## Verification

Check every active step in light/dark themes at narrow phone, tablet and desktop
widths: exact outer alignment, equal mobile marker spacing, contained labels,
correct current/completed states, and unchanged body bounds. Run scoped lint.
Coordinate staging with Pay so no incomplete shared-file changes are committed.

## Results

- Scoped ESLint and diff whitespace checks passed.
- Browser geometry checks passed for all four active states in both themes at
  320, 390, 768, 1024, 1440, and 1920px (48 state/theme/width combinations).
- First and last groups align to the content edges; mobile outside labels align
  to the same rails and all marker-center gaps are equal within one CSS pixel.
- All labels remain contained, desktop labels remain inline, current-step state
  is correct, and there is no horizontal page overflow.
- Pay owns staging, final combined build verification, commit and push. Other
  concurrent screen changes remain intact.
