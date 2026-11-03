# Community and payment-review alerts

Prepared 3 November 2026. Preserve the existing navigation, checkout and receipt-verification/approval split.

## Inspection and gaps

| Requirement | Existing implementation | Status and necessary work |
| --- | --- | --- |
| Community | ResponsiveNavigation, MoreList, shared dialogs, SubscriptionSettings, native NavigationPolicy | Missing. Add a public, configured menu action and a small settings section; reuse existing external navigation. |
| Checkout accounting | checkout.ts, checkout-review.ts, receipt/claim uniqueness, checkout.integration.mjs | Implemented. Run regression tests against the existing rules; change only evidenced defects. |
| Referral eligibility | Phone-verification award and referral ledger | Preserve first eligible phone verification; the payment guide's “registrations” wording needs correction. |
| Member confirmations | MemberNotification inbox and 20-second pending-account refresh; legacy Yoola message outbox | Implemented/configuration-dependent. Current checkout deliberately does not enqueue external customer messages. Preserve that boundary. |
| Reviewer event | PaymentEvent audit and 30-second visible-client pending count | Partial. No durable reviewer transport or out-of-app alerts. Add an atomic event/outbox beside existing receipt events. |
| Browser delivery | offline-worker.js and authenticated admin guard | Missing. Extend the existing worker with Web Push; permission after explicit action, private payloads and click routing. |
| Android | Persistent owned-origin WebView; no Firebase messaging dependency | Missing. Add native notification ownership, FCM adapter and packaged chime; Firebase setup and real-device delivery require owner configuration. |
| Windows | WebView2 shell, unpackaged runner | Missing. Add native local notifications for running host and validated review navigation. Closed-process WNS requires an approved distribution identity/registration arrangement; do not silently change packaging. |
| Delivery operations | Payment SMS worker is one-attempt, member-oriented; cPanel scripts | New reviewer delivery needs independent bounded retries, endpoint/session checks and explicit worker scheduling. Do not reuse SMS retry semantics or add paid escalation. |
| UI evidence | Existing theme/rendering fixtures | Verify menu/dialog/settings at phone, tablet and desktop sizes in both themes. |

## Implementation sequence

1. Small Community addition and backward-compatible settings migration.
2. Payment regression and focused correction/resubmission idempotency fixes if evidenced.
3. Atomic review events, session-bound endpoints, retryable deliveries and private APIs.
4. Browser/native notification ownership, sound, permission controls and safe direct review.
5. Unit/database/browser/native checks; record actual capability and deployment gaps.

New outbound delivery defaults off. Do not deploy or enable live messaging. Preserve existing staged files, stashes and linked worktrees. Verification and release setup are recorded in `docs/payment-review-alerts.md`.
