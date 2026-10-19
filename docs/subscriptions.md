# Subscriber access and owner operations

Paid access stays **off**. Local fixtures do not approve production activation.
See OP-26/27/37/38/39/40 in implementation-decisions.md and the deployment runbook.

## Model and terminology

Nine tables hold settings, plans, phone accounts, hashed member sessions, payment
submissions, JPEG screenshots, hashed codes, keyed-hash throttle buckets and owner
audit rows. Phones are canonical country-code digits. A code belongs permanently
to its account. Payment transaction keys remain unique after reversal, including
manual entries; replacement chains preserve the original payment attribution.

**Gated = subscriber-only; locked = cutoff-locked.** Cutoff locking preserves
publication history; subscriber gating controls the projection a viewer receives.

`off` serves full content; `test` gates signed-in member accounts while anonymous
browsing stays full; `on` gates non-entitled viewers. Unfinished-fixture picks,
probabilities, prices, analysis, history, slips and probability-dependent filters
require entitlement. Fixtures, scores, factual insights, published-family indicators
and performance aggregates remain free. Finished/canceled/awarded fixture picks
remain public. Every prediction read uses `members/gated-reads.ts`. Shared premium
caches stay server-side; final responses are private/no-store and vary on Cookie.

## Member and owner flow

1. Sign in with a number. This is a weak login, not proof of control of that
   number. A code is also required to unlock a new browser.
2. Choose a displayed plan and pay exactly to a listed receiving number after
   checking its registered name. Initial offers are Daily/1 day/UGX 1,000,
   Weekly/7 days/UGX 5,000 and Monthly/30 days/UGX 20,000. Content is identical.
   Submission snapshots preserve the price and duration offered for review.
3. Optionally paste SMS locally, correct editable fields, select the receiving
   network and attach a screenshot. SMS text and the original image are not sent.
   The browser prepares a JPEG targeting 400 KB; the server cap is 3 MB. Only
   scalar fields stay in a tab draft until submission, sign-out or browser removal.
4. The owner verifies the wallet and sender before approving. Approval serializes
   the global transaction key and creates one period/code. Plain codes are returned
   once and held in the owner tab's session storage until Done. Reissue if lost.
5. Send only to the account number. Tap the fragment link, sign in as that number
   and Unlock. The fragment is removed from history. Renewals extend unlocked
   browsers without another entry; new browsers need a code. Periods use EAT.
6. A new number can request one free trial, initially 2 days, starting when the
   owner creates/sends its code. No automatic payment or review SLA exists.

The cookie lasts up to 400 days; server sessions expire after 90 days and refresh
at most daily on use. There can be 10 sign-in sessions, separately from the
configurable unlocked-device limit (default 2). In-app browsers count separately.
Sign out others and owner Sign out all invalidate sessions. No OTP or auth SDK.

## Settings and audit

Use the existing guarded owner dashboard. Configure verified receiving numbers
and registered names, contact/WhatsApp sender, review-time/payment note and tested
copy format/menu shortcuts. No real wallet values are seeded. Prefix selection
stays unset by owner decision; users explicitly choose the receiving network.
Mode changes require two-tap confirmation and satisfied readiness facts.

Overview reports active paid accounts and approved non-reversed revenue in Kampala
calendar weeks/months, separating manual entries. Trials alone are not paid
accounts. Audit exposes action, time and subject IDs without raw phones, codes,
images or free-text details. Historical account ownership is never rewritten.

## Owner verification checklist

- Check the receiving wallet, owner receipt/SMS, sender, recipient, amount and ID.
  Screenshots, pasted SMS and advisory green checks are not sufficient proof.
- Verify that the payer controls the account number or independently verify the
  real payer. Investigate reused IDs/images and payer/account mismatches. Knowing
  a transaction ID never establishes ownership or authorizes a code.
- Stolen-ID/wrong-account approval: verify the real wallet entry and payer;
  reverse with `wrong-account` to revoke its code/sessions while preserving its
  transaction reservation/history; use the recovery/manual-code tool for verified
  access to the real payer. Never approve the same transaction twice. Review any
  carried renewal days rather than assuming the whole account period was removed.
- Number change: verify through the old number or payment details, select that
  basis and confirm the new number. Existing sessions/codes are invalidated and a
  replacement is issued; historical account IDs do not move.
- Send codes only from the numbers listed on Get access. Never ask for a PIN or
  return transfer. Explain legitimate network reversals independently; the app
  does not execute refunds.
- Send wa.me messages from the phone with the WhatsApp app. Prepared text can
  remain in browser history. Handle residual history, linked-device messages,
  screenshots and phone backups separately. Done clears only the owner-tab panel.
- Finish sending/Done before generating another code. Review unusual unlock
  activity and use Sign out all or Block when justified.

## Maintenance and erasure

`createMembersPurge` is shared by authenticated owner visits, live maintenance,
the worker wrapper and `npm run members:purge`. A database claim limits runs to
hourly. Deletes drain in batches of 100, bounded per category. Pending screenshots
never expire automatically. Approved/reversed images expire after the configured
retention (default 90 days from decision); rejected/superseded after 7 days.
Expired sessions and buckets beyond their window/lock plus one day are deleted;
legacy buckets use a conservative two-day bound. Accounts with no reports or
codes are removed after 30 days without signing in.

Payment metadata, codes and audit retain history pending OP-26's lawful schedule;
these tables have no DELETE grant. Owner erasure clears phone/support/payer/image
data and sessions while retaining transaction amounts/IDs and access/audit metadata.
Backups and external messages need separate suppression/deletion. Reapply recorded
erasures after restore before reconnecting users. Real-data deletion requires
owner authorization; tests use owned disposable databases only.

## Host checks and proposed breach procedure

Before an approved release, validate all nine InnoDB tables, checks, foreign keys,
unique transaction keys and restricted grants. Verify private/no-store responses,
CDN bypass, trusted client addresses, HTTPS cookies, packet/upload limits and
timeouts, image guards and a restore drill. See database.md, local-database.md and
the deployment runbook. Never run older ungated code while paid mode remains on.

The breach plan is an OP-26 blocker. Proposed procedure for owner approval:
contain the incident using authorized controls; revoke affected sessions/codes and
rotate exposed secrets; preserve minimal private evidence; identify affected
numbers, payments, images, messages and backups; obtain qualified advice on
applicable reporting/notification duties and timing; notify only through approved
channels; record remediation and verify restoration. No statutory deadline or
incident is asserted, and no message is sent without authorization.

## Activation evidence

Legal/privacy/refund facts and provider paid-use permission remain unresolved.
Real anonymized payer/owner SMS and screenshots, physical Android money-menu and
copy-format checks, Facebook-to-Chrome return, tab discard and slow upload need
evidence. Six committed SMS drafts are synthetic and prove parser behavior only.
OP-40 must approve activation and date after every gate passes. These prompts
authorize neither deployment nor switching paid access on.
