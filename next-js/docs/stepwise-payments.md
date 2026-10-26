# Stepwise subscription payments

The subscription screen follows **Sample 01 — One clear step**, selected from the
[payment-flow exploration](../dev-plan/070-payment-flow-samples.md). The shared
web app renders one stage inside a centered, square-edged card on mobile and
desktop. Progress remains visible; instructions and actions use short wording.
The card uses compact spacing, 16px inputs, clear primary labels, and consistent
46px navigation buttons. The recipient number stays fully visible on narrow
phones, with its copy button below it. Review combines repeated details and
uses a small screenshot preview that opens the full image.

## Four stages

| Stage | Visible task |
| --- | --- |
| Package | Choose access duration and price. |
| Pay | Choose MTN/Airtel, then pay manually to the displayed recipient. |
| Proof | Enter the sending number and transaction ID; optionally add a screenshot. |
| Review | Check the summary, confirm payment was made, accept current Terms when required, and submit proof. |

Signed-out visitors see the shared login form first. Step 1 contains package
selection only. Account-credit purchase and Add credit options appear in Step 2,
after a package has been chosen. The separate top-up screen retains its existing
three-stage flow and consent behavior.

The transaction ID remains required by the production verification contract.
Screenshots remain optional; image preparation, OCR, photo capture and pasted-SMS
assistance continue to work in the proof stage. Reading a screenshot provides
evidence for manual review and never verifies a payment automatically.

## Navigation and safeguards

Back and review edit actions retain the draft and screenshot. Explicitly changing
the package or payment network invalidates prior evidence, stops pending image
reading, and clears its transaction details. The sending number is retained.
Details changed during review must be checked and confirmed again.

The review is a normal inline stage. Missing modal-dialog support cannot bypass
it. A changed status for the report being corrected clears its confirmation,
preventing an earlier review from authorizing a revised submission. Existing
phone/transaction validation, mismatched-ID and insufficient-amount checks,
upload errors and duplicate-submission protection remain in force.

Credit purchase uses the existing service and confirmation. Once opened, its
component stays mounted but hidden outside Pay, preserving pending requests and
feedback. Its retry key also lives in the parent flow so returning does not
create a new purchase identity after a lost response. A successful purchase
clears that key.

## Submission and access

Submitting proof returns to the existing payment-status card. Pending, rejected
and reversed reports retain their reference, summary, correction actions and
configured support links. Approval refresh continues to update the member's
access after an administrator reviews the receiving wallet. Submitting proof or
opening support does not activate access.

Presentation is shared in `src/components/members/payment-wizard.tsx`; the existing
`SubscribeFlow` owns payment state and transitions. No payment API, database
schema or dependency changes are required for the wizard. The separate
[automatic registration trial](../dev-plan/072-automatic-registration-trial.md)
change removes the manual trial endpoint and request/approval controls from the
app. Trial duration still comes from Admin Settings. Wallet numbers, registered
names and support contacts still come from the existing private server configuration.

## Verification

- TypeScript and targeted ESLint passed.
- Focused registration/authentication, payment, consent, wallet and administrator
  tests passed. Exact executed groups are recorded in development progress.
- Production payment, member and administrator rendering fixtures passed their route/content
  checks. Browser checks used synthetic accounts, recipients and screenshots.
- Phone and desktop checks covered navigation, review/edit retention, screenshot
  reading, mismatched transaction IDs, insufficient amounts, duplicate-report
  errors, successful submission and approval refresh. A 320px phone check found
  no horizontal overflow after moving the copy action below the recipient.
- Automatic signup through phone verification showed the configured trial and
  reached the app without an administrator request or approval.

Real MySQL integration remains unqualified because this environment has no
genuine MySQL binary. No live account, payment, SMS, database migration or
production deployment was used in these checks.
