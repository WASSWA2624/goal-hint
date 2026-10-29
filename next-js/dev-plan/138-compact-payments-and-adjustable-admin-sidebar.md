# 138 · Compact payments and adjustable admin sidebar

## Scope

Refine the selected desktop Payments layout: tighter controls and review chrome,
two-line list rows, comprehensive sorting, and a collapsible/resizable shared
admin sidebar. Remove the manual-review summary strip. Retain the payment
operations, real warnings/checks, independent scroll regions, and mobile flow.

## Implementation

- Reduce padding above provider/order controls and around the status tabs,
  selected-payment heading, amount summary, and fixed decision bar. Apply subtle
  2px rounding to desktop controls and review panels.
- Place reference, payer phone, and amount on the first line after the provider
  mark; place EAT date/time and the saved package name/duration on the second.
  Long references/package names retain their full accessible text and title.
- Centralize seventeen typed sorting choices, including both amount directions,
  chronology, reference, transaction ID, contact, provider, package, and duration.
  Confirmed values take precedence, missing values remain last, and equal values
  retain queue order. Sorting never changes the server queue.
- Remove the redundant manual-review strip while retaining actual warnings and
  the existing checks disclosure.
- Add sidebar collapse/expand and reset controls beside the Admin caption.
  Collapsed navigation retains accessible names and icons without labels.
- Add a pointer/keyboard resize separator, bounded width, and browser-local
  geometry preferences. Use CSS variables for width updates and keep at least
  720px available for desktop content. Mobile navigation stays separate.
- Extend existing acceptance assertions and add focused ordering/sidebar-state
  tests. Test mutations only against synthetic in-memory reports.

## Verification

- TypeScript, targeted ESLint, and 39 relevant unit tests passed across sorting,
  sidebar state, payment review/counts, and private admin routes.
- A clean production fixture build and the full owner acceptance harness passed:
  nine owner routes, private gates, navigation, subscriber/settings/audit flows,
  real payment services over synthetic reports, history, and private attachments.
- Browser checks passed at 1024×768, 1280×800, 1440×900, and 1920×1080 in both
  themes, expanded and collapsed (sixteen combinations). Required fields align
  on two lines; normal rows stay below 58px and the fixed footer below 48px.
  Independent scrolling, fixed outer layout, removed summary, subtle radii, and
  caption-level controls passed without overflow or runtime errors.
- All seventeen sort options, missing transaction ordering, search/filter/reset,
  draft-preserving refresh, and successful synthetic approval/rejection passed.
- Keyboard resizing, pointer dragging, reset, saved width/collapse restoration,
  and navigation while collapsed passed. The maximum width accounts for the
  rendered root's reserved scrollbar gutter, retaining at least 720px for content.
- Mobile review/back navigation, reject confirmation, hidden desktop sidebar
  controls, and horizontal-overflow checks passed at 390px. Screenshots were
  inspected.
- The isolated fixture has expected console 404s for its optional offline worker
  and unimplemented public-route prefetches. No business database or messaging
  provider was used. A full application production build was outside this scope;
  full-source type checking and the production owner fixture covered the change.
