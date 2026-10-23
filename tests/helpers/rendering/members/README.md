# Synthetic account acceptance app

Run `python scripts/verify-member-rendering.py --serve` from the repository root. The script builds the fixture, checks its initial HTML and synthetic API responses, and prints its local browser URL. No database, account creation or message provider is used.

- `/en/account?state=unverified&view=verify` starts signup verification at delivery selection.
- `/en/account?view=forgot` starts password recovery.
- `/en/account?view=register&return=%2Fen%2Fmatches` exercises registration, verification and the final `/en` home destination.
- `/en/account?state=password-reset&view=new-password` shows the reset-password form directly.
- Existing `state` values, refresh and browser-history probes remain available.

The **Fixture API outcome** selector controls subsequent calls without reloading or clearing the current form. It supports `success`, `send-failed`, `rate-limited`, `invalid-code`, and `unavailable`. Set the same value using `?scenario=send-failed` when opening a page. Direct HTTP checks can override it with the `X-Member-Fixture-Scenario` header.

Use `123456` as the synthetic verification code. Any other code is rejected. A successful send enters the code step; use the component's back/resend controls to change delivery, or choose **I already have a code** to enter an existing code. Registration and successful verification use the production auth HTTP adapter with scripted services; verification navigates to the synthetic `/en` home page. Successful recovery enters the reset-only page through a synthetic cookie.
