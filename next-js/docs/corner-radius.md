# Corner radius

The Best slips date selector and Custom date button set the visual reference:
subtle 4px corners. The app uses a small semantic scale instead of a single
radius for every component.

`assets/brand/brand-tokens.json` owns the primitive `shape.radius` scale. The
selected theme maps those values to semantic roles exposed as `theme.radius`
in styled-components. Porcelain Blue and Cobalt Night share 4px controls and
8px surfaces, overlays, and desktop slip frames. Public brand exports retain
the primitive `--gh-radius-*` CSS variables.

| Token | Value | Use |
| --- | --- | --- |
| `small` | 2px | Small badges, counts, inset menu items, skeleton lines and meter tracks |
| `control` | 4px | Buttons, text fields, select faces, date controls, pagination and icon buttons |
| `surface` | 6px | Cards, standalone panels, notices, plan choices and large buttons |
| `overlay` | 8px | Menus, popovers, tooltips and dialogs |
| `none` | 0 | Joined internal edges, continuous rows and borderless structural wrappers |
| `pill` | 999px | Controls whose function deliberately calls for a capsule |
| `circle` | 50% | Avatars, radio controls, live dots, loading spinners and explicitly round disclosure indicators |

On desktop (64rem and wider), viewport-aligned page sections use `none`:
filter panels, performance summaries, match boards, loading placeholders and
owner/analytics panels. Reuse `desktopSectionFrame` from the shared layout.
The desktop app container has no outer gutter or width cap; sections own their
content padding. Reading pages and compact forms retain local content insets.
Phone and tablet content and headers use the same shared 16px outer gutter.

Desktop content uses the shared `theme.layout.gutter` (16px) inside those
full-width frames. Reuse `desktopContentPadding` for section content and
`DesktopContent` around card collections or standalone shared slips. Bordered
panels account for their border width when aligning their content. Keep the
page gutter outside individual cards to avoid doubling nested card padding.
Standalone desktop match cards use the shared extra-small gap between rows;
match selections inside slips retain their joined edges.

Use a semantic token directly, for example:

```tsx
border-radius: ${({ theme }) => theme.radius.surface};
```

Choose by visible size and purpose. A compact button keeps `control` even when
its touch target grows on a phone; an inset menu item uses `small` inside an
`overlay` menu. Avoid independent numeric radii and blanket descendant rules
that override the shared components. Native inputs receive global defaults;
reusable components define the appropriate explicit token for their role.

Round the outside of a joined group and keep its internal seams straight.
Shared desktop slips use `theme.frame.desktopCardRadius` for the outer card and
its full-height rail; the approved application themes use 8px. Mobile slips
use `surface` (8px in the approved themes) on all four outer corners, without
the former blue leading rail.
Desktop review themes can select a restrained corner through
`theme.frame.desktopCardRadius`, taking its value from this same radius scale.
Theme card frames, hover backgrounds, and their full-height rails consume the
shared setting together.
Standalone Team stack mobile match cards use `theme.phoneCardFrame.radius`,
mapped to `control` (4px). Slip selections use the same scale on mobile and
desktop, with rounded top corners only on the first match and rounded bottom
corners only on the last. Middle rows have square corners; a single match has
all four corners rounded. Selection wrappers touch, with a 1px separator in the
slip background color. The slip perimeter uses the same thin rule. Slip header
fills use the outer radius minus `theme.phoneCardFrame.ruleWidth`; analysis
links inherit their match row's corners so keyboard focus follows the shape.
Disclosure indicators are pinned 8px below the header's top edge in both states.
Only the inner chevron rotates: right when collapsed, down when expanded. On
mobile, Share and disclosure use matching 28px frames with `control` corners,
aligned tops and a 10px gap; the metrics occupy their own clear row below.
Desktop retains its circular disclosure frame. A mobile match card's covering
analysis link uses the outer radius minus the frame width, so its pressed tint
and focus outline cannot square off the visible corners.
Headers and edge rows with their own fills must follow the parent's exposed
corners using logical corner properties, `inherit`, or an inset radius reduced
by the border width. Do not hide overflow on a general panel just to round it:
that can clip a menu, tooltip or keyboard focus ring. Full-bleed edges attached
to the viewport may remain straight. Keep brand artwork and flags intact.

The theme acceptance fixture checks resolved corners on real date controls,
shared fields/buttons, cards, admin forms, payment steps and open dialogs in
both themes at desktop and phone widths.
