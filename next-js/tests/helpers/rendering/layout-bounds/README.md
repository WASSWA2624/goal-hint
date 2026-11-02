# Layout bounds

Run `python scripts/verify-layout-bounds-rendering.py --serve`, then call
`verifyLayoutBounds` from `scripts/verify-layout-bounds.mjs` in fine/coarse
pointer browser contexts. The synthetic fixture uses real fields, actions,
single/multiple-choice menus and payment/filter dialog footers.

The checks cover both themes, six widths, short/tall viewports, validation text,
keyboard selection, resizing an open picker, container bounds and page overflow.
Wrapped actions retain their full labels and the common control height.
