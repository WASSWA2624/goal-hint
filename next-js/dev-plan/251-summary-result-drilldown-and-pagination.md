# Summary result drilldown and numbered pagination

- Won, Lost, Pending, Void and Cancelled select the period represented by the
  summary and restart at page 1. Yesterday summaries select Yesterday in EAT.
- Best Slips and the builder's saved-slip history use the applied summary scope,
  so a pending date edit cannot redirect a click into a different period.
- Matches has an explicit result query and filter control. Membership comes from
  the existing selected-prediction settlement audit, before totals and pagination.
  Corrected/unconfirmed settlements remain Pending; absent predictions are excluded.
- Summary figures retain all outcome categories while the list is filtered.
  All clears the outcome within that same period; Reset restores screen defaults.
- Automatic loading is removed. Best Slips, Matches, saved history and generated
  slips show at most 20 records on a page and use numbered pagination. Old combined
  scroll checkpoints cannot restore multiple match pages into one screen.
- Filtering keeps the summary in view. Explicit slip page changes move to the list.
- Shared themed controls and focus indicators apply to both light and dark modes.

Verification covers query round trips, EAT/device date boundaries, audited result
membership, paging, access preservation, zero outcomes and keyboard-capable controls.

- 315 focused tests passed, plus TypeScript, targeted lint and the theme contract.
- 64 browser checks passed with isolated data at mobile/desktop widths in both
  themes, covering all five categories on each screen and pagination-only output.
- The live localhost API returned totals equal to yesterday's summary for every
  category, including zero results.
