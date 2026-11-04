# 277 — Compact admin workspaces

- Follow Payments for compact rows, separate desktop scroll panes, dedicated
  mobile details, and actions outside the detail scroll area.
- Use the same list and detail structure for Codes, Subscribers, Referral
  review, Plans, and Audit. Restore list context on mobile Back. Keep
  create actions near search, related-record links with their details, and
  paging and CSV export with the list.
- Replace Settings tabs with section rows and keep one draft and save footer.
  Keep paid-access mode confirmation separate and preserve desktop editing for
  message templates and the structured support directory.
- Verify both themes and layouts in synthetic owner and referral fixtures.
  Use isolated MySQL to check member effects and audit persistence.

## Verification

- Playwright covered all six screens at 320, 390, 1024, and 1440px in both
  themes. It checked scrolling and footer bounds, mobile Back and focus, and
  representative actions with persisted results.
- Focused tests covered authorization, historical links, Audit CSV, member
  records, referral review, settings, and payment alerts. Isolated MySQL
  covered member administration, payments, referrals, plans, and alerts.
- TypeScript, scoped ESLint, and the theme contract passed.
