# 219 — Payment checkout and reconciliation

Implement `prompts/payment-implementation-prompt.md` within the shared Next.js application.

- Preserve package snapshots, existing earned access, branding, wallet history and referral qualification rules.
- Add durable idempotent requests, provider/transaction receipt identities, private claims, reservations and audit events.
- Offer Package, Pay, Details and Review steps with explicit internal confirmation and customer-correctable original evidence.
- Verify receipts individually, preserve unapplied money, block disputed ownership and allocate once.
- Integrate customer status, optional support links and paginated admin review.
- Verify accounting and concurrency on an isolated MySQL instance; check responsive rendering, types, lint and build.

Historical referral access remains intact. Future qualifying registrations earn one redeemable day.
Reservations last 48 hours; expired requests require customer reconfirmation before allocation.

Completed the customer layout refinements: inline progress labels, one-line pay summary, paired methods with icons, compact provider/copy row, full-width pasteable evidence and screenshot preview. External receipts require a message or screenshot on both client and server.

Verified with restricted real MySQL accounting/migration/admin/retention scenarios, responsive browser acceptance, focused unit/HTTP checks, schema checks, lint, TypeScript and production builds. Existing unrelated unit-suite failures are recorded in `docs/payment-checkout.md`.

Funding fields immediately cap wallet contributions at the available balance and package price, and referral days at the available days (up to 365). The same caps apply to restored drafts, package changes and refreshed balances; changes clear purchase confirmation. Server-side balance validation remains authoritative.

Each funding field has a compact inline Max button that fills its permitted maximum using the same capped input update. It is disabled when no balance is available or the field is already at its maximum. A contribution covering the complete package selects wallet-only checkout; spending still requires explicit confirmation.

Wallet selection is an independent contribution whenever the spendable balance is positive. Customers can edit that contribution and choose MTN or Airtel for the remainder; switching providers preserves partial wallet funding. Progress markers/labels share one vertical alignment. Confirmation uses Submit, omits redundant screenshot helper prose, and presents errors, verification information and payment adjustments in the shared dialog.

Referral days are also an independent selection: a weekly package plus seven redeemed referral days grants fourteen days at the unchanged weekly cash price. Selecting only referral days retains cash-free redemption; choosing a paid source adds those days to the package instead.

Screenshot intake now enforces one current image per transaction, explicit replacement, duplicate-byte/image detection, multi-image selection, clear readability/provider/message mismatch feedback and improved removal. Reuse checks run privately before acceptance and again before submission. Checkout dialogs require button dismissal. Preview samples support testing all cases; original accepted evidence survives failed replacement and remains restorable across refresh.

The flow now separates Details from Review, keeping the summary, evidence preview and terms on the final step. Shared floating fields and amount grouping reduce the evidence form's height. The payer field groups its national digits by country without changing its canonical value. Each evidence source becomes optional when the other is supplied. Provider branding and receiving numbers are checked separately during extraction, before Review/Submit and on the server; failed checks preserve balances and prior evidence. Customer date/time entry is removed, extracted dates are retained, and an absent evidence date is explicitly identified for admin verification rather than presented as a detected payment time.

The payer now shares the floating field treatment with "Number used to pay" above the editable national number. Details and Review reuse one private screenshot preview dialog. Removing evidence retains extracted details; Next remains actionable and explains the missing screenshot/message requirement through the existing checkout dialog.

Clipboard readability validation runs before either Paste or direct paste changes the field. It requires a readable ID/amount without replacing existing content on failure. A conditional Clear action sits to the left of Paste and clears the message in one click without losing other evidence or extracted fields.

Readable provider, recipient, source-ID/amount and reported-field discrepancies now use advisory dialogs. Unknown providers are identified as uncertain. Customers can correct details, change the method or explicitly Continue for admin review; fresh comparisons are required after evidence/method changes and before Review/Submit. The server independently records warnings and requires acknowledgement. Admin findings are tied to the latest evidence fingerprint and recorded separately from receipt verification. Approval requires both, and corrections invalidate previous findings. Receipt identity, allocation, duplicate checks, unreadable-input rejection and private evidence retention remain enforced.
