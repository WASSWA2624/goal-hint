# 271 — Admin payment queue controls

- Open to the pending-approval queue, oldest first. Replace status tabs with
  status and provider checkbox groups in Advanced filters. Apply search and
  filters before pagination and preserve historical payment links.
- Put the existing sort options in a shared dropdown after Advanced filters on
  desktop and on a full-width row below search on phones.
- Render two lines per record with themed truncation, receipt amounts and EAT
  timestamps. Identify submission timestamps when the payment time is unavailable.
- Keep the desktop review pane and place receipt and decision actions in its
  footer. Open a dedicated detail view from phone cards and restore the filtered
  list on Back.
- Verify both themes, desktop and phone widths, and the existing payment review
  guards.

## Verification

- The Payments rendering fixture covered default ordering, combined filters,
  pagination, historical links, and receipt amounts and timestamps.
- Playwright verified both themes at 320, 390, 1024, and 1440px, including the
  two-line cards, toolbar alignment, mobile history, and desktop receipt form
  submission. Touch checks covered All, Reset, Back, and shared control heights.
- Focused unit tests and disposable MySQL checkout and review suites passed.
  TypeScript and the theme contract also passed.
- The broader owner fixture stopped at an outdated Subscribers markup assertion.
  Its legacy Payments API fixture also expects a response without pagination.
