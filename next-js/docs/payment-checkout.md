# Payment checkout and reconciliation

`20261101120000_payment_checkout` adds the three-step subscription and wallet top-up checkout. Package prices and durations are unchanged. Existing access, referral periods, wallet history and payment references remain intact. New qualifying referred registrations earn one redeemable day; existing rewards are not awarded again or converted into money.

The customer explicitly confirms internal spending. External requests reserve wallet funds and referral days for 48 hours. All spend paths exclude reservations. Expiration, cancellation and rejection release them. Expired funding requires customer confirmation before approval, even when a receipt has already been verified.

The browser keeps its draft, step, idempotency key, message, corrections and screenshot in account-scoped IndexedDB. A lost response can safely retry the same request. External receipts require at least a transaction message or screenshot; both support pasting. Screenshots use the existing bounded JPEG preparation and local OCR; extraction failure permits manual correction while retaining the required evidence. Provider timestamps fill the editable date/time field when recognized. Raw evidence remains private and separate from receipt identity. Corrections keep the original evidence and additional screenshots. Browser-storage failures are shown inline.

The compact interface keeps progress numbers and labels inline, omits duplicate headings and step-count text, and pairs the four methods in two rows. The pay step uses one brief amount/duration sentence above the provider number and inline copy icon. Additional wallet funding stays visible when used. Screenshot extraction preserves an already-entered transaction message.

`PaymentReceipt` uniquely identifies `(provider, normalized transaction ID)`. Verification records the reviewer, actual amount, recipient, receipt time and available sender number. Approval separately allocates receipts, debits reservations, grants access and credits excess in one transaction. Each receipt and request can be allocated once. Genuine excess is credited rather than refused because it exceeds the package price. Integer wallet balances support up to UGX 2,000,000,000; funds exceeding storage capacity stay verified and unallocated for reconciliation.

Another customer's claim is retained separately and flags ownership without changing the original subscriber or revoking approved access. An administrator must contact the sender number verified from the receiving account, record the intended subscriber and explain the resolution. An unverifiable payer or unclear shared phone leaves funds unallocated for official provider escalation. Allocated money cannot be assigned to another request.

Admin review uses server-side search and 30-request pages, with oldest open requests first. It supports individual receipt checks, approval and next, correction, rejection with a reason, disputes and an unallocated-funds filter. Revision checks and account/settings locks serialize reviewers. Audit events are append-only. The existing admin badge and customer inbox provide in-app updates. New checkout actions do not enqueue outbound SMS, WhatsApp or email. Optional support links let the customer open the relevant app with a request reference.

Private evidence follows the existing screenshot retention setting after approval, and seven days after rejection/cancellation. Disputed and verified-unallocated evidence remains available for reconciliation. Account erasure removes customer evidence and releases reservations. Permanent deletion is refused for accounts with receipt accounting; the operator can erase personal data instead. Number changes require open payment accounting to be resolved first.

## Release

1. Back up the database and pause writers while changing CHECK constraints.
2. On MySQL, apply the committed Prisma migration through the existing deployment workflow. On production MariaDB, import `prisma/mariadb/20261101120000_payment_checkout.sql` instead; it records the canonical migration checksum after verification.
3. Apply `docs/deployment/payment-checkout-grants.sql`, replacing the database and application principal placeholders.
4. Generate the Prisma client and deploy the application together. Run database health/schema checks before reopening writers.

The existing `/api/account/payments` URL now shares the authorised durable checkout handler. Cached older forms must refresh; they cannot create unreserved legacy submissions. Existing historical reports remain reviewable. Their approval requires explicit verification and registers their receipts in the shared uniqueness ledger.

## Verification

`node --conditions=react-server --test tests/checkout.test.mjs` covers integer funding, strict inputs, manual extraction fallback, origin/session protection, upload validation, throttling and private headers.

Set `MYSQL_TEST_SERVER_BINARY` to a genuine MySQL server binary, then run `node --conditions=react-server --test tests/checkout.integration.mjs`. It creates an owned, temporary database and exercises real constraints, reservations, internal redemption, combined funding, top-ups, excess, ownership disputes before/after approval, corrections, expiry and concurrent decisions. No business database or payment provider is used.

`python scripts/preview-checkout.py` serves the real customer components against synthetic responses for desktop/mobile browser acceptance. It must never be used to send money. Financial verification remains in the real database integration tests.

Acceptance on 1 November 2026: checkout unit/HTTP tests and real MySQL checkout, migration, admin-review and retention scenarios passed. Schema generation/validation, lint, TypeScript and the production build passed. Browser checks covered mobile/desktop navigation, draft restoration, clipboard text/images, screenshot preview, failed extraction and editable extracted timestamps. At 390px, the ordinary pay sentence is one 20px line and each progress item is one 23px row, with no horizontal overflow.

The full unit run recorded 2,687 passes, 14 failures and one skip. Three timing failures passed on an isolated 51-test rerun; the other eleven failures were reproduced on the original checkout and concern unrelated navigation, SEO, offline data, match streaming and slip behavior.
