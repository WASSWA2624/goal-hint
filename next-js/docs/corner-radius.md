# Corner radius

The Best slips date selector and Custom date button set the visual reference:
subtle 4px corners. The app uses a small semantic scale instead of a single
radius for every component.

`assets/brand/brand-tokens.json` owns `shape.radius`, exposed as `theme.radius`
in styled-components. Light and dark themes share the same geometry. Public
brand exports expose the matching `--gh-radius-*` CSS variables.

| Token | Value | Use |
| --- | --- | --- |
| `small` | 2px | Small badges, counts, inset menu items, skeleton lines and meter tracks |
| `control` | 4px | Buttons, text fields, select faces, date controls, pagination and icon buttons |
| `surface` | 6px | Cards, standalone panels, notices, plan choices and large buttons |
| `overlay` | 8px | Menus, popovers, tooltips and dialogs |
| `none` | 0 | Joined internal edges, continuous rows and borderless structural wrappers |
| `pill` | 999px | Controls whose function deliberately calls for a capsule |
| `circle` | 50% | Avatars, radio controls, live dots and loading spinners |

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
Headers and edge rows with their own fills must follow the parent's exposed
corners using logical corner properties, `inherit`, or an inset radius reduced
by the border width. Do not hide overflow on a general panel just to round it:
that can clip a menu, tooltip or keyboard focus ring. Full-bleed edges attached
to the viewport may remain straight. Keep brand artwork and flags intact.

The theme acceptance fixture checks resolved corners on real date controls,
shared fields/buttons, cards, admin forms, payment steps and open dialogs in
both themes at desktop and phone widths.
