# 264 — Shared advanced filters and compact match results

- Replace the separate desktop/mobile Matches forms with one responsive field
  tree and one validated draft; keep only search and its dialog opener on-page.
- Reuse the existing searchable checklist, date/status coordination and native
  dialog, with a branded Advanced Filters header and Reset Filters / Apply
  Filters footer. Reset remains a draft edit and dismissal restores the draft.
- Reuse the dialog chrome on payment, subscriber and audit search screens;
  remove redundant external reset actions.
- Remove the gray search-panel treatment and use shared theme/spacing/control
  tokens. Verify light/dark themes, fine/coarse controls and narrow layouts.
- Merge the results title, latest visible stored prediction publication and
  pagination range into one square header. Use compact day-first dates and a
  compact mobile range, with an inset header and inline timestamp. Never substitute kickoff or feed refresh timestamps.
- Validate domain behavior, type/lint/build checks and browser interactions,
  then update the overview, commit and push main.

## Verification

- Production build, TypeScript, full lint and theme-token contract passed.
- 76 focused domain/browse tests passed; updated compact timestamp checks passed.
- Browser checks passed in both themes at five filter widths, with 44px touch
  controls and native GET search. Final Predictions/Performance labels, 8px
  header insets and inline dates passed at 320, 390 and 1440px in both themes.
- Full regression rerun: 2,794 passed, one skipped, one deadline-sensitive
  evidence-service test failed under load and passed its isolated retry.
- Existing download-catalog tracing warnings remain. No deployment was performed.
