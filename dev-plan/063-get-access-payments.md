# 063 Get access page and payment submissions

**Feature:** The single mobile-first "Get access" page (sign in, choose a plan, pay, report the payment) with SMS auto-fill, a kept draft and browser-side screenshot downscaling, plus the payment upload endpoint.

**Depends on:** [058-subscription-data-model.md](058-subscription-data-model.md), [059-phone-sign-in.md](059-phone-sign-in.md), [060-access-codes-periods.md](060-access-codes-periods.md) (the code box uses code entry).

**Source:** [App specification](../app-write-up.md), sections 1, 2 and 13 (version 1.9 paid access); [monetization plan](../prompts/monetization.md), sections 2 (subscriber journey), 3 (payment report, transaction ID, screenshots, auto-fill), 5.3 (throttles), 5.4, 5.7, 5.8, 6 (Get access page, Safety tips, controls), 8 (063) and 9.

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing code before implementing this feature. Add no npm dependencies and no OCR or image libraries; server-render first with small client islands.

- **Page** (`src/app/[locale]/subscribe/page.tsx`, thin; `src/app/_components/subscribe-route.tsx` in `PublicShell` as a non-app page): one column, numbered steps, 48 px buttons; fixed title "Get access"; noindex through `pageMetadata`; out of sitemaps and `informationPages`. While the mode is `off` it says "Subscriptions are not open yet". A network without a number is hidden.
  1. **Your number.** Signed out: `PhoneInput`, Continue (inline sign-in as JSON; a plain form post without JS) and "Have a code? Enter it". Signed in: "Signed in as 256 772 123 456 · Sign out"; when active, "Access until {date}. Paying now adds {days} days after that."
  2. **Choose a plan.** Big radio cards with name, days and price (`messages.number(value, { style: "currency", currency: "UGX", maximumFractionDigits: 0 })`); the only or first plan in the owner's order is preselected. The plans are Daily, Weekly and Monthly (OP-38), all with the same full access.
  3. **Pay.** Per network: "MTN MoMo · 256 772 000 000 · JANE DOE" with Copy number (international or local per the copy format) and, only when the render-time user agent is Android and not an in-app WebView (`; wv)`, `FBAN`/`FBAV`, `Instagram`), "Open MoMo menu" / "Open Airtel Money menu" from the owner's shortcut (`tel:` with `#` as `%23`; the text is always shown). "Send exactly UGX 5,000", the extra payment note, then one help row: "Need help? Call · WhatsApp".
  4. **Tell us.** The form below. Without JS: "This form needs JavaScript. Send your screenshot on WhatsApp instead" with Call and WhatsApp buttons.
  - **After sending:** "Checking your payment. Your code will come by WhatsApp or SMS to 256 772 123 456." and "Got your code? Enter it here" with Unlock. The help row's WhatsApp text now carries "I have paid UGX {price} for {plan}. My Goal Hint number: 256 772 123 456. Ref P-{reference}." Status is checking, approved ("Access until …", plus "We sent your code to …" for a session that is not unlocked) or rejected with the reason and the form again. Status shows only to the submitting session and to unlocked sessions of the account.
  - One collapsed `Disclosure` (`src/components/ui/disclosure.tsx`), "Safety tips", with the copy of plan section 6. No confirm dialogs, no reminder opt-in.
- **Form** (plan 5.4 field table), one client component: a visible one-line SMS box at the top, "Paste the payment SMS here (optional)", with no `name` and outside the `<form>`, so the SMS never leaves the browser; a Paste button only where `navigator.clipboard.readText` exists, called directly in the click handler (no `permissions.query`; any rejection focuses the box). The summary line "Paid UGX 5,000 to MTN from 256 772 123 456 · Change" reveals Paid from (`PhoneInput`, prefilled with the account number), Paid to our (`SegmentedChoice`, MTN or Airtel; default from the SMS recipient matched to the owner's numbers, else the pay card used, else `networkForPrefix(payer)`; hidden when only one network has a number) and Amount paid (the plan price, following plan changes until edited). Transaction ID: required, normalized live (trim, upper-case, no spaces), `[A-Z0-9.-]`, 4–40 characters. Screenshot: required, "Screenshot of the payment or its SMS", `FileInput` with a preview and size hint. Checkbox "18 or older, I accept the Terms", replaced by a one-line notice for an unlocked session whose account already accepted the current version (the version is still recorded).
- **SMS parser** (`src/domain/payment-sms.ts`, pure, browser-safe): `parsePaymentSms(text, ownerNumbers)` finds the UGX amount after send/paid/received wording (never the fee or balance), the ID after labels such as "Transaction ID", "TID" or "Trans ID", the network from MTN/MoMo/Airtel words and a counterparty number. An owner number picks that network; another number warns "This SMS shows money sent to 256 7xx xxx xxx, which is not our number." Unparsed fields stay as they were; a parse never blocks typing. Fixtures in `tests/fixtures/payment-sms/` are real anonymized owner samples (OP-38).
- **Draft:** every change saves plan, payer number, network, transaction ID, amount, the pay card used and the checkbox to `sessionStorage` under the account id, in try/catch; never the image or SMS text. Restore on load; clear on a successful Send or on sign-out.
- **Browser upload:** decode with `createImageBitmap` (an `<img>` decode as fallback); draw to a canvas with width ≤ 1080 px and height ≤ 4096 px, never upscaling; `toBlob("image/jpeg", 0.75)`, stepping to 0.65 and 0.55 while over 400 KB, then to width 900 px (never below 700 px). Send with `XMLHttpRequest` and a `FormData` of exactly the six fields plus the image (it sends `Content-Length`), with `xhr.upload.onprogress` as a percentage. Retry keeps the fields; after success call `router.refresh()`.
- **Server** (`POST /api/account/payments`; `src/server/members/payments.ts`; `src/server/images/image-format.ts`):
  1. Same-origin, mode not `off`, a valid session, an account not blocked (else the generic refusal). No unlock is needed.
  2. Caps before reading the body: uploads per session 3 stored and 10 attempts a day; per IP 50 and 50 MB a day (skipped for `unknown` addresses); stored bytes site-wide 100 MB a day, then Busy with an `uploads_busy` audit event and owner alert; 2 in flight per process (503). A tripped cap answers "Busy, try again later" with Call and WhatsApp.
  3. Require `Content-Length` ≤ 3.2 MB; read with `readLimitedBody` under the same cap and a 90 s deadline; parse the multipart from those bytes. Any field name outside the expected seven returns 400; the file must be ≤ 3 MB.
  4. `imageInputFormat(bytes, { formats: ["jpeg"], maxBytes, minSide: 200, maxSide: 4096, maxPixels: 12_000_000 })` replaces `badgeInputFormat` in `src/server/images/provider-badge.ts`; the badge call keeps PNG/JPEG, 1 MB and 2048 px. Never trust the client's content type; store the bytes as received with their SHA-256.
  5. Validate payer number (`normalizePhone`), a network with a configured number, transaction ID and its `txnKey` (upper-case, every non-letter, non-digit removed), amount (100–10,000,000), an active plan (snapshot name, days, price) and the checkbox unless the notice rule applies.
  6. If an approved submission has this `txnKey` on either network: 409 "This transaction ID was already used. If you made this payment, WhatsApp us with the ID." Nothing is stored. An ID pending in another submission is accepted (064 flags it).
  7. One transaction under the account row lock: mark any pending submission of the account `superseded` (`decidedAt = now`, `decidedBy = "system:superseded"`); insert the submission (`P-XXXX` reference, `termsVersion`, `acceptedAt`, `submittedSessionHash`) and the screenshot; count the stored upload; audit.
- `data-analytics-ignore` on the code, phone, Copy and Paste controls and on `tel:`, wa.me and `sms:` links. Add the `subscribe.*` copy keys to `src/i18n/messages/en.ts`. Extend `tests/admin-routes.test.mjs`: `POST /api/account/payments` accepts a session that is not unlocked, refuses cross-site (403) and mode `off`, and gives a blocked account the generic refusal.

**Files.** New: `src/app/[locale]/subscribe/page.tsx`, `src/app/_components/subscribe-route.tsx`, `src/app/api/account/payments/route.ts`, `src/server/members/payments.ts`, `src/server/images/image-format.ts`, `src/domain/payment-sms.ts`, `tests/fixtures/payment-sms/`, `tests/payment-sms.test.mjs`, `tests/payments.test.mjs`, `tests/payments.integration.mjs`. Changed: `src/server/images/provider-badge.ts`, `src/components/ui/controls.tsx` (`FileInput`), `src/i18n/messages/en.ts` (`subscribe.*`), `tests/admin-routes.test.mjs`, `package.json` (`test:payments`).

## Acceptance checks

Run `npm run test:payments`.

- SMS parsing: every owner-provided fixture parses to the expected ID, amount and network; fee and balance amounts are never taken; a foreign recipient warns; garbage leaves fields untouched.
- Rejected uploads: oversize, chunked oversize, slow, PNG, WebP, wrong-magic-byte and huge-dimension files, and a request with an extra field such as `sms`. Badges keep their limits.
- Transaction IDs: an ID approved on either network, with or without punctuation, is refused and stores nothing; an ID pending in another account is accepted; `txnKey` maps punctuation and spacing variants to one key.
- A second upload supersedes under concurrency and sets `decidedAt`.
- Caps: per-session (stored and attempts), per-IP and site-wide caps hold. A timed-out attempt leaves the 3 stored uploads intact. Busy writes `uploads_busy`.
- Snapshot prices survive plan edits.
- Assent is recorded, and an unlocked renewal with current assent needs no checkbox.
- Another session sees no status.
- Manual (throttled and phone-only checks as the 057–067 gate describes):
  - the page is usable before the form hydrates;
  - a 1080×2400 screenshot re-encodes to ≤ 400 KB and uploads within 90 s at 200 kbit/s, with a percentage shown;
  - a 1080×6000 capture stays ≥ 700 px wide;
  - after Copy number, a trip to Messages and a forced tab discard (`chrome://discards`, or Android "Don't keep activities"), the fields come back;
  - the SMS box works by long-press in Chrome Android and the Facebook in-app browser, with no permission prompt;
  - the menu button is absent on iOS and in in-app browsers;
  - no new npm dependency was added.
- If owner SMS samples are missing, the parser ships against documented labels and the real fixtures become a 067 blocker.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Update `docs/development-progress.md` with changed files, checks and results (including manual checks and where they ran), and actual blockers. Record justified implementation choices in `docs/implementation-decisions.md`.
