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
