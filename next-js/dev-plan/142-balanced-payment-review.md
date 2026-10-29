# 142 · Balanced payment review and one-click transaction copy

## Scope

Apply the selected 01 / Balanced review to the real desktop Payments screen.
Keep payment services, receipt authorization, history, reversal, recovery, and
mobile queue/review navigation intact.

## Implementation

- Use a narrower queue with aligned provider/reference and clear amount, payer,
  package, and timestamp rows beside the persistent review.
- Present one editable amount and transaction ID, visible provider/package
  controls, separate account context and open checks on the left, with actual
  uploaded evidence on the right. Retain a clear empty-evidence state.
- Remove the repeated desktop amount banner and footer total. Keep the payment
  reference/status/submission in the header and persistent decision actions.
- Reuse a CopyTextButton for editable and historical transaction IDs. Copy the
  exact current value, show success/failure honestly, reset feedback on edits,
  handle empty IDs, and retain a fallback for unavailable Clipboard APIs.
- Preserve one mounted approval form across responsive changes, real SMS parsing,
  rejection confirmation, and the mobile panel/navigation flow.
- Keep square desktop controls and use shared admin form/workspace components.

## Verification

- Type checking passed after final presentation and copy-control changes.
- All 51 focused payment, review, SMS, ordering, count, and wallet tests passed.
- The final production-built owner fixture passed all owner route, payment
  history/decision, screenshot authorization, and confirmation checks.
- Browser checks passed at 1024, 1280, 1440, and 1920 pixels in light and dark
  themes, including complete header placement, evidence/account/check positions,
  canonical inputs, visible provider/package edits, and persistent actions.
- Browser clipboard checks passed for edited and SMS-updated values, empty IDs,
  fallback copying, denied copying, and read-only history. Copying made no
  payment decision requests and restored focus after the fallback.
- Mobile navigation and responsive draft preservation passed at 390 pixels.
  Screenshots were visually reviewed; captures and QA logs remain ignored.
