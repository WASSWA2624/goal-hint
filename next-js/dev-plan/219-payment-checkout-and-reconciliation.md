# 219 — Payment checkout and reconciliation

Implement `prompts/payment-implementation-prompt.md` within the shared Next.js application.

- Preserve package snapshots, existing earned access, branding, wallet history and referral qualification rules.
- Add durable idempotent requests, provider/transaction receipt identities, private claims, reservations and audit events.
- Offer three checkout steps with explicit internal confirmation and customer-correctable original evidence.
- Verify receipts individually, preserve unapplied money, block disputed ownership and allocate once.
- Integrate customer status, optional support links and paginated admin review.
- Verify accounting and concurrency on an isolated MySQL instance; check responsive rendering, types, lint and build.

Historical referral access remains intact. Future qualifying registrations earn one redeemable day.
Reservations last 48 hours; expired requests require customer reconfirmation before allocation.

Completed the customer layout refinements: inline progress labels, one-line pay summary, paired methods with icons, compact provider/copy row, full-width pasteable evidence, screenshot preview and editable extracted timestamps. External receipts require a message or screenshot on both client and server.

Verified with restricted real MySQL accounting/migration/admin/retention scenarios, responsive browser acceptance, focused unit/HTTP checks, schema checks, lint, TypeScript and production builds. Existing unrelated unit-suite failures are recorded in `docs/payment-checkout.md`.

Funding fields immediately cap wallet contributions at the available balance and package price, and referral days at the available days (up to 365). The same caps apply to restored drafts, package changes and refreshed balances; changes clear purchase confirmation. Server-side balance validation remains authoritative.

Each funding field has a compact inline Max button that fills its permitted maximum using the same capped input update. It is disabled when no balance is available or the field is already at its maximum. A contribution covering the complete package selects wallet-only checkout; spending still requires explicit confirmation.

Wallet selection is an independent contribution whenever the spendable balance is positive. Customers can edit that contribution and choose MTN or Airtel for the remainder; switching providers preserves partial wallet funding. Progress markers/labels share one vertical alignment. Confirmation uses Submit, omits redundant screenshot helper prose, and presents errors, verification information and payment adjustments in the shared dialog.
