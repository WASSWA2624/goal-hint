# Page pagination spacing

- [x] Share the themed page-pagination section across Best Slips, Matches and Slip builder.
- [x] Reserve the shared large spacing token above pagination on mobile and desktop.
- [x] Verify light/dark layout and the theme/type contracts, then commit and push main.

The shared large spacing token resolves to 20px in both approved themes.
Browser checks passed at 390px and 1440px on Best Slips and Matches, with no
overflow or changes to control heights. Slip builder reuses the same section
and retains its existing horizontal content padding. ESLint, type checking and
the theme contract passed.
