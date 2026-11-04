# 272 — Payment list density and pagination

- Tighten both lines of each payment row using shared typography and spacing
  tokens. Add a thin divider between rows and remove the phone chevron.
- Reuse numbered pagination at the end of the phone list and in the desktop
  list footer. Preserve the current search, filters, and sort. Show the last
  available page if refreshed results make the requested page unavailable.
- Reduce the mobile gap above search and verify both themes, including page
  links, tap targets, and the desktop list footer.

## Verification

- Playwright checked both themes at 320, 390, 1024, and 1440px. It verified
  the row spacing and dividers, pager placement, retained query criteria,
  return to page two from mobile details, and 44px touch controls.
- The focused rendering fixture verified multi-page and single-page results,
  valid page links, and recovery when the requested page is out of range.
  TypeScript, focused lint, the theme contract, and the targeted unit and
  isolated MySQL tests passed.
