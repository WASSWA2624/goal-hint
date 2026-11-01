# Light inputs and match-feed chrome

## Scope

Keep light-theme text fields white with thin visible borders, make the footer
white, distinguish desktop match rows and pagination, and join search actions
to the right side of their input. Restore subtle borderless filter corners
and remove the performance summary's colored distribution bar.

## Implementation

- Add theme-owned text field fills and border width, and reuse one treatment
  across shared controls, admin forms, search, phone and date/range controls,
  numeric slip fields, and textareas. Preserve validation, disabled states,
  non-text controls, keyboard focus, and dark-theme fills.
- Give composite fields one visible boundary around transparent inner inputs.
- Use the page fill for the footer and pagination, add top spacing before the
  paginator, and use thin inset-colored separators between desktop matches.
- Keep search submission on the right at every size. Use square left corners
  and subtle right corners, without clipping focus indicators.
- Give compact status/period choices the shared control radius and no border.
- Remove the summary distribution markup, dedicated styles, and segment data;
  keep the accessible totals and outcome percentages.
- Extend browser checks for white fields, visible boundaries, footer fill,
  status corners, search placement, and absence of the removed distribution bar.

## Verification

- All 63 focused tests and scoped ESLint checks passed. Both isolated production
  fixtures built and typechecked successfully.
- The earlier full-screen matrix passed 120 cases (12 screens, both modes, five
  widths) and 14 interaction checks before concurrent floating-label edits.
- Final isolated checks passed all 30 slip/dialog states and five real Matches
  search submissions at 320, 390, 768, 1024, and 1440px. Search placement, square
  leading action corners, white focused/hovered fields, visible input boundaries,
  desktop dividers, and pagination spacing were verified in those five cases.
- Normal and invalid text inputs retained their intended hover/focus fills at
  390 and 1440px. Keyboard focus remained visible, and theme persistence passed.
- The footer, dropdown corners, and removed performance distribution were
  checked in rendered screens. Captures are ignored under `output/playwright/`.
- Shared gray feedback rules exclude text entry; white composite fields use
  their own state treatment so a more specific gray hover rule cannot override it.
- This verification covers the scoped changes in isolation. The concurrent
  floating-label refactor owns subsequent integrated outline/control checks.
