# 182 — Borderless mobile filters and sticky app header

Use `mobileFilterPanel` for outer filter groups in Matches, Best Slips, Builder,
Performance, Analytics and the applicable audit filter drawer/criteria sections.
Phone groups lose their outer border, corner treatment, shadow and horizontal
inset; individual controls, keyboard focus rings and dialogs retain their own
boundaries. Desktop presentation remains unchanged.

`AppBrandBar` owns the shared mobile sticky layer at the viewport top, including
its access status row. Matches' obsolete sticky wrapper becomes layout-transparent
so it cannot constrain the header to a short control block. Best Slips, Builder
and other consumers inherit the same behavior. Existing popover/sheet layers
remain above the header. The desktop shell was already sticky.

Browser checks at 375px confirmed zero outer borders and horizontal padding in
Best Slips and Builder filter groups, and sticky headers at y=0 after a 500px
scroll in both screens and the Matches header fixture. Shared filter styling is
also applied to Matches, Performance, Analytics and audit criteria groups.
