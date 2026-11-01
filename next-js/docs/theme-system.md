# Application theme contract

`src/styles/theme.ts` exposes the active application themes used by public
screens, slips, matches, account workspaces, and owner dashboards:

- Light mode uses **01 · Porcelain Blue**.
- Dark mode uses **08 · Cobalt Night**.

`theme-presets.ts` owns the approved definitions and shared construction logic.
`theme-foundation.ts` defines `GoalHintTheme` and the semantic foundations. The
desktop review catalog reuses the exact approved production objects and builds
the other review directions from these foundations. Appearance changes belong
in the shared definitions rather than screen-specific CSS.

The existing saved light/dark preference, operating-system preference, server
fallback, and native appearance metadata all consume the same active exports.

| Visual decision | Theme group |
| --- | --- |
| Page, card, field, text, selection, market, and result colors | `color` |
| Action fills and table surfaces | `gradient` |
| Header surfaces, navigation, logo polarity, and height | `header` |
| Body and heading families, sizes, weights, and line heights | `typography` |
| Spacing, content rails, gutters, reading width, and control sizes | `space`, `layout`, `control` |
| Shared corner geometry and desktop card frames | `radius`, `frame` |
| Zero decorative border widths and visible keyboard focus outlines | `border` |
| Mobile match borders, corners, and slip body/header separation | `phoneCardFrame` |
| Hover elevation and overlay depth | `shadow` |
| Control, disclosure, and surface transitions, including reduced motion | `motion` |
| Hover brightness and pressed feedback | `interaction` |
| Scrollbar thumb and track treatment | `scrollbarColor` |

When a visual adjustment needs a setting that does not exist, add an appropriate
semantic token to the contract and defaults, then consume it in the reusable
component. A screen must not branch on a theme name or define its own palette,
font override, radius, or interaction timing. Keep structural component markup
and behavior separate from these visual decisions.

Small layout refinements belong in shared spacing, layout, and control tokens.
Use `desktopContentPadding` and `theme.layout.gutter` for shared section rails,
including page headings, panel headings, and panel bodies. Account for the
parent panel's border rather than adding another nested gutter. Favor a flat
surface hierarchy; use tonal fills and spacing to separate sections before
adding another framed panel.
Keep the approved composition unless a deliberate theme adjustment calls for a
change. Preserve default token values when replacing an existing literal so
unrelated layouts retain their established geometry.

All production components use filled surfaces without decorative borders, accent
rails, or inset-shadow frames. `border.width` and `border.accentWidth` are zero in
every theme. Editable fields use `color.field` and `color.fieldHover`; secondary
actions use `color.brandSoft`. Captions are adjusted toward the palette's text
color to retain at least 4.5:1 contrast on filled fields. Shared field, action,
and table treatments live in `components/ui/filled-surfaces.ts`. Keyboard-only
focus outlines remain visible, including on controls whose inner input is
transparent. Native checkboxes and radios use solid fills and explicit checked
marks, with a system appearance fallback in forced-color mode. Soft directions
use the shared 8px surface corner; crisp directions
use the smaller scale. Their spacing tokens reduce unnecessary panel padding
and workspace gaps without shrinking control targets or compromising contrast.

The review-only navigator owns its own positioning. Its measured height offsets
the real app headers and sidebars; it is not part of the selected app theme.
No review-only appearance overrides are required for headings, logos, header
fills, text selection, scrollbar colors, or interaction treatment.

Porcelain Blue uses a white page (`#FFFFFF`) at every viewport width. Shared
cards, panels, menus, navigation, and header surfaces use cool porcelain
(`#EDF1F7`) so their fills remain visible against the page. Filter sections share
`color.page`; their fields, buttons, and selected states retain contrasting fills.
The palette can override `fieldHover` to keep blue labels readable on hover.
Mobile slip headers reuse the former page color (`#EDF1F7`) through
`phoneCardFrame.mobileHeader`. Their inset body (`#E9EEF6`) and white selections
(`phoneCardFrame.selection`) keep their original colors, including selection
number fills. Desktop slip headers retain `#DCE8FB`. These independent settings
prevent app-wide surface adjustments from recoloring mobile slip bodies.
Cobalt Night and the review palettes derive compact headers and selections from
their existing surfaces through the same contract.
Match tiles share 4px corners and slip frames use 8px corners. Below 64rem,
standalone matches have 8px gaps, nested selections have 6px gaps and padding,
and Best slips and Slip Builder both have 14px between slips. Desktop retains
continuous match rows with alternating tonal fills and 4.5px between slips.
Filter actions use filled surfaces without borders; status badges retain their
semantic fill/text colors without outlines. Header account/theme actions keep
28px minimum height, no vertical padding, and clearly visible filled backgrounds
inside the unchanged header rails. Slip header fills use an explicit inner
radius because native disclosure slots do not reliably inherit corner properties.
Expanded slips use the same borderless frame as collapsed slips; header and
selection-tray fills keep them visually joined. Disclosure controls retain their
fixed positions. Match chips also use filled backgrounds without borders.

Readability tests validate all ten complete definitions. Browser acceptance
checks the actual shared screens. Business rules, data services, form actions,
and event handlers must remain unchanged by theme work.
