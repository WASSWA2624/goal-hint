# 071 — Stepwise subscription payment

## Objective

Apply **Sample 01 — One clear step** from
[070 — Payment flow samples](070-payment-flow-samples.md) to the subscription
payment screen. Keep one task visible at a time, short wording, a clear progress
indicator, and square component edges on phones and desktop.

## Journey

1. **Package:** show package choices and Continue only.
2. **Pay:** choose MTN/Airtel and show the configured recipient, registered name,
   amount and copy action. Payment remains manual. Existing account-credit
   purchase and Add credit options live here, after package selection.
3. **Proof:** collect the sending phone number and required transaction ID.
   Preserve optional screenshot/photo upload, OCR and pasted-SMS assistance.
4. **Review:** show the payment summary inline, edit actions, explicit confirmation
   that payment was made, and current Terms acceptance when required. Submit
   only after these checks; this stage does not depend on modal-dialog support.

Signed-out visitors see the shared login form before the payment journey.
Submission returns to the existing pending-payment status with support actions.
Administrator approval still controls access.

## State and validation

- Back and review edit actions retain the draft and current screenshot.
- An explicit package or network change clears evidence for the previous payment,
  cancels pending screenshot work, and requires fresh transaction details. Keep
  the payer number so the member does not re-enter it unnecessarily.
- Editing payment details or receiving a changed status for the report being
  corrected clears the paid-confirmation state. A stale confirmation cannot send
  a revised report.
- Preserve transaction-ID normalization, phone validation, OCR mismatch and
  insufficient-amount blockers, upload errors and duplicate-submission guards.
- Preserve the parent-owned credit retry key across step unmounts. Retrying a
  credit purchase after a lost response must not buy the package again.
- Keep the separate Add credit/top-up journey and its existing consent behavior.

## Implementation boundaries

`payment-wizard.tsx` owns reusable presentation and progress. `SubscribeFlow`
continues to own the draft, payment evidence, transitions and submission. Reuse
the existing payment/status/support components and approval refresh behavior.
No payment API, database schema, dependency or automatic-collection change is
part of this work. Never commit configured wallet or support identities.

## Acceptance

- Only the current stage appears; no hidden later-stage fields can block an
  earlier stage's navigation.
- Verify package selection, method selection, copy action, proof validation,
  back/edit retention, evidence invalidation and explicit review confirmation.
- Verify signed-out login, current Terms, unavailable plans/methods, report
  correction, pending/rejected/reversed status, support and approval refresh.
- Check credit retry-key retention and the separate top-up flow.
- Inspect phone and desktop layouts, keyboard focus, readable labels and errors.
- Record executed checks and remaining limits in
  [stepwise payments](../docs/stepwise-payments.md); do not infer deployment from
  a local build or a Git push.
