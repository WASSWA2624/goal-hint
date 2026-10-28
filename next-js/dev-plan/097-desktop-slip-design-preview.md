# Ten compact desktop slip samples

## Scope

- Prepare ten desktop-only options for selection before production integration.
- Keep slip number, optional rank, total odds, selection count, average match
  probability and native expansion indicator on one summary row.
- Limit each selection to two rows: league/country/kickoff first, then full teams,
  market/prediction, individual odds and individual probability. Supplied saved
  results fit those same two rows.
- Show small team/league logos at text height, square frames and readable spacing.
- Preserve the current mobile and production slip layouts for this review stage.

## Implementation

- Reuse snapshot formatting and native disclosure semantics with optional logos
  and rank visibility; their defaults retain current production behavior.
- Add a separate non-indexable desktop review route, ten scoped layout wrappers,
  local illustrative crests and copied synthetic records.
- Show collapsed and expanded examples with context, width, theme, long-name,
  eight-selection and saved-result controls.

## Verification

- Full ESLint and optimized production build passed, including TypeScript and
  offline-manifest generation. All 13 snapshot/prediction-label tests passed.
- Browser checks covered all ten designs in 24 width/theme/sample combinations:
  960/1120/1360px canvases, light/dark, typical/long-name/eight-selection/settled.
  Headers stay on one 44px row; matches occupy exactly two rows at 44–51px.
  No field overflow, column overlap or saved-result placement failures occurred.
- Verified initial collapsed/expanded pairs, Enter/Space, context and rank
  controls, individual inspection and decoding of all local sample logos.
  League/team logos remain 12/13px high at default text size.
- Independent review verified long names and saved scores at 960px and retained
  two rows without overlap at 200% text. Narrow windows scroll inside review
  canvases without page overflow.
- Confirmed the existing mobile gallery retains its original grid and has no
  desktop overrides or logos. Production/mobile layout defaults are unchanged.
- Visually inspected the ten-option comparison and full-size focused sample.
  Screenshots and browser scratch scripts remain ignored local output.
