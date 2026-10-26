> **20 October 2026 owner amendment (specification 1.11):** all app screens and factual content remain public; all predictions and odds, including completed/canceled/awarded fixtures, require a current unlocked subscription. Best Slips is home, with public total odds, estimated joint probability and match count; its selections remain subscriber-only. Account/Get access links are always visible. The owner's later instruction opens all local account, trial, code and payment-report flows in **test** mode. The supported `off` mode closes new subscriptions while retaining sign-in and prediction gates; valid unlocked periods remain accessible until expiry in every mode. Receiving numbers/names and independent support call/WhatsApp numbers are environment-managed; preserve historical database values and reject dashboard/API edits to those identity fields. Use the shared robust phone input and existing square chrome. These instructions supersede the earlier free-final-fixture, off-mode bypass, test-mode anonymous bypass, hidden-entry-point and dashboard identity-editing instructions below. No production deployment or activation is authorized.

# Monetization: phone accounts and manual mobile-money subscriptions

**Repository layout:** The existing web application, supporting documentation, development tracker, assets, and tooling live in `next-js/`. File paths below are relative to the repository root; run web commands from `next-js/`. Shared `app-write-up.md` and `prompts/` remain at the root; numbered web implementation plans live in `next-js/dev-plan/`. The planned `flutter/` shell is outside this implementation plan.

**Status:** Plan only, not implemented. **Date:** 2026-10-19 (plans and period start set by the owner the same day). **File:** `prompts/monetization.md`.

Visitors sign in with their phone number only and pay the owner by MTN MoMo or Airtel Money. On one simple "Get access" page they report the payment: the number they paid from, the transaction ID, the amount and a screenshot, mostly filled in for them. The owner finds the money in their own mobile-money account, approves with one tap on a phone-friendly `/admin` dashboard, and sends a 12-character access code by WhatsApp or SMS. The message carries a one-tap unlock link. The code works only on the account that paid. It shows picks, probabilities and AI analysis for upcoming and live matches from the moment the payment is confirmed until the paid period ends: Daily (24 hours) UGX 1,000, Weekly (7 days) UGX 5,000 or Monthly (30 days) UGX 20,000. Every plan gives full access to every feature; only the length differs. A new number can ask for one free 2-day (48-hour) trial code. A renewal paid from an unlocked phone extends that phone by itself. Fixtures, scores, factual insights and finished-match results stay free. Everything ships behind a dashboard switch that stays **off** until the owner turns it on.

**Reading guide.** Owner: sections 1–4 for what changes and what you do, section 12 for what you must confirm. Sections 5–11 are the engineering appendix that prompts 057–067 carry.

## 1. Summary and goals / non-goals

**Goals**
- Phone-number accounts with no password, no OTP and no other personal data. Numbers are digits with the country code and no plus, e.g. `256772123456`.
- One mobile-first "Get access" page: sign in, pick a plan, pay, report the payment. Auto-fill wherever possible; big buttons; works on cheap Android phones on slow 3G.
- An owner dashboard for prices, numbers, reviews, codes, subscribers and settings, with one-tap approval against the owner's own wallet, helped by automatic checks.
- Access codes bound to the paying account, delivered with a one-tap unlock link, expiring on their own.
- Server-side gating of prediction content for non-subscribers, with no leaks in HTML, RSC data, APIs or metadata.
- Keep SEO value: match pages stay indexable with free facts and settled results.

**Non-goals (now)**
- Automatic payment confirmation, auto-approval or AI reading of screenshots (section 13).
- SMS or WhatsApp sending from the server. The owner sends codes from their own phone.
- Passwords, OTP, names, emails or profiles; currencies other than UGX; refunds inside the app.
- Betting, bookmaker links or stakes (unchanged, OP-36).
- Any production deploy. Nothing is deployed unless the owner explicitly asks.

## 2. How it works

**Subscriber journey.** Everything happens on one scrolling page, `/en/subscribe`, titled "Get access".
1. A match card says "Pick for subscribers". The feed banner and the match page panel link to Get access; the panel also offers "Have a code?".
2. **Your number** (skipped when signed in). The box starts with `256`. Typing `0772 123 456`, `+256…` or `00256…` turns into `256 772 123 456`, shown under the box. Tap Continue. A new number creates an account.
3. **Choose a plan.** Daily (24 hours, UGX 1,000), Weekly (7 days, UGX 5,000) or Monthly (30 days, UGX 20,000), all with the same full access. The first plan in the owner's order is already picked. A new number also sees "New here? Try 2 days free" (5.10).
4. **Pay.** The page shows our MTN and Airtel numbers with their registered names and a Copy button. On Android it also shows an "Open MoMo menu" button, when the owner has set one. One "Need help? Call · WhatsApp" row sits below.
5. **Tell us about your payment.** Paste the confirmation SMS into the box (or tap Paste): the transaction ID, amount and network fill in. One line reads "Paid UGX 5,000 to MTN from 256 772 123 456 · Change". Add the screenshot, tick "18 or older, I accept the Terms" (not needed again when renewing from an unlocked phone), and tap Send. If you leave the page to copy the SMS or take the screenshot, what you typed is kept.
6. The page now says "Checking your payment. Your code will come by WhatsApp or SMS to 256 772 123 456." A code box sits below.
7. The code message has a link. Tap it and tap **Unlock**. On a phone that is not signed in, type your number first. Access already runs from when the owner confirmed the payment (or from when your current access ends); unlocking does not change the end time.
8. Renewing from a phone that is already unlocked: when the owner approves, that phone's access extends by itself. Picks show until the paid time runs out. A new phone or browser needs the code once (2 devices by default). The code works only on the account that paid.

**Owner journey**
1. Sign in at `/admin` with the existing analytics owner credentials.
2. First time: set plans and prices, payment numbers and registered names, contact and WhatsApp numbers, and optional menu shortcuts. Switch to **Test**, open goalhint.com/en/account on a phone and try it. Switch **On** when ready.
3. **Payments** shows the pending count. Free-trial requests from new numbers sit at the top with a **Send free trial** button (5.10). Each card shows the screenshot and what the subscriber says (payer number, network, transaction ID, amount). Automatic checks sit beside it:
   - the amount is at least the price;
   - the ID was not used before;
   - the same ID is in another pending payment;
   - the image is identical to an earlier one;
   - the money came from another number;
   - the payer number has its own account.
4. Open your own MTN or Airtel messages or statement. If the payment is there and the sender matches, tap **"I found this payment in my account"**. The button shows which number gets the code. You can correct any value first, or paste your own received-money SMS to fill and compare. The code appears once, with WhatsApp, SMS and Copy buttons; the message is ready, with the unlock link. Send it.
5. If you cannot find the payment, Reject it with a reason and tap "Tell them".
6. **Codes:** revoke, extend (compensation) or reissue a lost code on the same account (if it was shared, also sign out all devices). **Reverse** an approval if the network reverses the money or the code went to the wrong account. **Subscribers:** look up a number, sign out its devices, see its unlock count, block it, change its number, or erase it on request.
7. **Number change:** first confirm the request from the old number or by the payment details. Then tap **Change number**. It cancels the old codes and creates one code for the new number with the remaining days. Codes never move between accounts.
8. Generate a code without the form for cash, promotions, compensation, or a mobile-money payment reported on WhatsApp. For a mobile-money payment, add its network and transaction ID so it can never be approved twice.

## 3. Key decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Identity | Phone number only. Canonical form: digits with the country code, no plus (`256772123456`), shown as `256 772 123 456`. The box starts with `256`; typing `0772…`, `772…`, `+256…` or `00256…`, even after the `256`, converts live. `256` numbers must be `2567` plus 8 digits; other countries are accepted when typed in full (10–15 digits, no leading 0). | Owner requirement; the owner matches payers by number. |
| Phone storage | Plain digits, `VarChar(15)`, unique, not hashed. Same format for payer and settings numbers. | Not a secret. Hashing protects nothing and burns CPU on shared hosting. |
| Security model | The number **identifies**; the access code is the **secret**. A session sees picks only if (a) the account has a paid period running now and (b) one of the account's valid codes was entered in that session. Without (b): no picks, no payment status, no subscription details. | Anyone can type any number. |
| Code binding | A code works only on its account: the one that submitted the payment, or for a manual or number-change code the account of the number the owner typed. Any other account gets the generic "Code not recognized". Nothing moves codes between accounts. | Owner requirement: a code cannot activate another account. |
| Device unlock | Entering a valid code unlocks the session. It stays entitled across renewals while any period of the account runs. Cleared by sign-out, eviction, owner sign-out, a block, or revoking the code that was entered. | Code entered "once on that device". |
| Renewal | Like every code, a renewal's period starts at payment confirmation, or when the current period ends. A session that is already unlocked stays entitled, so a renewal needs no code entry. The message still carries the code for new devices. | Automate where possible; a renewal never waits on a forgotten tap. |
| Free trial | A new number (no code ever) can ask once for a 2-day (48-hour) trial; the owner sends it as a `trial` code. | Owner decision; numbers are not verified, so a self-starting trial would be unlimited. |
| Device cap | At most N unlocked sessions per account (default 2); a new unlock evicts the oldest. The owner sees unlock counts. | Limits sharing, simply. |
| Code delivery | The owner sends it to the **account's** number by WhatsApp (wa.me), SMS or Copy. The message carries `https://goalhint.com/en/account#code=XXXX-XXXX-XXXX` and names the number only as "ending 456". The fragment never reaches a server; the page prefills the code, clears the fragment and waits for a tap on Unlock. The code is never shown in the account. | One tap for the subscriber. A forwarded message lacks the full number. |
| Code format | 12 Crockford base32 characters, `XXXX-XXXX-XXXX` (~60 bits). Case-insensitive; spaces and dashes ignored; O→0, I/L→1. Its period is set once, at payment confirmation. | Easy to read and type. |
| Code storage | Random 16-byte salt per code; store SHA-256 of `goal-hint-access-code:v1:` + salt + code. Entry compares only with the session account's codes. A separate random reference `C-XXXX` identifies it in support. Shown to the owner once. | A leaked database still needs ~2^60 guesses per code. No key, so rotating `GOAL_HINT_ANALYTICS_SECRET` cannot break codes. |
| Period | Starts when the payment is confirmed: the owner's approval of a reported payment, or the owner creating a manual or number-change code. Code entry never starts or moves it. Lasts `(durationDays + extensionDays) × 24 h`: a day is 24 hours from activation, never a calendar day or midnight, and a month is 30 such days. A code confirmed while another period runs starts when the last one ends. Checked on every request. Times shown in EAT. | Owner decision (19 October 2026): access runs from payment confirmation to the expiry time. No job; fail-closed. |
| Payment report | The subscriber sends payer number (prefilled), network (auto), transaction ID, amount (prefilled with the price) and a screenshot. A pasted payment SMS fills the ID, amount and network. Payer, network and amount sit behind one "Change" line. | Owner requirement: payer number, transaction ID, amount and screenshot, as easy as possible. |
| Payment proof | Approve only after finding the money, from the right sender, in the owner's **own** MTN or Airtel account. Claims are prefilled and editable. Automatic checks help but never replace that look. Never auto-approve. | Edited screenshots and false claims pass every automatic check. The wallet does not lie. |
| Transaction ID | Shown upper-case without spaces; matched by `txnKey` (upper-case, every non-letter, non-digit removed). (network, `txnKey`) is unique among approved payments, enforced in the approval transaction; owner-recorded payments use the same key. An ID approved on either network is refused at submission; an ID pending in another submission is accepted and flagged. | A stranger cannot block the real payer; punctuation or a network swap cannot approve one payment twice. |
| Gating rule | One module, `next-js/src/domain/paywall.ts` (new). A fixture is free when finished (`isPlayedFinalStatus` in `next-js/src/domain/market-settlement.ts`), canceled or awarded; everything else is gated, by status alone. | One place for policy. Settled or void picks have no betting value and form a public track record. Postponed and abandoned matches can be replayed (`next-js/docs/schedule-lifecycle.md`), so they stay gated. |
| Gating seam | Redact on the server after the MySQL cache read and before serialization, in one gated-read module that every page factory and API handler must use. | One cached body serves both tiers; no viewer dimension in the cache key. |
| Gated representation | Explicit `gated` variants in the wire schemas; stored schemas unchanged. Never null out fields. Never say "locked", which means cutoff-locked. | The type checker forces every consumer to handle the gated case. |
| Paywall switch | `paywallMode`: `off` (default, subscriptions closed; predictions remain gated), `test` (anonymous and signed-in member sessions are gated), `on`. | Ships dark; the owner tests on a phone first. |
| Owner preview | A valid owner session sees full content; the check never extends it. | No need to buy a code. |
| Screenshots | DB `MEDIUMBLOB`, own table. The browser re-encodes to JPEG (width ≤ 1080 px, height ≤ 4096 px, target ≤ 400 KB), which drops EXIF. The server accepts JPEG only, ≤ 3 MB, after Content-Length, bounded-read (90 s), magic-byte and dimension checks. The form needs JavaScript; without it the page offers Call and WhatsApp. Owner-only sandboxed route. Purged 90 days after approval, 7 days after rejection or supersede. | Small, works on slow 3G. Release folders are replaced on deploy. |
| Auto-fill | Prefills, a small client-side SMS parser (no libraries) and a draft kept in the tab. No AI reading of screenshots in this plan (section 13). | Ease of use without heavy JS or new data transfers. |
| Owner auth | Reuse the analytics owner login, session table and cookie (`GOAL_HINT_ANALYTICS_ADMIN_*`). | No new env keys: an older release rejects unknown keys and returns 500. |
| Settings | One typed single-row table, cached per process for 30 s. | Owner-editable without a restart. |
| Member cookie | `__Host-goal-hint-member` (prod), `goal-hint-member` (dev). HttpOnly, Secure in prod, SameSite=Lax, Path=/. Server expiry 90 days sliding; cookie Max-Age 400 days. | Lax keeps the session on links from WhatsApp. The name must not match `goal-hint-analytics*`, which the collector drops. Server Components cannot set cookies, so the stored expiry slides and the cookie stays fixed. |
| Oracle filters | For free viewers, a parsed feed query that filters or sorts by probability, or uses `picks=only` or `odds=`, is refused: pages 307 without them, APIs 403 `subscription-required`. | Ranking by probability reveals picks. |
| Currency | Whole UGX as unsigned integers, snapshotted into submissions and codes. | Price edits never rewrite history. |

**Design notes** (choices that differ from the first draft, and why)
- **Unlock and renewals.** Unlock is per session and per account, not per code. Every period starts at payment confirmation (owner decision, 19 October 2026), so an unlocked session stays entitled across renewals with no re-entry, and code entry only unlocks a device. There is no per-account code-failure lock, because a stranger could use it to block a new subscriber's first code. The device cap with eviction is the only sharing control. The 7-day unlock budget and the redemption window are dropped, and the owner sees unlock counts.
- **Plans (owner decision, 19 October 2026).** Daily, 24 hours from activation, UGX 1,000; Weekly, 7 days, UGX 5,000; Monthly, 30 days, UGX 20,000. Every plan unlocks every feature and section; plans differ only in length and price, so there are no feature tiers. Days count from payment confirmation, so a code entered late gets no extra time: the owner sends codes promptly, the message states the end time, and Extend compensates a slow delivery.
- **Code message.** The code goes to the **account's** number, not the payer's; a payer may pay from another phone. The message shows only the last three digits. The reference is independent of the code (a suffix would give away 20 of 60 bits). Hashes are salted per code.
- **Number changes.** Codes never move between accounts. A number change is one audited owner action that revokes the old codes and issues a new code. "Move to another number" is removed.
- **Free fixtures.** Canceled and awarded fixtures are free: never played, picks void. Which families have a published pick is free (existence only, policy order). It lets the card and Verdict name the subscriber pick and keeps the family-count invariant and `matchPageIndexable` working.
- **Where the gate lives.** The gate lives in one composing module used by every route factory and handler, not inside the readers, because rendering fixtures inject fake readers.
- **Screenshot size.** Width ≤ 1080 px and height ≤ 4096 px instead of ~1600 px on the long side, so tall screenshots stay readable; quality steps down to reach ~400 KB. JPEG only, no WebP. No server-side image rewriting, because there is no no-JS upload path. Rejected and superseded images purge after 7 days.
- **Approval.** Approval rests on the owner's wallet. The subscriber reports network, transaction ID, amount and payer number; the owner can correct them. One pending per account by superseding, so a stranger cannot block the real payer. Caps per session and per IP. MySQL and MariaDB have no partial unique indexes, so uniqueness among approved payments uses a nullable unique key. Owner-recorded payments share it.
- **Switch, card and policy.** Three switch states (off, test, on) with preconditions for on. The card pick line is plain text and the tile still opens the match; the feed banner and Verdict panel carry the Get access links. `publicPolicy.access` changes in 061, not Phase 0, so it always describes the running code.
- **SMS paste.** A payer's MoMo or Airtel SMS names the recipient, not the payer. The parser fills transaction ID, amount and the receiving network, and warns when the recipient is not one of the owner's numbers; the payer number stays prefilled. The primary control is a visible paste box: long-press and Paste works in every browser with no permission prompt. The `navigator.clipboard.readText` button is an extra where the browser has it.
- **AI reading of screenshots: not built now.** The blockers below were checked in the code:
  - The only AI path is the worker's predictor. `assertOperationAllowed` needs `GOAL_HINT_AI_ENABLED=true` and `AI_API_KEY` (`next-js/src/server/config/runtime-policy.ts:367-375`). That same switch starts paid AI predictions for every fixture (`next-js/src/server/live/live-runtime.ts:100,129`).
  - `createOpenAiBinding` accepts only a prepared predictor prompt with the fixed schema `goal_hint_prediction` (`next-js/src/server/predictor/openai-transport.ts:77-81`). Its byte bound would reject any image.
  - The live cost authority approves only refresh-plan jobs.
  - A synchronous call would hold a slow-3G request open, so it could never prefill the subscriber's form, which was its purpose.

  Section 13 keeps it as a later option.
- **Code link when signed out.** Signed out, phone plus code is one request. It signs in only when the code belongs to that number's existing account; otherwise it creates nothing. The proxy's click-ID redirect keeps `#code=` on member pages. After Unlock the page does a full navigation, because Next 16.4 would write the fragment back on `router.refresh()` (5.3).
- **Owner checks.** One check is added: "payer number has its own Goal Hint account". "Payer differs from account" becomes a warning when that check or "same ID pending elsewhere" fires; otherwise it stays info. This catches a stranger who reports someone else's payment with the real payer's number. The approve button names the number that gets the code. The owner can paste their own received-money SMS to fill and compare (still one tap).
- **Transaction IDs.** Matching ignores punctuation (`txnKey`), and lookups span both networks. A reversed payment keeps its key, so its ID can never be approved again. A manual code for a mobile-money payment can carry the ID, so one unique key covers every path.
- **Change number.** Revoke plus manual code is one action, **Change number**, in one transaction. It revokes every live code of the old account and computes the remaining days. It writes one audit row per revoke plus one for the new code, with how the request was verified. No code moves.
- **Get access page.** Step 3 holds the one help row (Call, WhatsApp). After sending, its WhatsApp text carries the `P-` reference, which replaces the separate "WhatsApp us" button. Payer, network and amount sit behind one "Change" summary line. Renewals from an unlocked session skip the checkbox when the account already accepted the current Terms. The account page gets a Renew button.
- **Cut for simplicity:** the redemption window and "not used in time", the two Reissue modes, the Overview reminder and unused-code cards, and bulk reject. The per-IP upload cap is raised to 50 a day because of CGNAT.

## 4. Free vs subscriber-only content

| Content | Free | Subscriber |
| --- | --- | --- |
| Fixtures, teams, kickoff, competitions, search, leagues | Yes | Yes |
| Live scores, results, live clock | Yes | Yes |
| Factual insights: form, H2H, lineups, injuries, stats, standings, referee, sourced news | Yes | Yes |
| Which market families have a published pick (existence only, policy order) | Yes | Yes |
| Picks, probabilities, alternatives, all families and prices for unfinished fixtures (scheduled, live, postponed, abandoned, unknown) | No: "Pick for subscribers" | Yes |
| AI analysis of unfinished fixtures, including "Goal Hint analysis" items in insights news | No | Yes |
| Revision history (`?revision=`, `?cycle=`) of unfinished fixtures | No | Yes |
| Finished, canceled and awarded fixtures: picks, Win/Loss, analysis, history | Yes (owner to confirm, OP-37) | Yes |
| Performance aggregates (`/api/performance`) | Yes | Yes |
| Slip builder results; bookmaker prices (when `providerOdds` is on) | No | Yes |
| Feed probability range, probability sort, picks-only, odds filter | No ("Subscribers only") | Yes |
| Page metadata (title, description, OG/Twitter) | Generic, never a pick or probability | Same |

## 5. Design

### 5.1 Data model

All tables are new. Every `CREATE TABLE` states `ENGINE=InnoDB`. Instants are `DATETIME(3)` UTC; phones, hashes and codes use `utf8mb4_bin`. Each Prisma model gets a privacy comment (`next-js/prisma/schema.prisma`). Phones are canonical digits (5.2).

| Table | Key columns | Constraints and notes |
| --- | --- | --- |
| `MemberAccount` | `id Char(36)`, `phone VarChar(15)?`, `createdAt`, `lastSignInAt`, `blockedAt?`, `blockedReason?`, `ownerNote VarChar(500)?`, `trialRequestedAt?`, `trialDismissedAt?`, `erasedAt?` | `phone` unique, NULL after erase. Row-lock target for every account change. |
| `MemberSession` | `tokenHash Char(64)` PK, `accountId` FK (cascade), `createdAt`, `lastSeenAt`, `expiresAt`, `codeEnteredAt?`, `accessCodeId?` | Index `accountId`, `expiresAt`, `accessCodeId`. Max 10 per account; a new sign-in evicts the oldest session that is not unlocked and has no pending or superseded submission, else the oldest that is not unlocked. No user agent. |
| `SubscriptionPlan` | `id`, `name VarChar(40)`, `durationDays UnsignedSmallInt` (1–366), `priceUgx UnsignedInt` (100–10,000,000), `active`, `sortOrder`, timestamps | Never deleted; deactivate instead. |
| `PaymentSubmission` | `id`, `reference Char(4)` (`P-XXXX`), `source` (`report`/`owner`), `accountId` FK, `planId` FK, snapshot `planName`, `durationDays`, `priceUgx`; claims `payerPhone VarChar(15)?`, `claimedNetwork` (`mtn`/`airtel`), `claimedTxnRef VarChar(40)`, `claimedTxnKey VarChar(40)`, `claimedAmountUgx UnsignedInt`; `status` (`pending`/`superseded`/`approved`/`rejected`/`reversed`), `submittedAt`, `submittedSessionHash Char(64)?`, `termsVersion VarChar(16)?`, `acceptedAt?`; `decidedAt?`, `decidedBy?`, `rejectReason?`, `rejectText VarChar(200)?`; approved `network?`, `transactionRef VarChar(40)?`, `amountReceivedUgx?`, `approvedTxnKey VarChar(48)?`; `imageSha256 Char(64)?`, `imageBytes?`, `imagePurgedAt?`, `reversedAt?`, `reverseReason?` (`network-reversal`/`wrong-account`) | `owner` rows (5.3 manual code with an ID) have no image, session or terms fields. `approvedTxnKey` = `network:txnKey`, set only at approval and kept after reversal; unique (many NULLs allowed). Index `claimedTxnKey`, (`status`,`submittedAt`), (`accountId`,`submittedAt`), `imageSha256`. |
| `PaymentScreenshot` | `submissionId` PK/FK (cascade), `width`, `height`, `bytes`, `data Bytes @db.MediumBlob` | JPEG only. Separate so lists never load bytes. Deleted on purge. |
| `AccessCode` | `id`, `accountId` FK, `codeSalt Binary(16)`, `codeHash Char(64)`, `reference Char(4)` (`C-XXXX`), `source` (`payment`/`manual`/`reissue`/`number-change`/`trial`), `paymentSubmissionId?`, `replacedById?`, `planId?`, snapshot `planName`, `durationDays`, `priceUgx` (0 allowed), `amountReceivedUgx?` (manual only), `extensionDays` (default 0), `createdAt`, `createdBy`, `activatedAt`, `startsAt`, `endsAt` (all set at creation), `termsVersion?`, `revokedAt?`, `revokedReason?`, `note VarChar(200)?` | `paymentSubmissionId` unique, set only on the code created at approval. `replacedById` points from a reissued or number-changed code to its successor. Index `accountId`, (`accountId`,`endsAt`), `replacedById`. |
| `SubscriptionSettings` | Single row `id = 1`; columns in 5.7; `paymentNumbersChangedAt?`, `lastMembersPurgeAt?`, `updatedAt`, `updatedBy` | A missing row means defaults (`paywallMode = off`). |
| `RateLimitBucket` | `key Char(64)` PK (HMAC of purpose + value), `count`, `bytes`, `windowStartedAt`, `lockedUntil?` | Atomic `INSERT … ON DUPLICATE KEY UPDATE`. Do not copy the read-then-create of `AnalyticsLoginThrottle`, which races under ReadCommitted. |
| `OwnerAuditEvent` | `id BigInt` autoincrement, `at`, `actor`, `action VarChar(48)`, `accountId?` (no FK), `targetType`, `targetId`, `details Json` | Index (`accountId`,`action`,`at`) for unlock counts. Never holds a subscriber phone, a full code or an image. Operational, not tamper-proof: the app account has `ALL PRIVILEGES` (`next-js/deploy/how-to-deploy.md:87`). |

Code status, in order: `revoked`; `queued` (now < `startsAt`); `active` (now < `endsAt`); else `expired`. There is no unused state: every code gets its period when it is created.

**Migration workflow**
1. `npm run db:migrate -- --name subscriptions` (diffs `next-js/prisma/schema.snapshot.prisma`). Add `ENGINE=InnoDB` and collations to every `CREATE TABLE`. Commit migration and snapshot together.
2. `next-js/prisma/mariadb/<stamp>_subscriptions.sql` (new), in this order:
   - A failing guard first (`BEGIN NOT ATOMIC … SIGNAL SQLSTATE '45000'` inside a `DELIMITER` change). It stops the import if any of the nine tables exists with another engine. The runbook runs the guard query by hand first.
   - `CREATE TABLE IF NOT EXISTS … ENGINE=InnoDB`, with FKs inline or `ADD CONSTRAINT … FOREIGN KEY IF NOT EXISTS`.
   - The `_prisma_migrations` insert, copied from `20261014131920_first_party_analytics.sql`, with the final checksum.
   - A closing check of engines, collations and the FK count.
3. `next-js/tests/subscription_migration_test.py` (new; `test:scripts`) asserts `ENGINE=InnoDB` on every `CREATE TABLE` in both files. Integration tests cannot catch it: the isolated MySQL starts with `--no-defaults` (`next-js/src/server/backup/isolated-mysql.mjs:180`).
4. Local grants (`next-js/docs/local-database.md`): SELECT, INSERT, UPDATE on all nine tables; DELETE only on `MemberAccount`, `MemberSession`, `PaymentScreenshot`, `RateLimitBucket`.
5. `next-js/tests/backup-restore.integration.mjs:68` asserts 68 tables; the real count is 81 and becomes 90.

### 5.2 Phone sign-in and sessions

- `next-js/src/domain/phone.ts` (new, pure):
  - `normalizePhone(input)` works in five steps:
    1. Remove spaces, dashes, dots and brackets.
    2. If the value starts with `256` and the rest starts with `+`, `0` or `256`, a full number was typed after the prefill: keep only the rest.
    3. Drop a leading `+` or `00`.
    4. `0` + 9 digits, or 9 digits starting with 7, become `256` + the 9 digits.
    5. Valid: digits only, 10–15 of them, no leading 0, and a `256` number must be `2567` + 8 digits. Otherwise null.

    When the value is `256` followed by a digit other than 7 or 0, the hint is "For a number outside Uganda, delete 256 and type the full number with its country code".
  - `formatPhone` groups in threes: `256 772 123 456`. `maskPhone` gives "ending 456". `localUgandaPhone` gives `0772123456` (Copy button only, when settings say so).
  - `networkForPrefix(phone)`: `mtn`, `airtel` or null, from a canonical prefix table the owner confirms (section 12).
  - `waHref(phone, text)` (`https://wa.me/256772123456?text=…`) and `smsHref(phone, text)` (`sms:+256772123456?&body=…`) encode the text with `encodeURIComponent`; `telHref` adds `+` inside the link only.
- **`PhoneInput`** (new, `next-js/src/components/ui/controls.tsx`): `type=tel`, `inputMode=tel`, `autoComplete=tel`, starts with `256`. A paste replaces the whole value. Each change normalizes and shows "256 772 123 456" under the field, or the hint. No confirm step. Without JS the server normalizes and answers `?status=invalid-phone`.
- **`POST /api/account/sign-in`** (new): same-origin check; refused while `paywallMode = off`; normalize.
  - Without a code: insert the account, or re-read it after a unique conflict. Delete the session named by any member cookie the browser sent, create a session, set the cookie.
  - With a code (signed-out code link, 5.3): look up the account; never create one. No account, or no matching code: the generic "Code not recognized", no session, a wrong attempt counted for the IP. A match: create the session and redeem (5.3) in the same transaction.
  - JS callers get JSON. Plain form posts get a 303 to `account` or `subscribe`, plus an optional `return` that must match `/en` or `/en/matches/<id>/<slug>`. A number never appears in a URL.
- **Token.** `randomBytes(32).toString("base64url")`; only its SHA-256 is stored, as in `next-js/src/server/analytics/analytics-auth.ts`. Expiry `lastSeenAt + 90 days`, touched at most once a day.
- **Sign-out.** The button first removes the payment draft from `sessionStorage`. Then `POST /api/account/sign-out` deletes the row, clears the cookie, sends `Clear-Site-Data: "cache"` and 303-redirects (full navigation).
- **Other devices.** `POST /api/account/devices` signs out the account's other sessions. Any unlocked session may use it, even after its period ended; others get 403.
- **In-app browsers** (Facebook, Instagram) keep separate cookies and count as devices. `/en/account` checks the user agent at render time (never stored) and shows "Open this page in Chrome or Safari", with a **Copy code** button when a code was prefilled.
- **Blocked accounts.** All sessions are deleted at block time. Sign-in still works. Code entry and upload return the generic "We couldn't complete this. Please contact us." The same message is used for other refusals.
- **CSRF.** Every state-changing POST checks `isSameOrigin` and returns 403 otherwise.
- **Shared helpers** move from `next-js/src/server/analytics/analytics-http.ts` to `next-js/src/server/http/private-http.ts` (new): `readCookie`, `cookie` (gains `sameSite`; analytics stays Strict), `isSameOrigin`, `clientAddress`, `readLimitedBody` (gains a deadline), `privateHeaders`, `json`, `empty`, `redirect`. `analytics-http.ts` re-exports them.

### 5.3 Access codes and subscription periods

- `next-js/src/domain/access-code.ts` (new):
  - alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`; `formatCode`;
  - `extractCode(text)` takes the first dashed `XXXX-XXXX-XXXX` group in pasted text; otherwise the input, without spaces and dashes, must be 12 symbols;
  - `codeFromFragment(hash)` accepts only `#code=` plus a valid code;
  - the code field uses `autocapitalize=characters`, `autocorrect=off`, `spellcheck=false`, `autoComplete=off`.
- `next-js/src/server/members/access-codes.ts` (new): `generateCode()` (`crypto.randomInt(32)` × 12), `newSalt()`, `hashCode(salt, code)`, `newReference()`, `activate(code, account, now, termsVersion)`. `next-js/src/domain/subscription-period.ts` (new, pure): `codeStatus(code, now)`, `chainPeriods(codes, now)`, `remainingDays(codes, now)`.
- **Activation** happens when the payment is confirmed, in the transaction that creates the code: approval of a reported payment, or the owner creating a manual or number-change code. It sets:
  - `activatedAt = now`, and `termsVersion` from the submission when there is one;
  - `startsAt = max(now, latest endsAt of the account's non-revoked codes)`;
  - `endsAt = startsAt + (durationDays + extensionDays) × 24 h`.

  Code entry never activates or moves a period; it only unlocks the device.
- **Code entry** (`POST /api/account/code`, new; the sign-in code path reuses it), one transaction with `SELECT … FOR UPDATE` on the account row:
  1. Compare `hashCode(salt, input)` in constant time with each code **of the session's account** only. A correct code works even while the IP throttle is locked.
  2. `active` or `queued`: unlock; the period is unchanged. A line above Unlock reads "By unlocking you confirm you are 18+ and accept the Terms"; there is no checkbox. A code without `termsVersion` (manual and number-change codes) records it now.
  3. `expired` or `revoked`: a clear message ("This code's access ended on …"), no unlock.
  4. Not yet unlocked: issue a **new** token, insert a session with `codeEnteredAt` and `accessCodeId`, delete the old row, set the cookie, audit `device_unlocked` (prevents fixation). Above N unlocked sessions, clear the oldest unlock and audit `device_evicted`.
  5. Not found (a wrong code, or another account's code): "Code not recognized. Codes work only on the number they were sent to." with a "Not your number? Sign out" link; count a wrong attempt for the IP.
  6. Audit. JS gets JSON naming the next path: the validated `return`, else `/en/account?status=code-accepted`. The page then does a full `location.replace` to it; no-JS gets a 303 there. The code-accepted state shows a primary "See today's picks" button.
- **Code link.** The account route's root client component handles it in every state, including mode off and refusals:
  - On load and on `hashchange`, it reads `location.hash` with `codeFromFragment` and prefills the code box.
  - It then clears the fragment with `setTimeout(() => history.replaceState(null, "", pathname + search), 0)`. The deferral lets Next's history patch install first, and `null` lets Next update its own canonical URL.
  - Do not copy `history.state`, as `next-js/src/components/analytics/tracker.ts:76` does. In Next 16.4 that skips the router sync (`node_modules/next/dist/client/components/app-router.js:302-310`), so a later `router.refresh()` would write `#code=` back.
  - It never submits on its own. Signed out, it shows the phone field (`256` prefilled, focused with the cursor at the end) above the code. Signed in, it focuses Unlock.
  - On goalhint.com, the code never enters a query string, title, analytics label or server log.
- **Entitlement** is checked on every request in one SQL round trip (session primary key, (`accountId`,`endsAt`) index). It needs all of these:
  - a valid session;
  - an account not blocked or erased;
  - `codeEnteredAt` set;
  - a non-revoked code of the account with `startsAt ≤ now < endsAt`.
- **Owner actions**, under the account row lock, audited:
  - **Revoke** (reason): `revokedAt = now`; later queued periods move up; sessions that entered this code lose their unlock.
  - **Extend N days** (1–60): `extensionDays += N`; this and later periods shift.
  - **Reissue** (lost code), same account only:
    - revoke the old code (`replacedById` = new);
    - create one with the same snapshot and `extensionDays`, and `paymentSubmissionId = NULL`;
    - copy `activatedAt`, `startsAt` and `endsAt`;
    - move sessions that entered the old code to the new one.

    The panel adds "If the code was shared, also tap Sign out all devices."
  - **Reverse payment** (approved only; reason `network-reversal` or `wrong-account`):
    - The submission becomes `reversed`.
    - The live code at the end of its chain (followed through `replacedById`) is revoked. `approvedTxnKey` stays.
    - If that code also carried other days (a number change), the panel says so and offers Generate code.
    - For `wrong-account`, the panel offers a manual code for the real payer's number, with the amount and the note "for P-XXXX". It has no ID, because the reversed row keeps it, so revenue counts the money once.
  - **Manual code:** number (creates the account if missing), plan or a day count (1–366), amount received (0 allowed), required note. It binds to that number's account, and its period starts when the owner creates it, because that is when the payment is confirmed.
    - Network and transaction ID are optional, for a mobile-money payment received outside the form. A plan is then required.
    - With an ID, one transaction records an approved `owner` submission (no image; `amountReceivedUgx` on the submission, not the code). It creates the code through the approve path (source `payment`, activated at creation), so the same unique key applies.
  - **Change number** takes `newPhone` and `verifiedBy` (`old-number` or `payment-details`). One transaction:
    1. locks both accounts in id order;
    2. revokes every active and queued code of the old account (reason `number-change`, `replacedById` = new);
    3. computes the remaining time: the active remainder rounded up to whole days, plus the full days of queued codes (1–366);
    4. creates one `number-change` code (no amount) on the new number's account, creating the account if missing; its period starts now, or when that account's current period ends;
    5. audits each revoke and the new code with `verifiedBy`.

    It then opens the code ready panel for the new number. Old-account sessions lose entitlement.
- **Throttles** use `RateLimitBucket` with keys from `config.key(purpose, value)` (`next-js/src/server/analytics/analytics-config.ts`). They only shed load. Per-IP limits are skipped when `clientAddress` returns `unknown`. Any tripped upload cap answers "Busy, try again later" with Call and WhatsApp buttons.

| What | Limit |
| --- | --- |
| Wrong codes per IP | 100 an hour, then "Try again later" for wrong codes |
| Sign-ins per IP | 1,000 an hour; new accounts 1,000 a day |
| Trial requests | 1 per account and per session; 20 per IP a day |
| Uploads per session | 3 stored a day; 10 attempts a day |
| Uploads per IP | 50 and 50 MB a day |
| Stored upload bytes, whole site | 100 MB a day, then Busy and an owner alert |
| Uploads in flight | 2 per process (503) |

Per-IP limits are high on purpose: MTN and Airtel put many users behind shared (CGNAT) addresses.

### 5.4 Payment submissions and screenshots

**Form** (step 4 of Get access; signed in; no unlock needed). One client component, no new npm dependencies.

| Field | Default and behaviour |
| --- | --- |
| SMS box | Visible one-line box at the top: "Paste the payment SMS here (optional)". Parsed on input. A Paste button appears only where `navigator.clipboard.readText` exists. |
| Summary line | "Paid UGX 5,000 to MTN from 256 772 123 456 · Change". Change reveals the next three fields; all three are always sent. |
| Paid from | `PhoneInput`, prefilled with the account number |
| Paid to our | Two 3rem buttons, MTN and Airtel. Default: the SMS recipient matched to the owner's numbers, else the pay card the subscriber used (Copy or menu), else `networkForPrefix(payer)`. Hidden when only one network has a number. |
| Amount paid (UGX) | The selected plan's price, following plan changes until edited; whole number, 100–10,000,000 |
| Transaction ID | Required; normalized live (trim, upper-case, no spaces); `[A-Z0-9.-]`, 4–40 characters |
| Screenshot | Required; "Screenshot of the payment or its SMS"; preview after choosing |
| Checkbox | "18 or older, I accept the Terms" (records `termsVersion`). For an unlocked session whose account already accepted the current version, a one-line notice instead (the version is still recorded). |

- **Paste payment SMS** (`next-js/src/domain/payment-sms.ts`, new, pure, browser-safe):
  - The Paste button calls `navigator.clipboard.readText()` directly in the click handler. It does not call `permissions.query` first, because that throws in Safari and Firefox and can lose the iOS gesture. Any rejection focuses the box.
  - `parsePaymentSms(text, ownerNumbers)` is tolerant. It finds:
    - the UGX amount after send/paid/received wording, never the fee or balance;
    - the ID after labels such as "Transaction ID", "TID" or "Trans ID";
    - the network from MTN/MoMo/Airtel words;
    - a counterparty number.
  - If the counterparty is one of the owner's numbers, that network is chosen. If it is another number, the page warns "This SMS shows money sent to 256 7xx xxx xxx, which is not our number."
  - Unparsed fields stay as they were; a parse never blocks typing.
  - The box has no `name` and sits outside the `<form>`, so the SMS text never leaves the browser.
  - Fixtures are real anonymized messages from the owner (section 12).
- **Draft.** Every change saves the form to `sessionStorage` under the account id, wrapped in try/catch: plan, payer number, network, transaction ID, amount, the pay card used and the checkbox. It never saves the image or the SMS text. The draft is restored on load and cleared on a successful Send or sign-out. A tab that Chrome discards while the subscriber is in Messages or the gallery therefore comes back filled.
- **Browser upload:**
  - Decode with `createImageBitmap` (an `<img>` decode as fallback).
  - Draw to a canvas with width ≤ 1080 px and height ≤ 4096 px, never upscaling.
  - Encode with `toBlob("image/jpeg", 0.75)`. While the file is over 400 KB, step to 0.65 and 0.55, then to width 900 px (never below 700 px).
  - Send with `XMLHttpRequest` and a `FormData` built from exactly the six fields plus the image; it sends `Content-Length`. `xhr.upload.onprogress` shows a percentage.
  - On error or timeout, Retry keeps the fields. After success, call `router.refresh()`.
  - Without JS, step 4 shows "This form needs JavaScript. Send your screenshot on WhatsApp instead" with Call and WhatsApp buttons. The owner then uses a manual code with the ID.
- **Server** (`POST /api/account/payments`, new; `next-js/src/server/members/payments.ts` and `next-js/src/server/images/image-format.ts`, new):
  1. Same-origin, mode not `off`, a valid session, an account not blocked.
  2. Caps before reading the body (5.3). A tripped site-wide ceiling also writes an `uploads_busy` audit event.
  3. Require `Content-Length` ≤ 3.2 MB. Read with `readLimitedBody` under the same cap and a 90 s deadline, and parse the multipart from those bytes. Any field name outside the expected seven returns 400. The file must be ≤ 3 MB.
  4. `imageInputFormat(bytes, { formats: ["jpeg"], maxBytes, minSide: 200, maxSide: 4096, maxPixels: 12_000_000 })` replaces `badgeInputFormat` in `next-js/src/server/images/provider-badge.ts`; the badge call keeps PNG/JPEG, 1 MB and 2048 px. Never trust the client's content type. Store the bytes as received with their SHA-256.
  5. Validate fields: payer number (`normalizePhone`), network with a configured number, transaction ID and its `txnKey`, amount, active plan (snapshot name, days, price), and the checkbox unless the notice rule applies.
  6. If an approved submission has this `txnKey` on either network: 409 "This transaction ID was already used. If you made this payment, WhatsApp us with the ID." Nothing is stored.
  7. One transaction under the account row lock: mark any pending submission of the account `superseded` (`decidedAt = now`, `decidedBy = "system:superseded"`); insert the submission and screenshot; count the stored upload; audit.
- **After submission:**
  - The page shows "Checking your payment. Your code will come by WhatsApp or SMS to 256 772 123 456." and the code box.
  - The help row's WhatsApp text now carries the reference: "I have paid UGX {price} for {plan}. My Goal Hint number: 256 772 123 456. Ref P-{reference}."
  - The status can be checking; approved; or rejected with the reason. Approved shows "Access until …" and, for a session that is not unlocked, "We sent your code to 256 772 123 456".
  - Status shows only to the submitting session and to unlocked sessions of the account.
- **Owner viewing:** `GET /api/admin/payments/[id]/screenshot` (new) needs an owner session and sends `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'`, `Content-Disposition: inline`, `Cross-Origin-Resource-Policy: same-origin`, `X-Robots-Tag: noindex, nofollow`, `Content-Type: image/jpeg`.
- **Approve** (`POST /api/admin/payments/[id]`, pending or superseded): the body holds the final network, transaction ID, amount and plan, prefilled from the claims. One transaction:
  - sets those values and `approvedTxnKey = network:txnKey(ID)`;
  - approves the submission;
  - creates the `AccessCode` (`paymentSubmissionId` set);
  - activates it, so its period starts now or when the current one ends (5.3).

  A unique violation refuses with a link to the earlier submission. The no-store response carries the plain code once and which message to use.
- **Reject:** preset reason (`unreadable`, `amount-mismatch`, `not-received`, `duplicate`, `wrong-number`, `other`), optional text, optional "delete image now", then "Tell them" links. **Reverse:** 5.3.

**Retention and purge.** One members purge (065) applies every rule, each with a test.

| Data | Rule |
| --- | --- |
| Screenshot bytes of approved or reversed submissions | Deleted `screenshotRetentionDays` (default 90) after the decision |
| Same, rejected or superseded | Deleted 7 days after `decidedAt` |
| Same, pending | Never purged |
| `MemberSession` rows | Deleted once `expiresAt` has passed |
| `RateLimitBucket` rows | Deleted a day after both the window and any lock ended |
| Never-paid accounts (no submission, no code) | Deleted 30 days after their last sign-in |
| Payment metadata (including `payerPhone`), codes, audit rows | Kept for accounting until OP-26 sets periods; that purge and its DELETE grant come then |

### 5.5 Prediction gating

**Access resolution.** `next-js/src/server/members/viewer-access.ts` (new) exports `resolveViewerAccess()` for pages (React `cache()`, reads `cookies()`) and `viewerAccessFromRequest(request)` for handlers. Both return `{ tier: "full" | "free", signedIn, mode }`, in this order:
1. Every mode enforces entitlement; `off` closes new paid actions while allowing identity sign-in.
2. A valid owner session → full. It is checked only when the owner cookie is present, with `verify(token, { touch: false })`, so pages and polls never extend the owner's 2 h idle window.
3. An entitled member session → full.
4. `paywallMode` is `test` and no member session → full.
5. Anything else, including any error → free.

**Policy and composition**
- `next-js/src/domain/paywall.ts` (new, pure) is the only place policy lives:
  - `isFreeFixture(status)`;
  - `usesSubscriberFeedOracle(query)`, on the **parsed** query: true when the probability range is not "any", `sort.by` is `probability`, `picks` is `only`, or `odds` is set;
  - `gateFeedResponse`, `gateDetailResponse`, `gateInsights`.
- `next-js/src/server/members/gated-reads.ts` (new) wraps the raw readers (`readPublicMatchFeed`, `readPublicMatchDetail`, `readPublicMatchInsights`, `readPublicSlipBuild`, signatures unchanged). For free viewers it parses the output with the strict wire schema and throws `MatchFeedError("unavailable")` on failure (fail closed).
- `createFeedRoute`, `createMatchDetailRoute`, `createSlipsRoute`, `createMatchFeedHandler`, `createMatchDetailHandler` and `createMatchInsightsHandler` take an injectable raw reader and `resolveAccess`, and always gate. Tests and fixtures inject raw readers only.

**Wire schemas** (`next-js/src/domain/fixture-snapshot.ts`, `match-feed.ts`, `match-detail.ts`, `match-insights.ts`):
- Rename the full cached types (`StoredMatchFeedResponse`, `StoredMatchDetailResponse`, …). The existing exported names become the wire unions, so every consumer fails to compile until it handles gated data. The cache keeps parsing stored schemas; no projection bump.
- `gatedForecastSchema`: `{ gated: true, runId, runSequence?, revisionId, publishedAt, provisional?, updateDelayed?, families }`. `families` is in `publicPolicy.markets` order and counts in the family-total invariant; `prices: []`.
- `gatedDetailSnapshotSchema`: `{ gated: true, revisionId, cycleId, historical, applicability, publishedAt, families }`. The identity invariants in `next-js/src/domain/match-detail.ts:81` apply to both variants; market equality only to the full one. A gated detail omits `odds` and has `history: { gated: true }`.
- Feed, detail and insights responses carry `access: { tier, signedIn }`.
- The gate keys on fixture status only. A gated fixture's `?cycle=` or `?revision=` snapshot is gated even when its current forecast is null (`next-js/src/server/matches/detail-service.ts:45-63` loads them regardless).

**Leak points**

| Leak point | File | Change |
| --- | --- | --- |
| Feed records (all families, prices) | `next-js/src/server/matches/public-feed.ts`, `fixture-read.ts`, `feed-http.ts` | Served through the gated reads |
| Oracle filters and sort | `next-js/src/domain/feed-query.ts`, `next-js/src/server/matches/feed-read.ts`, `feed-error.ts`, `public-http.ts`, `next-js/src/domain/match-feed.ts:59` | `MatchFeedError("subscription-required")` in `matchFeedErrorSchema`; `publicMatchFailure` maps it to 403, non-recoverable |
| Feed page | `next-js/src/app/_components/feed-route.tsx`, `next-js/src/server/matches/feed-page.ts` | 307 to `serializeFeedQuery` with oracle fields reset |
| Detail current, `?revision=`, `?cycle=` | `next-js/src/server/matches/public-detail.ts`, `detail-http.ts` | `gateDetailResponse`, by status |
| Server-rendered history | `next-js/src/app/_components/revision-history.tsx`, `match-detail-content.tsx` | Gated note; only gated data reaches them |
| Insights analysis copies | `next-js/src/server/matches/insights-read.ts:126-133`, `insights-service.ts` | `gateInsights` drops `analysis` news items for free viewers unless the fixture is free |
| Insights preview prop | `next-js/src/app/_components/match-detail-route.tsx` `loadPreview` | Built from gated insights |
| Meta description, OG, Twitter | `next-js/src/server/matches/detail-page.ts` `matchDetailMetadata` | Always `detail.datedMetadataDescription` (or `metadataDescription` without a date); subscriber line only when `on` and not free; stop using `forecastMetadataDescription` and `voidForecastMetadataDescription` |
| Indexability | `next-js/src/domain/discovery.ts:43` `matchPageIndexable` | Count families from either variant |
| Slips | `next-js/src/server/slips/public-slips.ts`, `next-js/src/app/_components/slips-route.tsx` | Free viewers: no read; Get access empty state |
| Card | `next-js/src/components/match/match-card.tsx:703-764`, `next-js/src/domain/match-card.ts` | Gated `shownFamily` = first eligible family in policy order; never `bestCardFamily`; no values in `data-prediction`/`data-outcome`; no tooltip, odds or hidden pick text |
| Detail UI | `next-js/src/components/match/details/verdict.tsx`, `markets-card.tsx`, `analysis-drawer.tsx`; `next-js/src/domain/match-details.ts`, `market-ranking.ts`, `feed-presentation.ts`, `detail-presentation.ts` | Never `featuredFamily`, `bestPublishedFamily` or `noPickReason` on gated data; no values in `data-featured-pick`/`data-verdict`; no counts or pick aria-labels |
| Client fetches | `next-js/src/state/refresh-base.ts:19`, `next-js/src/domain/feed-pagination-error.ts` | `credentials: "same-origin"`; 403 becomes `subscription-required`, which triggers `router.refresh()` |
| Live merge and pagination | `next-js/src/domain/fixture-reconciliation.ts`, `live-refresh.ts`, `feed-pagination.ts:35-60`, `match-card.ts` `sameCardFixture`, `next-js/src/app/_components/feed-surface.tsx:158`, `next-js/src/components/match/live-match-detail.tsx:65`, `next-js/src/state/detail-api.ts` | A different `access.tier` raises `FeedPaginationError("changed")` and `router.refresh()`; provider keys include the tier; `sameCardFixture` compares the variant |
| API headers | `next-js/src/server/matches/public-http.ts` | `privateMatchHeaders` (`private, no-store`, `vary: Cookie`) for feed, detail, insights; `/api/performance` keeps `publicMatchHeaders` |
| Pending prompts 053–056 | `next-js/dev-plan/053-…` to `056-…` | Edited in Phase 0 (section 7) |

### 5.6 Owner dashboard (`/admin`)

Pages live under `next-js/src/app/admin/` (new):
- Each page uses the server gate pattern of `next-js/src/app/analytics/page.tsx` (`connection()`, `cookies()`, `auth.verify()`) and shows the owner login when signed out.
- Client parts use `next-js/src/components/analytics/dashboard/dashboard-styles.tsx`; owner copy is hard-coded English.
- Phone-first: one column, 44 px targets, and a top tab strip with the pending count, which also shows in the document title.
- Actions are JSON POSTs to `/api/admin/*` (new) through the shared guard in `next-js/src/server/admin/admin-http.ts` (new). Each is same-origin checked and audited.
- Phone searches travel in POST bodies; links use `accountId` only.

| Page | Shows | Actions |
| --- | --- | --- |
| Overview `/admin` | Pending count; active subscribers; revenue this EAT week and month (`amountReceivedUgx` of approved, non-reversed submissions of both sources, plus manual-code amounts; never reissue, number-change or trial codes); trials sent this week; Busy alerts; "Payment numbers last changed …" | — |
| Payments | Free-trial requests first, then pending and superseded cards, oldest first, refreshed every 60 s; approved and rejected tabs | Send free trial, Dismiss; Approve (one tap), Reject, Reverse (approved only, with reason) |
| Codes | Status, reference, phone, plan, days left, dates; filter by status; search by phone or reference (with or without `P-`/`C-`) | Revoke, Extend, Reissue, Generate manual code (optional network and transaction ID) |
| Subscribers | Search by phone. Per account: status, codes, submissions, unlocked devices, unlocks in the last 30 days, note | Sign out all devices, Block/Unblock, edit note, Generate code, Change number, Erase personal data |
| Plans | Price, days, active flag, order | Create, edit, deactivate, reorder; never delete |
| Settings | Section 5.7, plus diagnostics of which client-address headers arrive | Save; password re-entry for payment and contact numbers, registered names and menu shortcuts; mode changes need a second tap |
| Audit | Owner actions and sign-ins, newest first; filter by action | — |

**Payment card.** Screenshot (tap to zoom) beside "Subscriber says": payer `256 772 123 456`, network, transaction ID, UGX amount, plan and price, time (EAT), reference. Automatic checks, each a coloured line:

| Check | Shows |
| --- | --- |
| Amount ≥ plan price | Pass, or "UGX 1,500 is below the price" (warning) |
| ID never approved (by `txnKey`, both networks) | Pass, or "Already approved in P-XXXX" (same network: approve is refused; other network: warning) |
| Same ID pending elsewhere | "Also in P-XXXX (another account)" (warning) |
| Identical image | "Same file as P-XXXX" (warning) |
| Payer has an account | "256 7xx… has its own Goal Hint account" (warning) |
| Payer differs from account | "Paid from 256 7xx…, account is 256 7xx…" (info; warning when either check above it fires) |

Below the checks:
- Editable network, transaction ID, amount and plan, prefilled from the claims.
- **"Paste my SMS"** fills them from the owner's received-money SMS with `parsePaymentSms`. It shows "Your SMS says" beside the claims and compares the sender number with the payer number.
- The line "Code goes to 256 7xx xxx xxx (account number)".
- One big button, **"I found this payment in my account"**, and a smaller Reject.

**Code ready panel.** Shown after approve, manual generate, reissue, number change or free trial, built from the POST response only.
- Large code with its reference and a **Copy** button.
- **WhatsApp** and **SMS** buttons built with `waHref` and `smsHref` to the account's number, opened with `target="_blank" rel="noopener noreferrer"`.
- It stays until "Done, sent". Until then the code is kept in that tab's `sessionStorage`, so it survives the tab reloading while the owner is in WhatsApp.
- It warns: "If it is lost, use Reissue; the old code stops working."
- The link origin is `publicPolicy.origin` (`next-js/src/domain/public-policy.ts`) in production and the request's own origin locally.

Messages make no accuracy claims. New code (the account has no unlocked device):

```
Goal Hint code: XXXX-XXXX-XXXX
Tap to unlock: https://goalhint.com/en/account#code=XXXX-XXXX-XXXX
Weekly: access until Sun 1 Nov, 21:00 EAT. Works only on your Goal Hint number ending 456. Keep this message for a new phone.
```

Renewal (the account has an unlocked device):

```
Goal Hint: renewed until Sun 1 Nov, 21:00 EAT. Your unlocked phone updates by itself.
New phone or browser? Code XXXX-XXXX-XXXX, or tap: https://goalhint.com/en/account#code=XXXX-XXXX-XXXX
Works only on your Goal Hint number ending 456.
```

- **Erase personal data:** delete sessions and screenshots; clear notes, `rejectText` and `payerPhone`; set `phone = NULL` and `erasedAt`. Keep amounts, plan snapshots and transaction IDs. Audit.

**Owner auth**
- `next-js/src/server/admin/owner-auth.ts` (new) wraps `getAnalyticsServices().auth` and `requireAdmin`. `admin-http.ts` holds the one guard (owner session, plus same-origin for POSTs). Every `/admin` page and `/api/admin` route except login uses it.
- `createLoginHandler` and `createLogoutHandler` (`analytics-http.ts:161,189`) gain a fixed `home` option and an audit callback; mounted at `/api/admin/login` and `/api/admin/logout` (new).
- `AnalyticsLogin` (`next-js/src/components/analytics/dashboard/analytics-login.tsx:28,33`) takes `action` and `title` ("Owner sign-in" on `/admin`); its small print (line 38) matches the new throttle. Its fields already carry `username` and `current-password` autocomplete, so the phone's password manager fills them.
- In `analytics-auth.ts`, the login throttle locks per (username, IP) and per IP; a username-wide lock applies only after 50 failures an hour. Settings password re-entry uses the same check and throttle without a session. `verify` gains `{ touch: false }`.
- The session keeps the same cookie and the 12 h / 2 h limits (`adminSessionRules`, `analytics-auth.ts:8-10`) unless the owner chooses otherwise (section 12). The analytics TopBar links to `/admin` and back.

**Private exclusion points** cover `/admin`, `/api/admin/*`, `/en/account`, `/en/subscribe`, `/api/account/*`:
- Metadata robots noindex: `next-js/src/app/admin/layout.tsx` (new); account and subscribe use `pageMetadata` (default `index: false`).
- `privateHeaders` (no-store, noindex, DENY, frame-ancestors, `Referrer-Policy: same-origin`): `next-js/next.config.ts` `headers()` adds `/admin`, `/admin/:path*`, `/api/admin/:path*`, `/en/account`, `/en/subscribe`, `/api/account/:path*`.
- Proxy X-Robots-Tag: in `next-js/src/server/seo/proxy.ts:44` the exact `/analytics` check becomes a prefix list. robots.txt (`next-js/src/server/seo/discovery-routes.ts:38`): add `/admin` only, so crawlers can see the member pages' noindex.
- Tracker: `next-js/src/components/analytics/analytics-tracker.tsx:23` also excludes `/admin`. The collector already drops requests carrying the owner cookie (`analytics-http.ts:125`); the member cookie name must not match.

### 5.7 Dashboard-managed settings

| Setting | Type, default | Used by |
| --- | --- | --- |
| Paywall mode | `off` / `test` / `on`, **off** | Access resolution, member routes |
| MTN MoMo and Airtel Money numbers, each with its registered name | Phone digits / ≤ 64 chars, empty | Get access, SMS parser, checks |
| MTN and Airtel menu shortcuts (optional) | `[0-9*#]` and `{amount}`, ≤ 60 chars, empty; a string the owner tested | "Open MoMo menu" / "Open Airtel Money menu" button. Shown only when the render-time user agent is Android and not an in-app WebView (`; wv)`, `FBAN`/`FBAV`, `Instagram`). Uses `tel:` with `#` as `%23`. The text is always shown. Changing a payment number clears its shortcut. |
| Copy format | `international` (`256…`) / `local` (`07…`), **international** | Copy number button only; display stays `256 772 123 456` |
| Contact phone; WhatsApp number | Phone digits, empty | `tel:`, `sms:` and wa.me links; Safety tips |
| Extra payment note | Text ≤ 300 chars, empty | Get access, step 3 |
| Typical review time | Text ≤ 60 chars, empty | Status and Safety tips |
| Max unlocked devices | 1–5, **2** | Unlock |
| Free trial for new numbers | 0–7 days, **2** (0 hides the offer) | Trial offer and trial codes (5.10) |
| Screenshot retention after approval | 7–365 days, **90** | Purge |

- `next-js/src/server/members/settings.ts` (new) caches per process for 30 s. A failed read uses the last good value; with none, access resolves to free.
- `test` or `on` requires an active plan, one payment number with its name, and a contact or WhatsApp number. `on` also requires `privacyNotice.releaseReady` and `termsNotice.releaseReady` (`next-js/src/domain/privacy-notice.ts`, `terms-notice.ts`).
- While `off`, sign-in, code entry and uploads are refused, and both pages say "Subscriptions are not open yet". A network without a number is hidden. No new env keys.

### 5.8 Security and abuse controls

| Threat | Control |
| --- | --- |
| Someone knows a subscriber's number | Not unlocked: no picks, payment status, periods or history. |
| Code guessing | 60-bit salted codes, account-scoped comparison, per-IP throttle, generic error. |
| Code sharing or forwarding | Binding: the code works only with the account's full number, which the message does not contain; device cap with eviction (the payer notices); unlock counts; Reissue plus Sign out all devices. |
| Code link leaks | Fragments never reach a server or the `Referer`. The page clears the fragment at once in every state, with Next's router kept in sync. The proxy adds no `#gh_attr=` on member pages. The tracker records `pathname` only and acts only on `#gh_attr=` (`next-js/src/components/analytics/tracker.ts:63-77`). The collector's `sanitizeTarget` drops fragments (`next-js/src/domain/analytics-classify.ts:180`). The code stays in that browser's history, like the message itself. |
| Fake, edited or reused payments | The owner checks their own wallet and the sender (primary control). (network, `txnKey`) is unique among approved payments, with lookups across networks, and owner-recorded payments share the key. Pending duplicates and identical images are flagged; reversals revoke. |
| A stranger reports the real payer's transaction ID | Uniqueness applies only among approved payments, so the real payer is never blocked. Warnings: "payer has an account", "payer differs" and "same ID pending". The approve button names the receiving number. Owner checklist: approve the account whose number is the sender, else WhatsApp the sender first. Recovery: Reverse (`wrong-account`) and a manual code for the real payer. |
| A stranger submits under a real user's number | New uploads supersede, never block; approve works on superseded items; sessions with a pending or superseded submission are evicted last; per-session and per-IP caps. |
| Junk accounts, upload floods, full disk quota, spoofed IPs | Per-IP ceilings (skipped when the address is unknown; host check in section 10); 10 sessions per account; one pending per account; upload caps per session and per IP; 100 MB site-wide daily ceiling with alert and WhatsApp fallback; 2 in flight; purge rules. |
| Malicious files and form fields | Content-Length, bounded and timed read, exact field-name list, JPEG magic bytes, size/side/pixel limits, client re-encode, sandboxed owner-only serving. |
| Number-change fraud | One audited action with `verifiedBy`; owner checklist: confirm from the old number or by transaction ID, amount and date. |
| CSRF and missing guards | `isSameOrigin` on every POST; Lax member cookie, Strict owner cookie; one admin guard and a structural route-guard test; table-driven 401/403 tests. |
| Stolen owner session or owner lockout | Password re-entry for payment and contact numbers, names and menu shortcuts (the numbers Safety tips vouch for); audit with old and new values; owner sign-in audit; public pages never extend the owner session; throttle keyed by username and IP. |
| Session fixation, cache poisoning, Back after sign-out | Fixation: a new token on unlock, and sign-in deletes the browser's previous member session. Cache poisoning: redaction happens after the cache read, and the cache stores only full bodies. Back: full navigation, no-store pages, `Clear-Site-Data: "cache"` and a `pageshow` reload from the back/forward cache. |
| Codes or phones in logs, analytics or shared phones | Never in URLs, titles or logs on goalhint.com. `data-analytics-ignore` on code, phone, Copy, Paste and owner controls and on `tel:`, wa.me and `sms:` links. `normalizeFreeText` redacts long digit runs. The code field has `autoComplete=off`. The draft lives only in that tab and is cleared on Send and sign-out. Residual: the owner's wa.me link holds the message in its query, so it sits in the owner's browser history. Send from the phone with the WhatsApp app (`next-js/docs/subscriptions.md`). |
| Impersonation and refund scams | Safety tips (section 6); owner checklist in `next-js/docs/subscriptions.md`: send codes only from the listed numbers. |
| Secret dependency | Throttle HMACs use `GOAL_HINT_ANALYTICS_SECRET`; if missing, member features report "unavailable". Code hashes do not use it. |

### 5.9 SEO, caching and analytics

- Crawlers are anonymous and get exactly the free view. There is no user-agent branching: it would be cloaking, and it is trivially spoofed. No paywall structured data.
- Metadata is viewer-independent; `matchPageIndexable` keeps match pages indexable; sitemaps (`next-js/src/server/seo/discovery-read.ts`) unchanged. In past archives, finished, canceled and awarded fixtures are free.
- `/en/subscribe` and `/en/account` are noindex and no-store, out of sitemaps and of `informationPages` (`next-js/src/domain/navigation-paths.ts`). Their titles are fixed ("Get access", "Account").
- Pages are already dynamic (`getShellInstant` awaits `connection()` in `next-js/src/app/_components/public-shell.tsx`). Confirm on the host that HTML is `private, no-store` and that no LiteSpeed cache or CDN stores it. Anonymous GETs set no cookies.
- Fragments: nothing server-side sees them. `createDiscoveryProxy` (`next-js/src/server/seo/proxy.ts:36-43`) puts `#gh_attr=…` on its click-ID redirect, which would replace `#code=…`. For `/en/account` and `/en/subscribe` it still strips the click IDs but sets no fragment, so the browser keeps the original one.
- Analytics (`next-js/src/domain/analytics.ts`):
  - Goals: `subscribe-view` (pageview of `/[locale]/subscribe`), `trial-requested`, `payment-submitted` and `code-entered`, never with values.
  - The last three are custom events named `trial_requested`, `payment_submitted` and `code_entered`. The tracker and the collect schema accept only `^[a-z][a-z0-9_]{0,47}$` (`next-js/src/components/analytics/tracker.ts:273`, `next-js/src/domain/analytics.ts:36`).
  - `routeLabels` for both pages.
  - Document all of this in `next-js/docs/analytics.md`, noting that no-JS code entries are not counted.

### 5.10 Free trial for new numbers

Owner decision (19 October 2026): new subscribers get 2 days (48 hours) free.

- **Who.** An account that has never had a code of any source and has not asked for a trial before. One trial per number, ever.
- **Why a code.** Numbers are not verified, so a trial that started by itself at sign-in would give unlimited free picks to anyone who types new numbers. The trial is a code like every other access. Sending it to the number by WhatsApp or SMS proves the number is real.
- **Request.** An eligible, signed-in account sees "New here? Try 2 days free" above the plans on Get access and on the account page. Tapping it calls `POST /api/account/trial` (same-origin, mode not `off`, account not blocked), which sets `MemberAccount.trialRequestedAt` and shows "We'll send your free code by WhatsApp or SMS to 256 772 123 456." No payment, screenshot or checkbox; assent is recorded at unlock as for manual codes.
- **Owner.** Trial requests sit at the top of Payments as small cards (number, request time, "this IP asked for N trials today"). **Send free trial** creates one `trial` code of `trialDays` days (setting, default 2; 0 hides the offer), amount 0, and opens the code ready panel with the trial message. **Dismiss** sets `trialDismissedAt`. Both are audited (`trial_sent`, `trial_dismissed`) and refused when the account already has a code.
- **Period.** As for every code, it starts when the owner creates it and lasts `trialDays × 24 h`. A plan bought during the trial starts when the trial ends.
- **Limits.** One request per account; 1 per session; 20 per IP a day (CGNAT). Trial codes are never revenue and never count as paid subscribers on Overview, which shows trials sent this week.
- **Message:**

```
Goal Hint free trial code: XXXX-XXXX-XXXX
Tap to unlock: https://goalhint.com/en/account#code=XXXX-XXXX-XXXX
Free trial: access until Tue 21 Oct, 14:30 EAT. Works only on your Goal Hint number ending 456.
```

## 6. Subscriber UI changes

**Routes (new).** `next-js/src/app/[locale]/account/page.tsx` and `next-js/src/app/[locale]/subscribe/page.tsx` are thin; they delegate to `next-js/src/app/_components/account-route.tsx` and `subscribe-route.tsx` (new), wrapped in `PublicShell` (non-app, like `information-shell.tsx`). Server-rendered first, small client islands; no new npm dependencies; no OCR or image libraries.

**Get access page** (`/en/subscribe`), one column, numbered steps, 48 px buttons:

| Step | Shows |
| --- | --- |
| 1 Your number | Signed out: `PhoneInput` (256 prefilled, live "256 772 123 456" preview), Continue (inline sign-in, JSON; plain form post without JS), and "Have a code? Enter it". Signed in: "Signed in as 256 772 123 456 · Sign out"; when active, "Access until {date}. Paying now adds {days} days after that." |
| 2 Choose a plan | Big radio cards: name, days, price (`messages.number(value, { style: "currency", currency: "UGX", maximumFractionDigits: 0 })`). The only or first plan in the owner's order is preselected; every plan gives the same full access. |
| 3 Pay | Per network: "MTN MoMo · 256 772 000 000 · JANE DOE" with Copy number and, where shown, "Open MoMo menu" with the shortcut text; "Send exactly UGX 5,000"; extra payment note. Then one help row: "Need help? Call · WhatsApp". |
| 4 Tell us | The form in 5.4: SMS box, summary line, transaction ID, screenshot, checkbox, Send. Without JS: Call and WhatsApp fallback. |
| After sending | Status line and "Got your code? Enter it here" with Unlock. Rejected: the reason and the form again. |

One collapsed `Disclosure` (`next-js/src/components/ui/disclosure.tsx`), "Safety tips": "Pay only to the numbers on this page, registered to {name}. Codes come only from {WhatsApp number} on WhatsApp or {contact number} by SMS. We never ask for your PIN or ask you to send money back. Checking usually takes {review time}, not guaranteed. Picks are estimates, not guarantees." No confirm dialogs, no reminder opt-in.

**Account page** (`/en/account`), minimal:

| State | Shows |
| --- | --- |
| Mode off | "Subscriptions are not open yet." |
| Signed out | Phone field and code box (prefilled from a `#code` link), Unlock, the one-line 18+/Terms notice; "No code yet? Get access". |
| Signed in, not unlocked | "Signed in as 256 772 123 456", code box and Unlock, the in-app browser hint when relevant, this session's payment status if it submitted one, Get access, Sign out. Nothing else about the account. |
| Code accepted | "Unlocked." and a primary "See today's picks" button (to `/en`; with a `return` path the page goes straight there). |
| Active on this device | "Access until Sun 25 Oct, 21:00 EAT" and "{n} days left", queued periods, a primary **Renew** button (Get access), code box, devices (this one, others with last-used dates; Sign out others), Sign out. |
| Ended | Unlocked sessions only: "Your access ended on …", Renew (Get access), code box, Sign out others. |

**Entry points**
- **Account icon** (new `UserIcon` in `next-js/src/components/ui/icons.tsx`), beside `ThemeToggle` in three places:
  - `HeaderActions` (`public-shell.tsx:78`);
  - `AppBrandBar` (`next-js/src/components/navigation/app-brand-bar.tsx:47`), with both buttons in a flex group;
  - the match `PhoneBar` (`next-js/src/components/match/details/match-details.tsx:55`), as a fourth 2rem column.

  It is labelled "Account" and shown only when the mode is `on`, through a `showAccount` prop from routes that already resolve access. Information pages show no icon and stay free of DB reads. No new tab-bar item.
- **Card pick line:** plain "Pick for subscribers" with a new `SubscriberIcon` (star or key), never a padlock ("Locked prediction"). The tile still opens the match.
- **Feed banner** for free viewers: "Picks are for subscribers · Get access".
- **Verdict gated panel:** "Picks and probabilities for this match are for subscribers. From UGX {price} for {days}.", with a plural-aware day count, using the cheapest active plan ("From UGX 1,000 for 1 day."). It always shows two buttons: "Get access" and "Have a code?" (to `/en/account` with `return` = this match).
- **Markets, Analysis, History drawers:** one plain line each. **Slip builder:** an `EmptyState` with Get access.
- **Feed filters:** probability range, probability sort and picks-only disabled with "Subscribers only" (`next-js/src/components/match/feed-filters.tsx`, `feed-controls.tsx`, sort options at `feed-header.tsx:163`).
- **Controls** in `next-js/src/components/ui/controls.tsx`:
  - `PhoneInput`;
  - `FileInput`: any image the browser can decode, always re-encoded to JPEG, with a preview and a size hint;
  - `SegmentedChoice`: two 3rem buttons (`choice-picker.tsx` is a small dropdown and does not fit);
  - a `size="large"` option on `Button` and `ButtonLink` (3rem, body font) for Get access and the approve button. Phone buttons are 2.25rem today (`theme.control.compactHeight`, `next-js/src/styles/theme.ts:274`).
- **Copy:**
  - New `account.*`, `subscribe.*` and `paywall.*` keys in `next-js/src/i18n/messages/en.ts`, with `{price}`, `{days}`, `{expiresAt}`, `{phone}` and plural `account.daysLeft` and verdict day count.
  - Short sentences. "Subscriber" and "gated", never "locked". References keep their `P-`/`C-` prefix. Phones always as `256 772 123 456`.
  - No accuracy, win-rate, ROI or "sure win" claims anywhere.

## 7. Spec, legal and documentation changes

**Phase 0** (no code, owner approval recorded):
- `app-write-up.md` → **v1.9**:
  - line 5: header;
  - §1 lines 38, 46, 50: move payments, accounts, subscriptions and the admin dashboard out of "Outside scope";
  - §2 lines 67, 69, 75: probability features are for entitled viewers when paid access is on;
  - §3 lines 83–85: the gated card reading order;
  - §12 line 401: server-render probabilities only for entitled viewers or free fixtures; generic metadata;
  - §13 line 438: data minimization with phone accounts;
  - §14 line 491: manual paid access;
  - §15 lines 499, 513: acceptance covers phone sign-in, manual payment, expiry, and no leaks to anonymous viewers or crawlers.
- `next-js/dev-plan/000-index.md`:
  - rewrite the line 41 invariant: phone accounts, sessions, payment reports, access codes and a private owner dashboard; still no betting;
  - amend the 028–031 Gate line (line 110): public reads still work anonymously and resolve viewer access from cookies;
  - add "every prediction-bearing read goes through the gated reads";
  - prompt count (line 5) → 67;
  - add a "057–067 Paid access" section with a Gate line and a Requirement coverage row (payment report fields, code binding, phone format).
- Pending prompts:
  - **056:** Tips is subscriber-only for unfinished fixtures, never a probability-ordered list for free viewers.
  - **055:** Profile ignores subscriber-only defaults for free viewers and reads through the gated reads. Its avatar becomes the account entry. The check reads "anonymous visitors get no cookies".
  - **053/054:** generalize `families` and the four-family invariant to `publicPolicy.markets`. Per-market performance stays aggregate-only.
- `next-js/docs/implementation-decisions.md`: mark as superseded the Settled "Access and product scope" row (line 214) and the no-account/no-paywall statements in the 039–042 entries (e.g. lines 2576, 2597, 2647). New rows:
  - **OP-37:** paid-access scope and the free/paid split. It also removes unfinished-fixture picks from the reuse licence in `terms.use.body`, which reverses the 12 Oct 2026 decision in `next-js/docs/terms-page.md`.
  - **OP-38:** plans, prices, payment numbers, UGX payments to Ugandan wallets, accounts with any country code.
  - **OP-39:** refunds, extensions, reversals, outage compensation, Electronic Transactions Act 2011 duties.
  - **OP-40:** paid launch approval, depending on OP-06, OP-08, OP-17, OP-26, OP-27, OP-31, OP-34, OP-36 (same list as section 12).
- Extend existing rows:
  - OP-06: API-Football commercial use. If paid resale is not allowed, `paywall.ts` treats `api-football` families as free or hidden.
  - OP-26: member data, payer numbers, PDPO registration, retention, cross-border processing including WhatsApp, breach procedure.
  - OP-27: jurisdiction, governing law, tipping licence.
  - OP-31: backups of payment and code records.
  - OP-36: bookmaker prices are subscriber-only.
- `next-js/dev-tracker.md`: rows 057–067 (section 8). `publicPolicy.access` waits for 061.

**With the features** (066):
- `next-js/src/i18n/messages/en.ts`: `metadata.description` (line 24), `privacy.description` (18), `terms.description` (20), `navigation.footerNote` (33, add 18+).
- **Privacy** (`next-js/src/i18n/messages/privacy.ts`, `next-js/src/app/_components/privacy-content.tsx`, `next-js/src/domain/privacy-notice.ts`). The copy must be true whether or not subscriptions are open. It covers:
  - phone-only accounts and the member cookie;
  - what a payment report holds (payer number, transaction ID, amount, screenshot), and that a pasted SMS and the form draft stay in the browser;
  - screenshot handling: owner-only access, DB storage, deletion after N days, copies in backups;
  - throttle records (keyed hashes) and the lawful basis;
  - the hosting country and the WhatsApp/Meta transfer, and copies on the owner's phone;
  - erasure requests;
  - a one-line notice by the phone field and the form.

  Add the notice blockers `payments`, `refunds` and `data-protection` until OP-39 and OP-26 are resolved.
- **Terms** (`next-js/src/i18n/messages/terms.ts`, `terms-content.tsx`, `terms-notice.ts`) cover:
  - plans and prices, and that changes apply only to new purchases;
  - the free trial: once per number, no payment, 2 days from when the owner sends the code;
  - manual approval with no guaranteed turnaround;
  - access from payment confirmation (or the end of the current period) to expiry, in EAT; plans differ only in length;
  - personal use, codes valid only on the paying account, number changes, and the device limit (in-app browsers count);
  - refunds, extensions and compensation;
  - suspension, revocation and blocking;
  - Ugandan law and disputes; operator contact;
  - 18+, no guarantee, responsible gambling;
  - the weak protection of a phone-number login;
  - the narrowed `terms.use.body`.
- **Help** (`next-js/src/i18n/messages/help.ts`, `help-content.tsx`): replace the "free … no account" intro. Add a "Get access" topic: the free trial for new numbers, paste the SMS, tap the code link then Unlock, renewals on an unlocked phone, and open in Chrome if it opens inside Facebook. It must be true in both states.
- `next-js/src/i18n/messages/contact.ts`: one line pointing to Get access. Keep `contactNotice.releaseReady` true, because it gates indexing in `next-js/src/server/seo/policy.ts`. Keep the contact page free of DB reads.
- `next-js/src/domain/public-operator.ts`: keep `audience`; add a `paidAccess` fact ("paying in UGX to our Ugandan MTN or Airtel numbers").
- **Docs:**
  - `next-js/docs/subscriptions.md` (new): model, flows, settings, purge, host checks, breach procedure, and the glossary "gated = subscriber-only; locked = cutoff-locked". Its owner checklist covers the wallet and sender check, the stolen-ID and number-change steps, sending codes only from the listed numbers, and the wa.me history residual.
  - `next-js/docs/database.md`; `next-js/docs/local-database.md` (grants); `next-js/deploy/how-to-deploy.md` (overlay list).
  - `next-js/docs/privacy-page.md`; `next-js/docs/terms-page.md` (41, 48).
  - `next-js/docs/seo-discovery.md` (49–54, 128); `next-js/docs/match-feed-api.md:13`; `next-js/docs/match-detail-api.md` (8–9, 140); `next-js/docs/slip-builder.md:193`.
  - `next-js/docs/analytics.md`, `next-js/docs/help-page.md`, `next-js/docs/contact-page.md`.
  - `next-js/docs/development-progress.md` for each prompt.

## 8. Implementation phases

Phase 0 has no code: do the section 7 Phase 0 items, then create `next-js/dev-plan/057…067` and the tracker rows below. Each prompt follows the `next-js/dev-plan/` format (Feature / Depends on / Source / Prompt / Acceptance checks / Handoff), names its npm commands and updates `next-js/docs/development-progress.md`. Every prompt that adds an `/api/admin` route or `/admin` page extends `next-js/tests/admin-routes.test.mjs`.

Manual checks are recorded in `next-js/docs/development-progress.md`:
- Layout: at 375 px in the Browser pane.
- Throttled checks: in desktop Chrome DevTools (device mode, Slow 3G or a 200 kbit/s custom profile), because the Browser pane cannot throttle.
- Phone-only behaviour (clipboard, file picker, tab discard): on a real Android phone over HTTPS dev (`npx next dev --experimental-https`, with its CA trusted on the phone). `navigator.clipboard` needs a secure context, and plain-http LAN dev through `allowedDevOrigins` (`next-js/next.config.ts:10`) has none. Otherwise, in test mode after an owner-requested deploy.

**057 Owner admin foundation.** After Phase 0.
- Scope: shared private HTTP helpers; owner auth wrapper and the shared admin guard; the structural route-guard test; login `home` option, `AnalyticsLogin` props and small print; throttle keying and `verify({ touch: false })`; `/admin` login and empty shell; `/api/admin/login|logout`; all private exclusion points.
- Files: `next-js/src/server/http/private-http.ts`, `next-js/src/server/admin/owner-auth.ts`, `next-js/src/server/admin/admin-http.ts`, `next-js/src/app/admin/layout.tsx`, `next-js/src/app/admin/page.tsx`, `next-js/src/app/api/admin/login/route.ts`, `next-js/src/app/api/admin/logout/route.ts`, `next-js/tests/admin.test.mjs`, `next-js/tests/admin-routes.test.mjs` (new); `analytics-http.ts`, `analytics-auth.ts`, `analytics-login.tsx`, `next-js/next.config.ts`, `next-js/src/server/seo/proxy.ts`, `discovery-routes.ts`, `analytics-tracker.tsx`, `next-js/tests/discovery.test.mjs:120`, `next-js/package.json` (`test:admin`).
- Checks (`npm run test:analytics`, `npm run test:admin`):
  - sign-in from `/admin` lands on `/admin` under "Owner sign-in";
  - `/analytics` is unchanged apart from its small print;
  - `/admin` is no-store, noindex, DENY, and robots.txt disallows it;
  - failures from one IP do not lock the owner out from another;
  - `verify({ touch: false })` leaves `lastSeenAt` unchanged;
  - the route-guard test passes; no new env keys.

**058 Data model, settings, plans and audit.** Depends on 057.
- Scope:
  - the nine tables: phone `VarChar(15)` digits, submission `source` and claim columns with `claimedTxnKey`, `approvedTxnKey` unique, `AccessCode.replacedById`;
  - migration, overlay with its failing guard, engine test, local grants;
  - `phone.ts`;
  - the settings service: mode, preconditions, menu shortcuts, copy format, password re-entry;
  - plans; the free-trial setting and account columns (5.10); the audit writer and owner sign-in audit; Plans and Settings pages and routes.
- Files: `next-js/prisma/schema.prisma`, `next-js/prisma/schema.snapshot.prisma`, `next-js/prisma/migrations/<stamp>_subscriptions/`, `next-js/prisma/mariadb/<stamp>_subscriptions.sql`, `next-js/tests/subscription_migration_test.py`, `next-js/src/domain/phone.ts`, `next-js/src/server/members/settings.ts`, `next-js/src/server/members/plans.ts`, `next-js/src/server/admin/audit.ts`, `next-js/src/app/admin/plans/`, `next-js/src/app/admin/settings/`, `next-js/src/app/api/admin/plans/route.ts`, `next-js/src/app/api/admin/settings/route.ts`, `next-js/tests/phone.test.mjs`, `next-js/tests/members.test.mjs`, `next-js/tests/members.integration.mjs` (new); `next-js/tests/backup-restore.integration.mjs:68`, `next-js/package.json` (`test:members`).
- Checks (`npm run test:members`, `npm run test:admin`, `npm run check`):
  - `db:deploy`, `db:status`, `db:verify` and the engine test pass;
  - a missing settings row reads `off`;
  - `test` and `on` are refused without their preconditions, and `on` is refused until privacy and terms are release-ready;
  - settings numbers are stored as canonical digits;
  - eight fields are protected: MTN and Airtel numbers, both registered names, both menu shortcuts, contact phone and WhatsApp number. Changing any of them needs the password, is throttled, and is audited with old and new values;
  - a number change clears its menu shortcut;
  - plans are never deleted.

**059 Phone sign-in and member sessions.** Depends on 058.
- Scope: `PhoneInput` with live preview (no confirm step), the sign-in upsert, sessions and eviction order, cookie, throttles, sign-out, devices, the mode-off refusal, the in-app browser hint, the signed-out and signed-in account states.
- Files: `next-js/src/server/members/member-sessions.ts`, `rate-limit.ts`, `member-http.ts`, `next-js/src/app/api/account/sign-in/route.ts`, `sign-out/route.ts`, `devices/route.ts`, `next-js/src/app/[locale]/account/page.tsx`, `next-js/src/app/_components/account-route.tsx` (new); `controls.tsx`.
- Checks (`npm run test:members`):
  - every input in the section 9 table normalizes or is refused as listed, including inputs typed after the `256` prefill;
  - cookie flags: HttpOnly and Lax; Secure and `__Host-` in production;
  - a cross-site POST gets 403, and anonymous GETs set no cookie;
  - on real MySQL, two concurrent first sign-ins of one number both succeed, as do two concurrent first throttle hits;
  - `unknown` addresses skip per-IP limits;
  - a sign-in flood evicts sessions with a pending or superseded submission last;
  - the collector still counts member visitors;
  - devices refuses a not-unlocked session and accepts an unlocked one whose period ended.

**060 Access codes, periods and access resolution.** Depends on 059.
- Scope:
  - code format, extraction and `codeFromFragment`; salted hashing and reference;
  - periods that start at payment confirmation, queueing, unlock with recorded assent (no checkbox), token rotation, device cap; entitlement;
  - `resolveViewerAccess` with the mode and owner preview;
  - the activate, revoke, extend, reissue, reverse, manual-code, change-number and free-trial services;
  - the signed-out phone-plus-code path;
  - the `#code` link: deferred `replaceState(null, …)`, full navigation after Unlock, focus rules, Copy code in in-app browsers;
  - the proxy's fragment exception; the code-accepted state; status visibility.
- Files: `next-js/src/domain/access-code.ts`, `next-js/src/domain/subscription-period.ts`, `next-js/src/server/members/access-codes.ts`, `next-js/src/server/members/viewer-access.ts`, `next-js/src/app/api/account/code/route.ts` (new); `account-route.tsx`, `next-js/src/server/seo/proxy.ts`, `next-js/tests/discovery.test.mjs`, `next-js/src/components/analytics/tracker.ts` (line 76, same `replaceState` fix for `#gh_attr=`).
- Checks (`npm run test:members`, `npm run test:seo`):
  - Periods: a code's period starts when it is created (approval or owner creation), never at unlock; two codes created concurrently for one account chain without overlap; a queued period starts at the previous end; a code entered late unlocks only the remaining time; unlock records `termsVersion` on a code without one.
  - Unlock: a device unlocked once stays entitled across renewals; the cap evicts the oldest unlock; unlock issues a new token; a correct code works while the IP bucket is locked; expiry flips without a job.
  - Reissue: the new code has `paymentSubmissionId = NULL` and takes over the sessions, and the old code's `replacedById` points to it.
  - Reverse: it revokes the live code at the end of the chain, including a number-change code.
  - Change number: 3 days 5 h active plus a queued 7-day code become one 11-day code. Old-account sessions lose entitlement, and no code is created on the old account.
  - Binding: another account's code is "not recognized", whether signed in or through phone-plus-code. Phone-plus-code then creates no account or session.
  - A number-only session is never entitled and sees no status; test mode gates only member sessions.
  - `/en/account?fbclid=x` gets a 308 whose `Location` has no fragment; the code input renders `autocomplete="off"`.
  - Manual: the `#code` link prefills, never auto-submits, and works signed out with only the phone typed. After Unlock (or a `router.refresh()`), `location.hash` is empty and `history.state.__PRIVATE_NEXTJS_INTERNALS_TREE` still exists.

**061 Server-side prediction gating.** Depends on 060.
- Scope: `paywall.ts`, the gated reads, wire schemas and type renames; injectable `resolveAccess` in the six factories; oracle refusal end to end, generic metadata, indexability, headers and `credentials`; a minimal neutral render in every consumer the compiler flags; `publicPolicy.access = "free-with-subscriber-predictions"`; the paywall rendering fixture and scan.
- Files:
  - section 5.5, plus `next-js/src/server/members/gated-reads.ts`, `next-js/tests/paywall.test.mjs`, `next-js/scripts/verify-paywall-rendering.py` and `next-js/tests/helpers/rendering/paywall/` (new);
  - `next-js/src/domain/public-policy.ts`, `next-js/scripts/verify-seo-rendering.py:136-141`;
  - the tests that inject readers or assert headers: `device-feed-query`, `discovery` (176–195), `discovery.integration`, `feed-page`, `feed-page.integration`, `match-detail-metadata`, `match-detail-page`, `match-detail`, `match-detail.integration`, `match-feed`, `match-feed.integration`, `match-insights`, `revision-history-page`, `slip-service`, `detail-state` (47), `live-client-refresh` (108);
  - fixture pages under `next-js/tests/helpers/rendering/{seo,match-feed-detail,slips,match-feed,match-feed-live,match-card,client-state}`, with `verify-match-feed-rendering.py`, `verify-match-card-rendering.py` and `verify-client-state-rendering.py`;
  - `next-js/package.json` (`test:paywall`, `test:paywall:rendering`).
- Checks (`npm test`, `npm run typecheck`, `npm run test:paywall`, `npm run test:paywall:rendering`, `test:card:rendering`, `test:state:rendering`, `test:feed-page:rendering`, `test:live-client:rendering`, `test:detail-page:rendering`, `test:history-page:rendering`, `test:seo:rendering`, `test:slips:rendering`):
  - mode `off` equals today apart from `access` and the generic metadata;
  - with mode `on`, viewers (a), (b) and (d)–(g) of section 9 get no pick, probability, reason, alternative, price or analysis item for unfinished fixtures in any page, RSC or API response;
  - free fixtures are unchanged, and one cache entry serves both tiers;
  - match pages stay indexable;
  - oracle queries get 307 or 403 JSON (not 500);
  - no prediction-content assertion is weakened.

**062 Gated UI, transitions and entry points.** Depends on 061.
- Scope: the designed gated card, verdict (with "Have a code?"), markets, analysis, history, slips, filters and feed banner; account icons; `Button size="large"` and `SegmentedChoice`; tier-aware pagination, polling and insights.
- Files: section 6 entry points; `match-card.tsx`, `verdict.tsx`, `markets-card.tsx`, `analysis-drawer.tsx`, `revision-history.tsx`, `next-js/src/components/slips/slip-builder.tsx`, `slip-table.tsx`, `feed-filters.tsx`, `feed-header.tsx`, `feed-surface.tsx`, `live-match-detail.tsx`, `feed-pagination.ts`, `fixture-reconciliation.ts`, `live-refresh.ts`, `match-card.ts`, `match-details.ts`, `feed-presentation.ts`, `detail-presentation.ts`, `controls.tsx`, `icons.tsx`, `en.ts`.
- Checks (`npm test`, `npm run typecheck`, `npm run test:card`, `npm run test:live-client`, `npm run test:state`, `npm run test:card:rendering`, `npm run test:paywall:rendering`):
  - Unit: a tier change yields the refresh signal; `sameCardFixture` is false when only the variant changes; gated card props carry no pick attributes; tier-mismatched pages throw `changed`.
  - Rendering scan: no probability-ranked `data-market`, no `data-featured-pick` or `data-verdict` values, and a banner that links to `/en/subscribe`.
  - Manual: the card stays ~75 px at 320–375 px and the tile opens the match; unlock reveals picks; expiry hides them on the next poll; Back after sign-out shows no picks; from an active device, Account → Renew reaches the plan step in 2 taps.

**063 Get access page and payment submissions.** Depends on 058–060 (the code box uses code entry).
- Scope:
  - the single Get access page: inline sign-in, "Have a code?", the free-trial offer and `POST /api/account/trial` (5.10), plan cards with preselection, pay cards with Copy (copy format), the Android-only menu button and the help row;
  - the form with SMS box, summary line and draft; status and code box; Safety tips; the no-JS fallback;
  - `parsePaymentSms`; browser downscale and XHR upload;
  - the upload endpoint with caps, Busy ceiling, field whitelist, transaction-ID rules, supersede and assent.
- Files: `next-js/src/app/[locale]/subscribe/page.tsx`, `next-js/src/app/_components/subscribe-route.tsx`, `next-js/src/app/api/account/payments/route.ts`, `next-js/src/server/members/payments.ts`, `next-js/src/server/images/image-format.ts`, `next-js/src/domain/payment-sms.ts`, `next-js/tests/fixtures/payment-sms/`, `next-js/tests/payment-sms.test.mjs`, `next-js/tests/payments.test.mjs`, `next-js/tests/payments.integration.mjs` (new); `provider-badge.ts`, `controls.tsx`, `next-js/package.json` (`test:payments`).
- Checks (`npm run test:payments`):
  - SMS parsing: every owner-provided fixture parses to the expected ID, amount and network; fee and balance amounts are never taken; a foreign recipient warns; garbage leaves fields untouched.
  - Rejected uploads: oversize, chunked oversize, slow, PNG, WebP, wrong-magic-byte and huge-dimension files, and a request with an extra field such as `sms`. Badges keep their limits.
  - Transaction IDs: an ID approved on either network, with or without punctuation, is refused and stores nothing. An ID pending in another account is accepted.
  - A second upload supersedes under concurrency and sets `decidedAt`.
  - Caps: per-session (stored and attempts), per-IP and site-wide caps hold. A timed-out attempt leaves the 3 stored uploads intact. Busy writes `uploads_busy`.
  - Snapshot prices survive plan edits.
  - Assent is recorded, and an unlocked renewal with current assent needs no checkbox.
  - Another session sees no status.
  - Manual checks:
    - the page is usable before the form hydrates;
    - a 1080×2400 screenshot re-encodes to ≤ 400 KB and uploads within 90 s at 200 kbit/s, with a percentage shown;
    - a 1080×6000 capture stays ≥ 700 px wide;
    - after Copy number, a trip to Messages and a forced tab discard (`chrome://discards`, or Android "Don't keep activities"), the fields come back;
    - the SMS box works by long-press in Chrome Android and the Facebook in-app browser, with no permission prompt;
    - the menu button is absent on iOS and in in-app browsers;
    - no new npm dependency was added.
  - If owner SMS samples are missing, the parser ships against documented labels and the fixtures become a 067 blocker.

**064 Owner payments queue and codes.** Depends on 060 and 063.
- Scope:
  - the Payments page: cards, automatic checks, Paste my SMS, editable values, the receiving-number line, one-tap approve that starts the period, reject, and reverse with reason;
  - the Codes page and the screenshot route;
  - the code ready panel with both messages and `sessionStorage`;
  - manual codes with a day count, or with network and ID (owner payment);
  - free-trial cards with Send free trial and Dismiss, and the trial message (5.10);
  - revoke, extend and reissue.
- Files: `next-js/src/app/admin/payments/`, `next-js/src/app/admin/codes/`, `next-js/src/app/api/admin/payments/[id]/route.ts`, `next-js/src/app/api/admin/payments/[id]/screenshot/route.ts`, `next-js/src/app/api/admin/codes/route.ts` (new); `next-js/tests/admin-routes.test.mjs`.
- Checks (`npm run test:admin`, `npm run test:payments`):
  - The screenshot route is 401 without an owner session and sends the sandbox headers.
  - Each automatic check fires on its fixture, and "payer differs" turns to a warning with either companion check.
  - Exactly one approval results from each race: two concurrent approvals of different submissions with one (network, `txnKey`); a dotted and an undotted ID; a manual code with ID X racing a form approval of X.
  - After a manual code with ID X, a form submission of X gets 409.
  - Edited values are the ones stored.
  - A renewal approved for an account with an unlocked device keeps picks across the period boundary with no code entry, and uses the renewal message.
  - The code is returned once and never again.
  - Decoding the wa.me `text` and the sms body returns the full message, including `#code=`, `&` and line breaks.
  - The message shows the masked number and never all 12 digits; the link origin is the environment's site origin.
  - The stolen-ID flow counts revenue once and keeps the ID unapprovable: a stranger's approval, the real payer's 409, Reverse `wrong-account`, then a manual code for the payer.
  - Codes keep their plan snapshot; every action is audited; the guard test covers every new route and page.
  - Manual: the panel survives tapping WhatsApp, a tab reload and returning; pages work at 375 px.

**065 Overview, subscribers, audit and purge.** Depends on 064.
- Scope:
  - Overview cards (Busy alert, trials sent; revenue never counts trial codes);
  - Subscribers (search, history, sign out, block, Change number with `verifiedBy`, erase) and its routes;
  - the Audit page;
  - the members purge for every 5.4 rule, inside the worker's maintenance loop (`next-js/src/server/live/live-runner.ts`, cron `next-js/scripts/cpanel-worker.sh`). It is claimed hourly through `lastMembersPurgeAt` with a conditional UPDATE and runs in batches of 100. Admin page loads and `npm run members:purge` are backup triggers.
- Files: `next-js/src/app/admin/subscribers/`, `next-js/src/app/admin/audit/`, `next-js/src/app/api/admin/subscribers/route.ts`, `next-js/src/app/api/admin/subscribers/[id]/route.ts`, `next-js/src/server/members/purge.ts`, `next-js/src/workers/members.ts` (new); `live-runner.ts`, `next-js/tests/admin-routes.test.mjs`, `next-js/package.json`.
- Checks (`npm run test:admin`, `npm run test:members`):
  - revenue sums approved, non-reversed amounts of both sources plus manual amounts by EAT week and month, never reissue or number-change codes;
  - unlock counts match `device_unlocked` rows; block signs out every device;
  - Change number requires `verifiedBy`, writes one audit row per revoke plus one for the new code, and opens the panel for the new number;
  - a structural test in `next-js/tests/admin-routes.test.mjs` finds no code path that updates `accountId` on `AccessCode`, `PaymentSubmission` or `MemberSession` after insert;
  - erase clears phone, payer numbers, sessions and images but keeps amounts and IDs;
  - each purge rule has an injected-clock test; pending images are never purged; superseded images purge 7 days after supersede;
  - the purge is idempotent, and two concurrent runs purge once;
  - the guard test covers every new route and page.

**066 Legal, help, policy copy and analytics.** Depends on 062 and 063.
- Scope: section 7 copy; analytics goals, event names and route labels; docs; rendering scripts that assert the old copy.
- Files: section 7; `next-js/src/domain/analytics.ts`; `next-js/scripts/verify-terms-rendering.py`, `verify-privacy-rendering.py`, `verify-contact-rendering.py`, `verify-navigation-rendering.py:67-68`, `next-js/scripts/lib/policy_rendering.py`.
- Checks (`npm test`, `npm run test:privacy:html`, `npm run test:terms:html`, `npm run test:contact:html`, `npm run test:navigation:html`):
  - no "free, account-free" or "no payments" statements remain;
  - the copy is true with the mode off and on, and makes no accuracy or win-rate claims;
  - terms and privacy carry review dates and the new blockers;
  - every custom goal's event name matches the tracker pattern;
  - `verify-navigation-rendering.py:67-68` still forbids sign-in actions on the pages it checks, so no sign-in form (`action="/api/account/sign-in"`) appears outside `/en/account` and `/en/subscribe`;
  - the account icon (`href="/en/account"`, "Account") passes that check and appears only when `on`.

**067 Launch readiness.** Depends on 057–066.
- Scope: host-check runbook and switch-on checklist in `next-js/docs/subscriptions.md`; read-only production checks.
- Files: `next-js/scripts/verify-production-paywall.py` (new); `next-js/scripts/verify-production-seo.py` (lines 46–47, plus noindex and no-store checks for `/admin`, `/en/account`, `/en/subscribe`, and the robots `/admin` rule).
- Checks: `npm run check` and every `test:*` above pass; real SMS fixtures for both networks are in `next-js/tests/fixtures/payment-sms/`; the copy format, menu shortcuts and prefix table match the owner's tests; the checklist is complete apart from owner items.

**dev-tracker rows to add**

```
| ☐ | [057-owner-admin-foundation.md](../next-js/dev-plan/057-owner-admin-foundation.md) |
| ☐ | [058-subscription-data-model.md](../next-js/dev-plan/058-subscription-data-model.md) |
| ☐ | [059-phone-sign-in.md](../next-js/dev-plan/059-phone-sign-in.md) |
| ☐ | [060-access-codes-periods.md](../next-js/dev-plan/060-access-codes-periods.md) |
| ☐ | [061-prediction-gating-server.md](../next-js/dev-plan/061-prediction-gating-server.md) |
| ☐ | [062-gated-ui-entry-points.md](../next-js/dev-plan/062-gated-ui-entry-points.md) |
| ☐ | [063-get-access-payments.md](../next-js/dev-plan/063-get-access-payments.md) |
| ☐ | [064-admin-payments-codes.md](../next-js/dev-plan/064-admin-payments-codes.md) |
| ☐ | [065-admin-subscribers-audit.md](../next-js/dev-plan/065-admin-subscribers-audit.md) |
| ☐ | [066-paywall-legal-copy.md](../next-js/dev-plan/066-paywall-legal-copy.md) |
| ☐ | [067-paywall-launch-readiness.md](../next-js/dev-plan/067-paywall-launch-readiness.md) |
```

## 9. Testing and verification

**Unit tests** (`node --conditions=react-server --test`, deterministic clocks, injected services, as in `next-js/tests/analytics.test.mjs`):
- `phone`: the table below; `formatPhone`, `maskPhone`, `localUgandaPhone`; `telHref`; `networkForPrefix`. `waHref` and `smsHref` round-trip a message with `#code=`, `&` and line breaks (`new URL(waHref(p, m)).searchParams.get("text") === m`).
- `payment-sms`: every fixture; fee and balance never taken; unknown text changes nothing.
- `access-code`: extraction from the whole message (including the link line), `codeFromFragment` (accepts only `#code=` + valid code), salted hashing.
- `subscription-period`: chaining, revoke, extend, reissue, `remainingDays` rounding, EAT display.
- `paywall`: walk every gate output; no premium key or value for gated fixtures; a full record passed off as gated fails the wire parse.
- `member-http`, `admin-http`: CSRF, cookie flags, size limits, field-name whitelist, JPEG-only magic bytes, fixed redirects, 401/403, 403 JSON for `subscription-required`; `txnKey` (punctuation and spacing variants map to one key).
- `analytics`: every custom goal's event name matches `^[a-z][a-z0-9_]{0,47}$`.

| Field content (typed after the `256` prefill, or pasted over it) | Result |
| --- | --- |
| `0772123456`, `772123456`, `+256772123456`, `00256772123456`, `256 772-123 456`, `2560772123456`, `256256772123456`, `256+256772123456`, `25600256772123456`, `256 0772 123 456` | `256772123456` |
| `254712345678`, `256+254712345678`, `25600254712345678` | `254712345678` |
| `256254712345678` | refused, hint "For a number outside Uganda, delete 256 …" |
| `25677212345` (short), `256672123456` (not 2567), `0201234567`, `012345678901` | refused |

**Route guards** (`next-js/tests/admin-routes.test.mjs`, from 057, in the style of `next-js/tests/boundaries.test.mjs`):
- Every `next-js/src/app/api/admin/**/route.ts` and `next-js/src/app/admin/**/page.tsx` except login uses the shared guard.
- Every `/api/admin` route and `POST /api/account/devices` give 401/403 to no session, a cross-site request or a not-unlocked member session.
- `POST /api/account/sign-in`, `/code` and `/payments` accept a not-unlocked session, but refuse cross-site requests (403) and mode `off`. Code and payments give a blocked account the generic refusal.
- No code path rewrites `accountId` after insert (065).

**Integration tests** run on an isolated MySQL 8.4 (`next-js/tests/members.integration.mjs`, `next-js/tests/payments.integration.mjs`). They cover:
- periods chained by concurrent approvals; concurrent first sign-ins and throttle upserts; supersede under concurrency;
- approved-key uniqueness under concurrent approvals, across punctuation variants and between owner-recorded and reported payments;
- pending duplicates accepted, and approved IDs refused at submission on either network;
- the stolen-ID flow; periods that start at approval, with an unlocked device renewed without code entry;
- code binding: another account's code fails, and phone-plus-code with the wrong number creates nothing;
- Change number: days, entitlement, and Reverse through the chain;
- the device cap;
- one free trial per number, refused once the account has any code;
- `resolveViewerAccess` and `viewerAccessFromRequest` against real sessions and codes;
- the purge.

**Static check:** `next-js/tests/subscription_migration_test.py`.

**Leak scan** (`next-js/scripts/verify-paywall-rendering.py`, new). The fixture `next-js/tests/helpers/rendering/paywall/` injects raw scenario readers and a fake access resolver keyed by a test-only header, and mounts the real API handler factories.
- Sentinels: probability 0.6173 (shown as "62%" and "61.73"), reason `SENTINEL-REASON-7Q`, uncertainty `SENTINEL-RISK-4K`, a unique selection.
- Fixtures: scheduled; live; postponed with a void cycle; scheduled with a null forecast plus a prior cycle carrying sentinels; finished; canceled.
- Viewers: (a) anonymous; (b) signed in, not unlocked; (c) entitled; (d) unlocked, period expired; (e) unlocked with a revoked code; (f) blocked account; (g) evicted device.
- Fetch:
  - every page's **raw** HTML, not `visible_html()` from `next-js/scripts/lib/rendering.py`, which strips RSC flight scripts;
  - the same URLs with `RSC: 1`;
  - `/api/matches`, and `/api/matches/{id}` with and without `?revision=` and `?cycle=`;
  - the match page with `?cycle=`;
  - `/api/matches/{id}/insights?section=news` and `/en/slips?build=1`;
  - `<head>` metadata, JSON-LD, `data-*` attributes and `aria-label`s.
- Assert:
  - (a), (b) and (d)–(g) contain no sentinel, no subscriber-only value and no probability-derived `data-market` or `data-featured-pick`;
  - oracle keys get 307 or 403;
  - (c) contains the sentinels, and free-fixture sentinels appear for everyone;
  - anonymous responses have no `Set-Cookie`;
  - `/admin`, `/en/account` and `/en/subscribe` are no-store and noindex.
- With the mode `off`, existing rendering checks pass except for the generic metadata.

**Manual test** (local; 375 px; throttled and phone checks as in section 8; three browsers or profiles as three devices):
1. Open Get access signed out; type `0772…` after the `256` and see `256 772 …`; Continue; check the preselected plan; paste a sample SMS into the box; add a screenshot; Send.
2. On `/admin`, check the card's automatic checks, paste an owner SMS, tap "I found this payment", send the code by WhatsApp.
3. Tap the link on device 1 (signed in) and Unlock; on device 2 (signed out) type only the number and Unlock; device 3 evicts device 1.
4. Open the link while signed in as another number: "Code not recognized".
5. Renew from device 2 and approve: device 2 stays entitled past the old end with no code entry. Check expiry with a 1-day plan, Revoke, or `UPDATE AccessCode SET endsAt = NOW(3) + INTERVAL 1 MINUTE …`.
6. Change number on `/admin`; the new number unlocks; device 2 loses access.
7. Sign out and press Back. With analytics allowed, confirm the collected pageview path has no fragment.

The running app has no test clock; exact timing is covered by injected-clock tests.

## 10. Rollout and host checks

1. Build and verify everything locally. The mode stays `off`.
2. **No production deploy unless the owner explicitly asks.** When asked, continue with the steps below.
3. Take a private MariaDB backup, record its checksum, and verify a restore to a separate target (`next-js/deploy/how-to-deploy.md`, step 2).
4. Run the overlay's engine pre-check by hand. Apply the reviewed overlay **before** the release that reads the new tables, then confirm InnoDB and the FKs. A missing settings table fails closed and hides picks for everyone.
5. Host checks, read-only first:
   - `curl -I` on `/en` and a match page: expect `private, no-store` and no `x-litespeed-cache` or CDN cache headers;
   - `SHOW VARIABLES LIKE 'max_allowed_packet'` (≥ 8 MB) and `'innodb_log_file_size'` (> 10× 3 MB);
   - after deploy, the Settings diagnostics show which header carries the client address and whether a forged `X-Forwarded-For` passes; record the trusted entry in `next-js/docs/subscriptions.md`;
   - a 3 MB upload passes the LiteSpeed/Passenger body limit (if not, lower the cap), and a slow upload survives 90 s;
   - owner login from the owner's phone.
6. Deploy the app and the worker (`next-js/scripts/deploy-worker-cpanel.py`; the worker's DB account needs DELETE on the purged tables) with the mode `off`. Visitors see no change except that match descriptions no longer quote the pick.
7. The owner enters plans, numbers, names, menu shortcuts and the copy format, and switches to `test`. In a browser without the owner session, the owner opens goalhint.com/en/account directly (the icon is hidden in test mode). They sign in with their own number and send a real small payment from another phone, or create a manual code. On a phone they check gated → unlocked, including the code link, a renewal and the phone-only checks of 063.
8. Switch-on gate: OP-40 approved; privacy and terms release-ready and effective; section 12 legal items confirmed. Then:
   - switch to `on`;
   - run `next-js/scripts/verify-production-paywall.py`: cookie-less GETs to `/en`, an upcoming match, `/api/matches` and insights news must show no pick, probability or analysis for unfinished fixtures, no `Set-Cookie`, and `private, no-store`;
   - if it fails, switch back to `off`;
   - watch the queue, Busy alerts and errors for the first week.
9. **Rollback:** switch to `off` (effective within 30 s). A code rollback to a release before 061 removes the gate while periods run and restores the old copy, so prefer a forward fix and extend affected codes. No env keys were added, so older releases still start.

## 11. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| A leak path is missed (new component, future Tips or My Picks) | One gated-read module factories cannot skip; wire types force gated handling; strict wire parse for free viewers; leak scan from 061; production check at switch-on; 000-index invariant. |
| Phone-number login is weak | Codes are the secret; binding; device unlock and cap; neutral pages; disclosed in the terms. |
| Fake payments, false claims or a stolen transaction ID | The owner checks their own wallet and the sender; approved-key uniqueness across punctuation and networks; pending-duplicate, image and payer-account warnings; Reverse with reason and a manual code for the real payer. |
| SMS formats differ or change | Tolerant parser built from real samples; a failed parse changes nothing; manual entry always works. |
| Typing mistakes (network, ID, number) or lost codes | Prefills, paste and the live phone preview reduce typing. The owner corrects values before approving, and uniqueness applies to the final values. The approve button names the receiving number. The panel survives reloads. Reissue; one-step Change number. |
| A renewal is paid but never entered, or a code is entered late | Every period starts at approval, so an unlocked device renews by itself. Days run from confirmation (owner decision), so the owner sends codes promptly, the message states the end time, and Extend compensates a slow delivery. |
| Code link loses `#code`, opens in an in-app browser that uses up the device cap, or stays in browser history | The proxy keeps the fragment; the message also shows the code; "Open in Chrome or Safari" with Copy code on the account page and in Help; binding and the device cap limit misuse. |
| Copy-number or menu-shortcut formats do not work in the network menus | Owner tests both before switch-on (section 12); copy format setting; the menu button is optional and Android-only; the number is always shown. |
| Live polling keeps old picks after expiry, or hides them after unlock | Tier in every response; refresh on change; tier-keyed providers and pagination checks. |
| A settings read failure hides picks site-wide | Last-good cache; overlay applied before deploy. |
| Junk floods without bulk reject | One pending per account; upload caps per session and per IP; a 100 MB daily ceiling with alert and WhatsApp fallback; 7-day purge of rejected and superseded images. Bulk tools can come later if needed. |
| Screenshots and payer numbers are personal data | Client re-encode drops EXIF; owner-only sandboxed route; purge after 90 or 7 days; erase clears payer numbers; privacy notice. Backups keep copies until they expire. |
| Slow 3G and cheap phones that drop background tabs | Server-rendered steps, small client islands and no new dependencies. Uploads of ~400 KB with progress, a 90 s read deadline, Retry that keeps the fields, and only stored uploads counting toward the daily allowance. A `sessionStorage` draft, and the panel keeps the code until "Done, sent". |
| Host limits unknown (body size, packet, redo log, forwarded IP) | Browser downscale; 3 MB cap; host checks before switch-on. |
| Many tests and copy assume free, anonymous predictions | Injectable resolver; listed test and fixture updates in 061; copy updates in 066. |
| Thin content hurts SEO | Factual insights, live scores and finished results stay free and indexable. |
| Legal exposure (data protection, tipping rules, provider terms, consumer law) | OP rows; switch-on gate; owner confirmations. |
| Per-request DB cost on shared MariaDB (20 s polls) | One indexed query per request, React `cache()`, 30 s settings cache, daily session touch. |

## 12. Owner inputs still needed

None of these block building. Items marked † block switching the paywall on.

- Approval of spec v1.9 and of this plan, and the date to switch the paywall on.
- Confirm the security model:
  - a number alone never shows picks;
  - each new phone or browser needs the code once;
  - a code works only on the number that paid;
  - a renewal from an unlocked phone starts by itself.

  Also confirm that accounts may use any country code, while payments go to your Ugandan numbers in UGX.
- Confirm the free/paid split: finished, canceled and awarded matches (picks, Win/Loss, analysis), factual insights and performance stay free; everything else for unfinished fixtures is for subscribers.
- MTN MoMo number: `256783230321` (received 19 October 2026). Still needed: its registered name. An Airtel Money number and name only if you want Airtel offered; until then the Airtel card is hidden.
- Contact (calls) and WhatsApp number: `256783230321` for both (received 19 October 2026). The Safety tips will say codes come only from this number.
- The typical review time, and any extra payment note.
- Free trial: confirmed 19 October 2026, 2 days (48 hours) for a new number, once, sent by the owner as a code (5.10).
- Plans and prices: confirmed 19 October 2026. Daily, 24 hours from activation, UGX 1,000; Weekly, 7 days, UGX 5,000; Monthly, 30 days, UGX 20,000. All give full access to every feature; access runs from payment confirmation to expiry.
- † **Real anonymized SMS samples**, at least three per network: the payer's "you have sent" message for MTN MoMo and Airtel Money, and your own "you have received" message. Replace names and digits but keep the layout, labels and punctuation exactly.
- **Screenshot samples** (anonymized) from the MoMo and Airtel apps and SMS, for testing the form.
- † **Network menu tests:**
  - whether the MoMo and Airtel send-money menus accept a pasted `256…` number or need `07…` (this sets the copy format);
  - the menu shortcuts (USSD strings) you want shown, tested on your phone, with where the amount goes;
  - the number prefixes of each network, written in full (for example MTN 25676, 25677, 25678; Airtel 25670, 25674, 25675), used to pre-pick the network.
- † Refund, extension, reversal and outage policy, including what you do when a payment was approved for the wrong account.
- Confirm the defaults: 2 devices (an in-app browser counts as one), 90-day screenshot retention. Set retention for payment records, payer numbers and audit rows (for example, the tax-record period).
- **Owner sign-in length on your phone.** Choose one:
  - keep today's 2-hour idle limit: you will sign in again before most approvals, and your phone's password manager fills it in;
  - use a longer `/admin` session, for example 7 days idle and 30 days maximum. This also applies to `/analytics`, which shares the login.

  Password re-entry for numbers and names stays either way.
- † A production backup schedule and retention that cover the new tables.
- † Decisions on the open items OP-40 depends on: OP-06 (API-Football rights), OP-08 (source retention), OP-17 (performance claims), OP-26 (data retention), OP-27 (operator identity and jurisdiction), OP-31 (backups), OP-34 (release signoff), OP-36 (odds).
- † Legal confirmations:
  - PDPO registration under the Data Protection and Privacy Act 2019, the basis for cross-border transfer (hosting country, WhatsApp) and a breach procedure;
  - whether selling football tips needs a licence under Ugandan gaming rules;
  - API-Football's terms for paid access to its fallback predictions;
  - Electronic Transactions Act 2011 disclosure and cooling-off duties;
  - 18+ and personal, non-transferable use in the terms.

## 13. Later: automating payments

- **Owner SMS forwarding and auto-match:**
  - An SMS-forwarder app on the owner's phone posts each received-money SMS to a new `POST /api/owner-inbox`. It sits outside `/api/admin`, whose routes all need the owner session, and uses a device token stored in settings (no env key).
  - The server parses it with `parsePaymentSms` and marks matching pending submissions "Found in your MTN SMS". A match needs the same network, `txnKey` and sender, and an amount at least the price.
  - A later, separately approved step could auto-approve exact matches; the one-tap approve stays the fallback.
- **AI reading of screenshots** (deferred; see Design notes), only if auto-match is not enough. It needs:
  - a decision to turn on OpenAI in the worker (`AI_API_KEY`, `GOAL_HINT_AI_ENABLED=true`), which today also starts paid AI predictions, or a separately reviewed decoupling;
  - a new binding beside `createOpenAiBinding` (which accepts only predictor prompts), with image-aware token reservations and a model confirmed to accept images;
  - its own cost-authority job type, lease and concurrent worker loop;
  - an owner evidence approval and privacy wording;
  - output treated as untrusted: validated with the same normalizers, shown as "Read by AI, can be wrong", never a pass mark, never feeding other checks.
- **Collection APIs:** MTN MoMo Collection ("Request to Pay"), Airtel Money Collections, or a licensed aggregator.
  - Each needs a merchant account, KYC and verified callbacks.
  - A callback would create the code and unlock the paying session; the code still goes to the account number for other devices.
  - `PaymentSubmission.source` gains `api` and a provider reference; `approvedTxnKey` stays unique.
  - An SMS gateway could then send codes and the unlock link automatically.
- **New needs then:** provider secrets (new env keys, with the rollback hazard), idempotent callbacks, reconciliation reports, a fresh legal and privacy review.
