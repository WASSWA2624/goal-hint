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
| Borders and keyboard focus outlines | `border` |
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

The desktop directions use quiet, single-pixel decorative edges and accent rails, with subtle
surface separation. Editable fields retain thin, visible boundaries and clear
focus rings. Soft directions use the shared 8px surface corner; crisp directions
use the smaller scale. Their spacing tokens reduce unnecessary panel padding
and workspace gaps without shrinking control targets or compromising contrast.

The review-only navigator owns its own positioning. Its measured height offsets
the real app headers and sidebars; it is not part of the selected app theme.
No review-only appearance overrides are required for headings, logos, header
fills, text selection, scrollbar colors, or interaction treatment.

Readability tests validate all ten complete definitions. Browser acceptance
checks the actual shared screens. Business rules, data services, form actions,
and event handlers must remain unchanged by theme work.
