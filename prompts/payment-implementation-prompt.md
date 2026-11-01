# Payment Implementation Prompt

Implement the following in the existing app. Inspect the current payment, subscription, wallet and referral code first; reuse working features and project conventions. Keep existing branding, package prices and durations. Limit changes to this workflow.

## 1. Goal and payment rules

Make manual payments feel smooth and automatic, with external payment verification by the admin as the only required human step.

- Support MTN Mobile Money, Airtel Money, wallet balance and referral credits.
- Wallet balances are UGX. Allow wallet-only payment or wallet plus one mobile-money provider. Wallet credit is non-withdrawable and usable for subscriptions.
- Referral rewards represent access time: each qualifying referred registration earns the existing points equivalent of 24 hours. Preserve existing qualification rules; prevent repeated awards for the same referral and self-referrals.
- Allow referral days to be redeemed alone or added to a paid package. They extend access; do not invent a conversion into UGX or deduct them from package prices.
- When referral-only redemption is selected, replace the package purchase summary with the chosen referral days and zero cash due. For a paid package, show purchased duration plus any additional referral days.
- Debit wallet/points only after explicit confirmation. An adequately funded wallet-only purchase or referral-only redemption activates immediately; external money requires admin verification.

## 2. Compact, three-step checkout

**Step 1 — Choose package:** Keep the existing package selector and a clear Next button.

**Step 2 — Choose payment:** Show the available methods and relevant balances. First-time users must choose; returning users may have their last successfully completed method preselected only when still usable. Preserve choices when navigating back. Never automatically deduct funds.

Show only the selected provider's receiving number, account name and Copy button. Directly above that number, place a compact inline breakdown: package price, wallet contribution and **amount to send**. Display referral days separately. Show only relevant rows.

**Step 3 — Confirm:** For external payment, accept a screenshot, pasted transaction message or manual transaction details. Extract available details, then let the customer check or correct transaction ID, amount, payer number and payment date. Preserve the original evidence and record corrections. If extraction fails, allow manual entry; never treat extraction as payment verification.

Immediately below these fields and above **Submit for review**, show a compact summary and any shortfall or excess. For internal-only payment, omit proof fields and use **Confirm purchase** or **Redeem referral days**.

Keep these placements on mobile and desktop. Use short label/value rows, clear Back/Next controls and “Step X of 3”. Avoid unnecessary pop-ups, duplicate summaries, horizontal scrolling or fixed-height layouts that hide content. Preserve the draft across refreshes, connectivity failures and leaving to pay. Restore the same request on return.

## 3. Amounts, partial payments and subscription time

Calculate all amounts server-side using integer UGX and available, unreserved balances.

- Amount to send = package price − confirmed wallet contribution.
- Before verification, label amounts as reported. Example: “If confirmed, UGX 2,000 extra will be added to your wallet.”
- If short, show the exact remaining amount inline. Keep the request open and allow another transaction to be attached. Verify each receipt and count each only once. Do not activate until the full amount is covered.
- After verification, credit any excess to the wallet exactly once. Do not reject a genuine payment merely because it exceeds the amount due.
- External requests reserve selected wallet funds and referral points at submission. Exclude reservations from spendable balances. Consume them on approval; release them on rejection or cancellation. Revalidate expired reservations and require confirmation if the payable amount changes.
- Preserve verified but unapplied money for reconciliation; rejecting or cancelling a request must not erase it or credit it twice.
- Extend access from the later of current expiry or approval time. Add the purchased duration and redeemed referral time once. Show the resulting expiry in East African Time.

## 4. Duplicate receipts and disputed ownership

Use the provider and normalised transaction ID to identify a payment. Image matching may flag suspicious evidence but must not establish payment identity or ownership.

- Repeated submission by the same customer returns the existing request.
- A different customer's claim on the same payment must not overwrite or cancel the original. Record a separate claim, flag the dispute and disclose no other customer's details.
- Show: “This transaction is already linked to a payment request. Contact support with your request ID.”
- The admin must verify the actual incoming transfer in the receiving MTN/Airtel account: transaction ID, amount, recipient, successful receipt and sender details where available.
- For conflicting claims, contact the payer using the number verified from the receiving account's records. Ask which subscriber account they intended to pay for. A payer may purchase for another person.
- Upload order, screenshots, claimed phone numbers and an incoming caller's identity alone do not settle ownership. If the payer cannot be verified or a shared phone leaves ownership unclear, keep the disputed funds unallocated and escalate through the provider's official support.
- Allocate each external receipt once across the approved subscription and any wallet excess. If already allocated, block a second allocation and flag the dispute without automatically revoking existing access. Log the resolution and reasons.

## 5. Status and support

After submission show **Submitted — awaiting admin approval**, the request ID and a persistent status panel. Keep payment status separate from subscription status; pending verification must never appear as activated.

Support awaiting review, awaiting remaining payment, disputed, approved, rejected and cancelled states. Rejections require a reason and a clear correction/resubmission route. Show the exact expiry after activation. Refresh status automatically while the app is open, using existing infrastructure.

Place **WhatsApp admin**, **Call admin** and **SMS admin** below the status panel. Reuse configured admin contacts. Open the chosen app with the request ID where supported; the customer confirms sending or calling. Contacting the admin must be optional.

Use in-app customer updates and admin notifications. No email collection, email notifications or new automatic outbound WhatsApp/SMS service.

## 6. Fast, accountable admin review

Design the queue for 1,000+ daily requests: pagination, oldest-pending-first sorting, status filters and search by request ID, transaction ID or payer number. Show evidence, payment details, funding breakdown, duplicate flags and verification controls together.

Provide **Approve and next**, **Reject with reason**, **Request correction** and **Mark disputed**. Approval requires recorded receipt verification and sufficient verified funds. Never use blind bulk approval. Handle simultaneous reviewers without duplicate processing. Record the reviewer, timestamp, checked details, actions and reasons.

Block approval and allocation while ownership is disputed. Record the resolution and intended subscriber before proceeding.

## 7. Integrity and completion checks

Enforce authorisation server-side, keep uploaded evidence private, validate uploads and rate-limit abusive submissions. Use database transactions, uniqueness constraints and idempotent actions so retries, double taps and concurrent requests cannot double-spend balances, credit money twice or extend access twice. Preserve an audit ledger and existing user data.

Verify the complete flows: mobile/desktop navigation; failed extraction; interrupted checkout; wallet-only and referral-only redemption; combined funding; shortfall plus top-up; excess payment; competing claims while pending or already approved; concurrent admin actions; rejection/cancellation releases; and correct renewal expiry.

Deliver the working changes, required migrations and a brief account of what changed and what was verified. Identify any real blocker precisely. Do not implement unrelated features.
