# Synthetic member payment fixture

`python scripts/verify-payments-rendering.py --serve` builds and checks the isolated payment app. It never contacts a wallet, messaging provider or business database.

Reversed-payment previews:

- `/en/subscribe?state=reversed`: the account already accepted the current terms.
- `/en/subscribe?state=reversed-terms-required`: current terms have not been accepted.
- `/en/subscribe?state=reversed-active`: another subscription period remains active after the latest payment was reversed.

Waiting and rejected previews use `state=pending` or `state=rejected`. Add `-active` for retained subscription access or `-terms-required` for missing current consent. `state=rejected-fallback` displays the reason-code fallback instead of a custom rejection message. Pending, rejected and reversed cards show reference, plan and amount upfront. Pending cards also show the sent date immediately, with review timing inside closed **More details** when configured. Rejected and reversed cards keep the sent date inside **More details**. Rejection reasons and the reversal explanation stay visible. **Update payment details** opens the correction form. The open form replaces the status card, with **Back to payment status** above the plans. Going back restores the card and action focus while preserving transaction ID, payer number, selected plan and screenshot. A successful correction returns to the compact pending status.

All three report cards offer **Call** and **WhatsApp** actions. Inspect their links without launching either: the call uses the synthetic support number, and WhatsApp includes the payment reference, account number and the relevant payment status. `state=pending-call-only`, `state=pending-whatsapp-only`, and `state=pending-no-contact` exercise the shared contact controls with one available channel or the contact-page fallback.

For interactive submissions, set the synthetic `goal-hint-member` cookie to any nonempty value and `payment-fixture-state` to the selected scenario. The real payment HTTP handler validates the multipart request; only the fixture service stores its result in process memory. Submitted reports remain pending after refreshing that scenario. **Paid from** is visible and required, initially filled with the account number. **Screenshot (optional)** is an always-visible fieldset: **Add screenshot** and **Take photo** require no disclosure click, and choosing an image reveals its preview and removal control. Consent is checked independently: required acceptance must be supplied once, while existing current acceptance allows resubmission without a screenshot or repeated assent. Restart the fixture process to restore initial states.

The fixture-only `/api/fixture/payments` endpoint accepts same-origin POSTs with the synthetic member cookie: `{"action":"reset"}` restores the selected scenario and `{"action":"approve"}` adds synthetic active access. The approval action lets browser checks verify automatic pending-to-approved refresh without any real approval or message.

Check that the reversal initially shows one brief status, visible payment summary and contact actions, with **More details** collapsed. **Submit another payment** replaces the card with plans, automatic amount and the transaction ID field; **Back to payment status** restores the card. Check focus, preserved draft and screenshot, conditional terms, and successful pending status after submitting a new ID. The entry form omits the former replacement-reference and access-after-approval notes. Use `TESTFAIL` to exercise a synthetic duplicate refusal.
