# 227 · Approved card separation

## Intended result

- Apply approved card-separation option 01 across Best slips, Matches, and Slip
  Builder using shared card components and theme tokens.
- Use 4px match-card corners, 8px slip corners, and distinct page, slip body,
  header, card, and frame colors in both themes. Remove the old square leading
  slip rail in favor of the approved uniform frame.
- Increase spacing only below the existing 64rem desktop breakpoint: 8px between
  standalone matches, 6px between nested selections with 6px inset padding, and
  14px between slips. Preserve desktop continuous rows and 4.5px slip gaps.
- Preserve slip disclosures, sharing, original selections, match navigation,
  keyboard focus, and existing unrelated work.
- Keep mobile and desktop disclosure indicators stationary: right-facing when
  collapsed, down-facing when expanded, with separate space for Share.
- Align mobile Share and disclosure controls on one horizontal axis, with
  matching 28px frames, 4px corners, and a 10px gap. Reserve their width in the
  first header row and keep match-count metrics on the clear row below.
- Round the mobile full-card analysis overlay to the inner frame radius, so
  pressed fills and keyboard focus follow the visible match-card corners.
- Remove extra header action padding vertically and reduce their own minimum
  height to 28px. Give Sign In and theme toggles visible soft-blue fills while
  preserving header rails, horizontal sizing, and centered alignment.
- Mobile slip headers share the match-card surface in both states; desktop slip
  headers use blue `#DCE8FB`. Use explicit inner radii for native disclosure
  headers/content so their fills cannot cover the 8px outer frame.
- Use filled filter actions without borders across status/date/category controls
  and remove borders from the shared match/slip status badges. Preserve selected
  fills, input boundaries, keyboard focus, and filter behavior.
- Remove the Best slips applied-filters caption and move its date/status/range
  summary into the first row without changing filter application.
- Give expanded slips a thin card-surface frame (white in light mode), using a
  2px outer ring plus its existing 1px border, without changing layout dimensions
  or arrow/action positions.

## Implementation

- Extend `phoneCardFrame` with inset/header colors and consume its shared radius
  in both standalone match cards and compact slip selections.
- Reuse one `SlipList` spacing rule across Best slips and Slip Builder instead
  of screen-specific phone gap overrides.
- Update the theme acceptance checks and documentation for the approved corners
  and contrasting compact surfaces.

## Verification

- All 151 focused theme, boundary, match/slip card, navigation, filter, and slip
  generation tests passed. Full application TypeScript and scoped ESLint passed.
- The final isolated Next production build compiled real Best slips, Matches,
  Slip Builder, and mobile/desktop Matches filter components with synthetic
  records. All native slip rendering/access/generation acceptance cases passed.
- All 1,469 production-browser assertions passed at 320, 375, 430, 768, 1024,
  and 1440px in both themes: card/overlay/header corners, surface colors, mobile
  gaps, unchanged desktop density, expanded frames, stationary right/down arrows,
  matching Share controls, clear metrics, 28px filled header controls, borderless
  badges, caption removal, native keyboard expansion, and visible focus.
- Another 72 production-browser assertions passed for real Matches and Best
  slips filters at mobile/desktop sizes in both themes: borderless controls,
  filled status/date actions, and the compact applied-summary row.
- Reviewed light/dark mobile and desktop screenshots. Browser checks observed no
  JavaScript exceptions. Fixtures use anonymous synthetic account state and omit
  live match-state polling and service-worker endpoints; those integrations were
  not exercised by this presentation change.
