# Synthetic member payment fixture

`python scripts/verify-payments-rendering.py --serve` builds and checks the isolated payment app. It never contacts a wallet, messaging provider or business database.

Reversed-payment previews:

- `/en/subscribe?state=reversed`: the account already accepted the current terms.
- `/en/subscribe?state=reversed-terms-required`: current terms have not been accepted.
- `/en/subscribe?state=reversed-active`: another subscription period remains active after the latest payment was reversed.

For interactive submissions, set the synthetic `goal-hint-member` cookie to any nonempty value and `payment-fixture-state` to the selected scenario. The real payment HTTP handler validates the multipart request; only the fixture service stores its result in process memory. Submitted reports remain pending after refreshing that scenario. Consent is checked independently: required acceptance must be supplied once, while existing current acceptance allows ID-only resubmission without a screenshot. Restart the fixture process to restore initial states.

Check that the reversal initially shows one brief status, collapsed payment details and one support link. **Submit another payment** reveals plans, automatic amount and the transaction ID field. Check focus, conditional terms, optional screenshots and successful pending status after submitting a new ID. Use `TESTFAIL` to exercise a synthetic duplicate refusal.
