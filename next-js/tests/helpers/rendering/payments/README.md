# Synthetic member payment fixture

`python scripts/verify-payments-rendering.py --serve` builds and checks the isolated payment app. It never contacts a wallet, messaging provider or business database.

## Plan payment wizard

Open `/en/subscribe?state=signed-in` for a new payment, or use `state=active`, `state=approved`, or `state=credit` to exercise existing access and account credit. A signed-out visitor sees only the shared sign-in form.

Plan payments follow four screens, with progress visible throughout:

1. **Package:** package choices and **Continue**. No recipient, payer, transaction ID, screenshot or terms controls appear yet.
2. **Pay:** MTN/Airtel, the selected recipient number and name, and the amount to send manually. Copy-number, supported mobile-money shortcuts, and account-credit alternatives appear here.
3. **Proof:** required sending number and transaction ID, with an optional screenshot or photo. Screenshot reading and pasted payment messages retain their ID/amount/network checks.
4. **Review:** inline payment details, explicit payment confirmation, and current terms acceptance when needed. Nothing is submitted before the final action.

The server-rendering script verifies the first screen, private headers, package order, and absence of later-step controls for each supported user agent. Browser acceptance must exercise the remaining stages at mobile and desktop widths:

- Continue/Back and review Edit actions preserve the draft and screenshot. A changed package or payment method must not silently reuse stale payment evidence.
- Invalid payer or transaction ID prevents review. Optional screenshots, replacement/removal, OCR failures, mismatched IDs, and short amounts retain their existing behavior. A keyboard's pasted whole SMS must reach the ID handler uncut.
- Review works without dialog support. Required terms acceptance and payment confirmation are separate; existing current consent is not requested again.
- Final submission reaches pending status; `TESTFAIL` exercises a duplicate refusal while keeping the draft available for retry.
- Credit purchase and the Add credit link work from the payment-method screen. They stay out of the package screen. `/en/subscribe?state=credit&add=credit` retains the existing three-stage top-up form and its confirmation dialog.

## Payment status and corrections

Reversed-payment previews:

- `/en/subscribe?state=reversed`: the account already accepted the current terms.
- `/en/subscribe?state=reversed-terms-required`: current terms have not been accepted.
- `/en/subscribe?state=reversed-active`: another subscription period remains active after the latest payment was reversed.

Waiting and rejected previews use `state=pending` or `state=rejected`. Add `-active` for retained subscription access or `-terms-required` for missing current consent. `state=rejected-fallback` displays the reason-code fallback instead of a custom rejection message. Pending, rejected and reversed cards show reference, plan and amount upfront. Pending cards also show the sent date immediately, with review timing inside closed **More details** when configured. Rejected and reversed cards keep the sent date inside **More details**. Rejection reasons and the reversal explanation stay visible. **Update payment details** opens the correction form. The open form replaces the status card, with **Back to payment status** above the plans. Going back restores the card and action focus while preserving transaction ID, payer number, selected plan and screenshot. A successful correction returns to the compact pending status.

All three report cards offer **Call** and **WhatsApp** actions. Inspect their links without launching either: the call uses the synthetic support number, and WhatsApp includes the payment reference, account number and the relevant payment status. `state=pending-call-only`, `state=pending-whatsapp-only`, and `state=pending-no-contact` exercise the shared contact controls with one available channel or the contact-page fallback.

For interactive submissions, open `/fixture`, choose a scenario, and click **Start scenario**. Its native form resets the selected synthetic state, sets the HttpOnly test-session cookies, and opens the subscription screen. **Reset scenario** restores that state; **Approve payment** adds synthetic active access. Use a second fixture tab to approve the same scenario while the payment screen remains open, then return to check its automatic refresh. No browser cookie editing is needed. The real payment HTTP handler validates the multipart request; only the fixture service stores its result in process memory. Submitted reports remain pending after refreshing that scenario. The proof screen prefills the required sending number from the account. Screenshot and camera controls are optional, visible without a disclosure, and reveal preview/removal controls after an image is chosen. Consent is checked independently: required acceptance must be supplied once, while existing current acceptance allows resubmission without a screenshot or repeated assent. Restart the fixture process to restore initial states.

The fixture-only `/api/fixture/payments` endpoint accepts same-origin POSTs with the synthetic member cookie: `{"action":"reset"}` restores the selected scenario and `{"action":"approve"}` adds synthetic active access. The approval action lets browser checks verify automatic pending-to-approved refresh without any real approval or message.

Check that the reversal initially shows one brief status, visible payment summary and contact actions, with **More details** collapsed. **Submit another payment** replaces the card with the wizard; **Back to payment status** restores the card. Check focus, retained draft and screenshot, conditional terms, and successful pending status after submitting a new ID. The entry screen must remain limited to the package step when the correction begins.
