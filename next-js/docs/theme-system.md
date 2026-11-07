# Application theme contract

`src/styles/theme.ts` exposes the active application themes used by public
screens, slips, matches, account workspaces, and owner dashboards:

- Light mode uses **01 · Porcelain Blue**.
- Dark mode uses **08 · Cobalt Night**.

The approved light theme is the composition reference for its dark equivalent.
The dark direction inherits its font and shape choices from Porcelain Blue;
spacing, dimensions, radii, control heights and responsive rules remain identical.
Both modes use one main content canvas, distinct shared app/dialog/slip chrome,
a quieter selected-section layer, outlined input bodies and thin row separators.
Cobalt Night replaces white with a deep navy canvas and uses lighter blue links,
soft selected fills and the same approved primary blue with white labels,
including a readable header hover state. Header primary
actions consume `action.headerPrimaryBackground` and `headerPrimaryText`, keeping
their emphasis independent of the lighter link and focus colors.

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
| Text entry, selects, field adornments and validation fills | `textField`, `select`, `fieldAdornment` |
| Quiet and header action surfaces | `action` |
| Measured popover/workspace geometry and portable image paper | `ui`, `media` |
| Header surfaces, navigation, logo polarity, and height | `header` |
| App footer and dialog header/footer surfaces | `footer`, `dialog` |
| Body and heading families, sizes, weights, and line heights | `typography` |
| Spacing, content rails, gutters, reading width, and control sizes | `space`, `layout`, `control` |
| Primitive spacing and dimensions, reading measures and local responsive thresholds | `spacing`, `size`, `measure`, `relativeSize`, `viewport` |
| Layering, transparency and physical football-symbol colors | `layer`, `opacity`, `illustration` |
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

`theme-tokens.ts` owns the primitive scales. Spacing steps use a 4px unit; size
steps use a quarter-rem unit. Fractional steps support compact icons and tables.
`theme-css.ts` publishes these values once on `html`, along with typography,
stroke, opacity, stacking and motion variables. Reuse `var(--gh-spacing-2)` for
an 8px gap and `var(--gh-size-8)` for a 2rem dimension. Semantic roles such as
`theme.layout.gutter`, `theme.radius.control` and `theme.color.surface` remain
the preferred interface when a component already has an appropriate role.

Light-mode content and slip bodies use the white surface. Headers, footers,
dialog chrome, selected sections and semantic status fills can use other theme
surfaces. Exported slips and flattened screenshot uploads use the shared light
palette for portable, readable images regardless of the sender's appearance.
Best Slips and Slip Builder filters use `color.surface` as well. Their controls
scroll in normal document flow, along with Matches and analytics filters.
Use `layout.sectionPadding` for filter insets and `layout.slipGap` between
separate slip cards; joined selections inside a slip keep their own separators.

Run `npm run test:theme:contract` to audit styled CSS and inline style values.
The unit suite also checks that every geometry variable has a definition.
Structural zeroes, proportions, grid fractions, intrinsic sizing, SVG paths and
data-driven chart/pitch coordinates stay local. Fixed output-image constraints
and historical design catalogs are deliberate exceptions, not screen palettes.

Small layout refinements belong in shared spacing, layout, and control tokens.
Use `desktopContentPadding` and `theme.layout.gutter` for shared section rails,
including page headings, panel headings, and panel bodies. Account for the
parent panel's border rather than adding another nested gutter. Favor a flat
surface hierarchy; use tonal fills and spacing to separate sections before
adding another framed panel.
Keep the approved composition unless a deliberate theme adjustment calls for a
change. Preserve default token values when replacing an existing literal so
unrelated layouts retain their established geometry.

Production components use filled surfaces without accent rails or inset-shadow
frames. `border.width` and `border.accentWidth` are zero in every theme. Slips
have a deliberate exception: selection separators use `phoneCardFrame.ruleWidth`
and `phoneCardFrame.separator`. The slip perimeter uses `spacing[2]` in the
slip header fill on every edge.
`phoneCardFrame.inset` controls the slip body independently. Editable
text inputs and textareas use `textField.background`, `textField.hoverBackground`,
and `textField.borderWidth`, with `color.controlBorder` for their boundary.
Porcelain Blue keeps these fields white at rest, on hover, and while focused,
with a 1px border. Cobalt Night uses its deep navy content fill in the same
states, with the same outline geometry and a quiet blue focus tint.
Composite search and range controls frame the whole field
once and leave their inner input transparent. Disabled and invalid states keep
their semantic fills. Other controls use `color.field` and `color.fieldHover`; secondary
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

Porcelain Blue uses white for page, content, menus, fields and slip bodies at
all viewport widths. Selected controls and semantic result fills remain distinct.
Headers and footers consume their own appropriate theme roles. Slip body,
header, selection and separator colors are independent, so a white canvas does
not erase the thin boundaries between matches. Cobalt Night and the review
palettes derive the same roles from their own surfaces.

Match lists use joined square rows and thin themed separators. Standalone
Team stack cards use `phoneCardFrame.radius`; slip frames use the shared surface
or desktop frame radius. Selections inside slips use a shared joined stack on
mobile and desktop: no row gap, themed inset padding, and thin separators. Only
the first selection has rounded top corners and only the last has rounded
bottom corners. The rules live in `components/slips/joined-slip-styles.ts`.

Form fields, buttons, tabs and pagination share the inherited
control metric: 40px for fine pointers and 44px for coarse pointers. The root
theme owns both values and the floating-label reserve; see `control-uniformity.md`.
Embedded app-header actions derive their smaller bodies using
`header.controlBlockInset`. Current primary, phone and overflow-menu destinations
share a soft `color.brandSoft` fill, readable `color.link` text and a thin
indicator, with no added border or exaggerated solid fill.
Slip header fills follow the outer frame with an inset radius. Disclosure and
Share keep independent hit targets, aligned to their existing header slots.
Status badges and match chips retain readable semantic fills without decorative
outlines.

The app footer consumes `footer.background`; app and dialog chrome use a quiet
porcelain tint in light mode and corresponding layered dark surfaces. Dialog
bodies retain `color.surface`. Match rows, slip selections and pagination
boundaries use `phoneCardFrame.separator`. Shared search submission remains the
trailing action, with square leading corners and inset trailing corners that fit
its field frame. Status and period dropdowns use the shared control radius.
Performance summaries retain their figures and labels without a decorative
distribution bar.

Readability tests validate all ten complete definitions. Browser acceptance
checks the actual shared screens. Business rules, data services, form actions,
and event handlers must remain unchanged by theme work.
