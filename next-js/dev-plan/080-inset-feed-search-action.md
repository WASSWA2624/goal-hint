# 080 Inset feed search action

Place the Search action inside the right edge of the match-feed search field.

1. Share one input group between phone and desktop feed controls, preserving the
   existing field shape and square joined edges.
2. Keep the text input and native submit button in separate grid columns within
   one field border so typed text and the browser's clear control cannot overlap
   the action. Preserve accessible naming, keyboard focus and theme colors.
3. Keep each parent form's existing search, draft validation and Enter behavior.
4. Verify light/dark phone, tablet and desktop layouts, click/Enter submission,
   focus and long input; run relevant checks and commit/push `main`.

## Verification

- Targeted ESLint, application TypeScript and all twenty-four existing
  feed-control/query tests passed.
- An isolated production fixture compiled successfully using the actual feed,
  shared input and current light/dark themes with synthetic records.
- Browser checks passed at 320, 390, 768 and 1440 px in both light and dark
  modes. The action stays within the field's right edge, with no text overlap or
  horizontal page overflow, including a 120-character query.
- Search clicks and Enter both normalized the query, reset pagination and kept
  active filter selections. Keyboard focus and native search clearing passed;
  clearing remained a draft until submission.
- Phone and desktop screenshots were visually inspected. Generated fixture,
  screenshots and reports remain local and ignored; fixture-only missing offline
  worker/favicon resources were excluded from application behavior checks.
