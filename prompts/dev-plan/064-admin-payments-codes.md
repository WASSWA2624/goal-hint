# 064 Owner payments queue and codes

**Feature:** The owner's Payments page with automatic checks and one-tap approval against their own wallet, rejection and reversal, the code ready panel with WhatsApp and SMS messages, and the Codes page with manual codes, revoke, extend and reissue.

**Depends on:** [060-access-codes-periods.md](060-access-codes-periods.md), [063-get-access-payments.md](063-get-access-payments.md).

**Source:** [App specification](../../app-write-up.md), section 1 (version 1.9 paid access); [monetization plan](../monetization.md), sections 2 (owner journey), 3 (payment proof, transaction ID, code delivery), 5.3 (owner actions), 5.4 (owner viewing, approve, reject), 5.6 (Payments, Codes, payment card, code ready panel, messages), 5.8 and 8 (064).

## Prompt

Read `prompts/dev-plan/000-index.md`, the source sections and existing code before implementing this feature. Every page and route uses the 057 guard, every action is a same-origin JSON POST and every action is audited. Nothing is ever approved automatically.

- **Payments page** (`src/app/admin/payments/`): pending and superseded cards, oldest first, refreshed every 60 s, with the pending count in the tab strip and the document title; approved and rejected tabs. Free-trial requests (plan 5.10) come first as small cards (number, request time, "this IP asked for N trials today") with **Send free trial**, which creates the `trial` code through the 060 service and opens the panel, and **Dismiss**. Each payment card shows the screenshot (tap to zoom) beside "Subscriber says": payer `256 772 123 456`, network, transaction ID, UGX amount, plan and price, time (EAT) and reference.
- **Automatic checks**, each a coloured line (plan 5.6): amount ≥ plan price; ID never approved (by `txnKey`, both networks; same network refuses approve, other network warns); same ID pending elsewhere; identical image (same SHA-256); payer has its own Goal Hint account; payer differs from account (info, or a warning when either of the two checks above it fires).
- **Below the checks:** editable network, transaction ID, amount and plan, prefilled from the claims. **"Paste my SMS"** fills them from the owner's received-money SMS with `parsePaymentSms`, shows "Your SMS says" beside the claims and compares the sender with the payer number. The line "Code goes to 256 7xx xxx xxx (account number)". One big button, **"I found this payment in my account"** (`Button size="large"`), and a smaller Reject.
- **Screenshot route** (`GET /api/admin/payments/[id]/screenshot`): an owner session; `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'`, `Content-Disposition: inline`, `Cross-Origin-Resource-Policy: same-origin`, `X-Robots-Tag: noindex, nofollow`, `Content-Type: image/jpeg`.
- **Approve** (`POST /api/admin/payments/[id]`, pending or superseded): the body holds the final network, transaction ID, amount and plan. One transaction sets those values and `approvedTxnKey = network:txnKey(ID)`, approves the submission, creates the `AccessCode` with `paymentSubmissionId` set, and activates it, so its period starts now or when the current one ends (060). A unique violation refuses with a link to the earlier submission. The no-store response carries the plain code once and which message to use: the renewal message when the account has an unlocked session, otherwise the new-code message. Use the same approval function as 060's manual code with an ID.
- **Reject:** preset reason (`unreadable`, `amount-mismatch`, `not-received`, `duplicate`, `wrong-number`, `other`), optional text, optional "delete image now", then "Tell them" links. **Reverse** (approved only, reason `network-reversal` or `wrong-account`) through the 060 service. If the revoked code also carried other days (a number change), say so and offer Generate code. For `wrong-account`, offer a manual code for the real payer's number with the amount and the note "for P-XXXX" and no ID, because the reversed row keeps it, so revenue counts the money once.
- **Code ready panel**, shown after approve, manual generate, reissue, number change or free trial, built from the POST response only: the large code with its reference and **Copy**; **WhatsApp** and **SMS** buttons built with `waHref` and `smsHref` to the **account's** number (`target="_blank" rel="noopener noreferrer"`); it stays until "Done, sent", keeping the code in that tab's `sessionStorage` so it survives a reload while the owner is in WhatsApp; the warning "If it is lost, use Reissue; the old code stops working." The link origin is `publicPolicy.origin` in production and the request's own origin locally. Messages make no accuracy claims and show only the masked number (the two templates below).
- **Codes page** (`src/app/admin/codes/`, `POST /api/admin/codes`): status, reference, phone, plan, days left and dates; filter by status; search by phone or reference (with or without `P-`/`C-`), with phone searches in POST bodies and links by `accountId` only. Actions: Revoke, Extend (1–60 days), Reissue (adds "If the code was shared, also tap Sign out all devices.") and Generate manual code (number, plan or day count, amount, required note, optional network and transaction ID).
- `data-analytics-ignore` on owner controls and on `tel:`, wa.me and `sms:` links. Extend `tests/admin-routes.test.mjs` for every new route and page.

New code message (the account has no unlocked device):

```
Goal Hint code: XXXX-XXXX-XXXX
Tap to unlock: https://goalhint.com/en/account#code=XXXX-XXXX-XXXX
Weekly: access until Sun 1 Nov, 21:00 EAT. Works only on your Goal Hint number ending 456. Keep this message for a new phone.
```

Renewal message (the account has an unlocked device):

```
Goal Hint: renewed until Sun 1 Nov, 21:00 EAT. Your unlocked phone updates by itself.
New phone or browser? Code XXXX-XXXX-XXXX, or tap: https://goalhint.com/en/account#code=XXXX-XXXX-XXXX
Works only on your Goal Hint number ending 456.
```

Free trial message:

```
Goal Hint free trial code: XXXX-XXXX-XXXX
Tap to unlock: https://goalhint.com/en/account#code=XXXX-XXXX-XXXX
Free trial: access until Tue 21 Oct, 14:30 EAT. Works only on your Goal Hint number ending 456.
```

**Files.** New: `src/app/admin/payments/`, `src/app/admin/codes/`, `src/app/api/admin/payments/[id]/route.ts`, `src/app/api/admin/payments/[id]/screenshot/route.ts`, `src/app/api/admin/codes/route.ts`. Changed: `tests/admin-routes.test.mjs`, `tests/payments.test.mjs`, `tests/payments.integration.mjs`.

## Acceptance checks

Run `npm run test:admin` and `npm run test:payments`.

- The screenshot route is 401 without an owner session and sends the sandbox headers.
- Each automatic check fires on its fixture, and "payer differs" turns to a warning with either companion check.
- Exactly one approval results from each race: two concurrent approvals of different submissions with one (network, `txnKey`); a dotted and an undotted ID; a manual code with ID X racing a form approval of X.
- After a manual code with ID X, a form submission of X gets 409.
- Edited values are the ones stored.
- A new subscriber's period starts at approval, and the new-code message states its end time.
- A renewal approved for an account with an unlocked device keeps picks across the period boundary with no code entry, and uses the renewal message.
- Send free trial creates one 2-day `trial` code with amount 0 and the trial message; Send and Dismiss are refused once the account has a code; both are audited.
- The code is returned once and never again.
- Decoding the wa.me `text` and the sms body returns the full message, including `#code=`, `&` and line breaks.
- The message shows the masked number and never all 12 digits; the link origin is the environment's site origin.
- The stolen-ID flow counts revenue once and keeps the ID unapprovable: a stranger's approval, the real payer's 409, Reverse `wrong-account`, then a manual code for the payer.
- Codes keep their plan snapshot; every action is audited; the guard test covers every new route and page.
- Manual: the panel survives tapping WhatsApp, a tab reload and returning; pages work at 375 px in the Browser pane.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../../next-js/dev-tracker.md) by marking this file's row ☑ Completed. While work or required checks remain incomplete, mark it ◐ Partial once implementation has started, and leave it ☐ Not started until then.

Update `docs/development-progress.md` with changed files, checks and results (including manual checks), and actual blockers. Record justified implementation choices in `docs/implementation-decisions.md`.
