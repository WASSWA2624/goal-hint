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
Phone and tablet gutters, corners and spacing retain their existing styles.

Desktop content uses the shared `theme.layout.gutter` (16px) inside those
full-width frames. Reuse `desktopContentPadding` for section content and
`DesktopContent` around card collections or standalone shared slips. Bordered
panels account for their border width when aligning their content. Keep the
page gutter outside individual cards to avoid doubling nested card padding.

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
its full-height rail; the approved application themes use 8px. Mobile slips use square leading corners for the blue rail
and `control` corners on the trailing edge.
Desktop review themes can select a restrained corner through
`theme.frame.desktopCardRadius`, taking its value from this same radius scale.
Theme card frames, hover backgrounds, and their full-height rails consume the
shared setting together.
The approved Team stack mobile match cards use `none`, including their framed
rows inside expanded slips. Their existing slip headers retain their own corners.
Headers and edge rows with their own fills must follow the parent's exposed
corners using logical corner properties, `inherit`, or an inset radius reduced
by the border width. Do not hide overflow on a general panel just to round it:
that can clip a menu, tooltip or keyboard focus ring. Full-bleed edges attached
to the viewport may remain straight. Keep brand artwork and flags intact.

The theme acceptance fixture checks resolved corners on real date controls,
shared fields/buttons, cards, admin forms, payment steps and open dialogs in
both themes at desktop and phone widths.
