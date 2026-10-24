# Manual subscriptions and public access

Members register with a phone number and password, then verify their registered number through SMS or WhatsApp in supported countries. Paid access starts only after an authenticated administrator approves a payment request; the member does not enter an activation code. See [member-authentication.md](member-authentication.md) for verification, recovery, and administrator credentials.

## Public and subscriber views

Every visitor, signed in or not, can see match probabilities, fixtures, and scores. Probability filters and sorting are public. For upcoming/live matches the server removes prediction selections, market details, odds, and prediction analysis/history before returning HTML or API data. Clicking protected content leads guests to registration and signed-in members to Subscribe.

Once a match reaches a played final status (regulation, extra time, or penalties), everyone can view its historical predictions, odds, analysis, revisions, and results. Merely reaching its kickoff time does not unlock it. Postponed, canceled, abandoned, awarded, and unknown-status fixtures remain gated until a played final status exists. Active picks/odds filter requests remain protected so filters cannot reveal hidden selections.

Admin sessions and members with a current approved subscription get the full view. Raw premium caches stay on the server; final responses are private/no-store and vary on Cookie. Subscription sales mode `off` closes purchases and requests without granting public premium access. Existing approved periods still expire normally. No trial request grants access automatically; an admin must approve it.

## Packages and payment

The standard package migration adds missing duration offers: Daily (1 day, UGX 1,000), Weekly (7 days, UGX 5,000), and Monthly (30 days, UGX 20,000). Existing offers/prices are preserved; admins can edit prices and availability. Every package unlocks the same features. Days are 24-hour periods from approval, and renewals extend the account's existing unexpired period.

1. Log in and choose an available daily, weekly, or monthly package. The server supplies its amount; the client cannot choose a cheaper amount.
2. Choose MTN Mobile Money or Airtel Money. Check the displayed receiving number and registered name, then pay using the chosen network.
3. Enter the required transaction ID from the payment SMS. Optional details hold screenshot/photo controls and the payer number, which defaults to the account number. If an image is attached, the browser prepares a JPEG and the server checks image type, dimensions, and size; duplicate images are flagged for review. Submitting without an image still counts toward request limits. No external payment gateway or message sender is called during submission.
4. Submit the request. The account displays the pending/rejected/approved status. The administrator sees the transaction ID, request, and any private proof under Payments, manually verifies the receiving-wallet transaction and account ownership, then approves or rejects it.
5. Approval creates a single account-bound access period, marks the request approved, and unlocks the account's signed-in device. Existing pages refresh pending status. Subsequent password logins inherit approved access while the period remains valid and sign out the previous device. A rejected report never unlocks access.

Only one device can be signed in to an account at a time. The login form warns users before they submit. Separate browsers and in-app browsers count as separate devices. Changing devices preserves the account's subscription and remaining time. Legacy subscription device-limit settings remain for compatibility, but cannot permit simultaneous logins under the stricter authentication policy.

After a payment approval or rejection is committed, Goal Hint attempts one YoolaSMS notification to the registered account number, including payments recorded manually with a transaction ID. It never sends to a separate payer number. Approval messages include the package and subscription expiry date and time, with the year in East Africa Time (EAT); renewals use the new period's expiry after the existing access ends. Rejection messages use a standard reason and direct the member to the app or administrator; private freeform review explanations are not included in SMS.

The admin success notice separately reports whether Yoola accepted the SMS or delivery could not be confirmed. Unsupported destinations or accounts without a registered number also prompt the administrator to contact the member. Missing credentials or delivery failure do not reverse the payment decision or access grant. Refused or repeated decisions send no further message. Delivery is a best-effort attempt after commit, with no automatic retry or durable queue; a process interruption between commit and sending can leave the member without an SMS. Yoola acceptance does not confirm handset receipt. The three-message verification-code allowance does not apply to these payment decision notifications.

Submitted requests retain their package name, price, and duration, even if an admin later edits the offer. Duplicate transaction/image checks and locked account/payment decisions protect against repeated approval. Receipts are evidence for manual review, not automatic payment confirmation. Reversal and blocking revoke access without deleting the payment/audit history.

Payment references display as `P1234` without a separator. Transaction IDs are normalized to uppercase without spaces or hyphens; duplicate detection still uses the same canonical key. Historical references with the `P-` prefix remain searchable.

The user can call the administrator if approval is delayed. Optional support-chat links are user-initiated only; no WhatsApp message or SMS activates the account.

## Environment configuration

Receiving wallets and support contacts are private server configuration:

- `GOAL_HINT_MTN_MOMO_NUMBER`, `GOAL_HINT_MTN_MOMO_NAME`
- `GOAL_HINT_AIRTEL_MONEY_NUMBER`, `GOAL_HINT_AIRTEL_MONEY_NAME`
- `GOAL_HINT_CUSTOMER_SUPPORT_NUMBER`, `GOAL_HINT_CUSTOMER_SUPPORT_WHATSAPP_NUMBER`
- Optional verified menu shortcuts: `GOAL_HINT_MTN_MOMO_MENU_SHORTCUT`, `GOAL_HINT_AIRTEL_MONEY_MENU_SHORTCUT`
- Payment decision SMS uses `YOOLA_SMS_API_KEY` and optional `YOOLA_SMS_SENDER` in development and production; see [yoola-messaging.md](yoola-messaging.md).

Use country-code numbers. Both number and registered name are required for a wallet to appear. Support numbers are separate and never inferred from wallets or the admin allowlist. Admin Settings shows environment-managed identities read-only. Restart after changing environment values. Never seed or commit real credentials or receiving numbers.

## Saved slip history

A subscriber can save a generated slip for tracking. The save endpoint rebuilds selections on the server from validated criteria and refuses invented/client-supplied odds, expired sessions, reset-only sessions, non-subscribers, and already-started fixtures. Saving a slip does not place a bet with a bookmaker.

Completed slips are public on the Slips page only when every leg has a played final status. Original saved predictions, probabilities, odds, and verified regulation scores remain visible; wins/losses are calculated with the existing market-settlement rules. Missing verified scores display a pending outcome. An early losing leg does not reveal other still-active selections. Owner account IDs, phone numbers, and credentials are never included. Erasing an account removes its saved slips.

No historical slips are invented or backfilled. History accumulates from explicitly saved slips after this feature is deployed.

## Deployment and maintenance

Apply the reviewed migrations in order before deploying this application:

- `20261021090000_payment_screenshot_approval`
- `20261021103000_standard_subscription_packages`
- `20261021110000_saved_slips`
- `20261021120000_manual_password_recovery`
- `20261023090000_member_message_verification`
- `20261023130000_single_member_login`

They follow the existing subscription/password migrations. Grant the application role SELECT, INSERT, DELETE on `SavedSlip` and SELECT, INSERT on `SavedSlipFixture`, alongside existing member/payment grants. The child links are removed through the foreign-key cascade; no snapshot UPDATE or child DELETE permission is needed. See `deploy/manual-account-grants.sql`. Use DDL-capable migration credentials only for deployment. Keep ordinary application credentials DML-only. No development or production database is migrated by editing the application source.

Screenshots are private JPEG responses behind the shared admin guard. Pending screenshots do not expire automatically; decided screenshots follow configured retention. The existing members purge removes expired sessions and rate-limit buckets. Account erasure clears credentials, private payer fields, proofs, verification rows, and saved slips while retaining required financial/audit attribution.

Admin → Subscribers places the searchable directory beside the selected account on desktop. On smaller screens, **Find account** opens the directory. The account toolbar opens one task at a time: grant access, change number, reset password, block/unblock, sign out devices or delete. Overview, Access, Payments and Devices tabs keep notes and history compact. **Add subscriber** uses the existing manual access grant for a new or existing number; it does not set a password. Optional transaction fields appear under Payment details. Access periods support inline extension and confirmed revocation.

On Admin → Subscribers, **Delete account → Permanently delete account** requires explicit confirmation and removes the account and all related credentials, sessions, verifications, saved slips, payment records/screenshots, access periods and related audit data in one transaction. **Erase personal data instead** retains accounting history. Previously erased accounts can also be deleted. Other accounts and shared subscription plans remain available; deletion changes payment and subscriber totals. Apply the additional DELETE grants on `PaymentSubmission`, `AccessCode` and `OwnerAuditEvent` from `deploy/manual-account-grants.sql` before deploying this flow. No schema migration is required. Backups retain their existing lifecycle; reapply account deletions before promoting a restored backup.

Run `npm run db:generate`, `npm run db:validate`, `npm run lint`, `npm run typecheck`, relevant member/payment/paywall tests, and the production build. Database integration tests require an isolated genuine MySQL installation or an explicitly approved isolated test target; unavailable MySQL means skipped integration coverage, not a successful migration.
