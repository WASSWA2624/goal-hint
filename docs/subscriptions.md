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

## Rollout and host evidence (067)

This is a future operator procedure, **not deployment authorization**. The owner
explicitly chose draft notices and paid access off on 20 October 2026.

1. Build and verify locally with paid mode off. Use isolated databases for
   integration tests. The known developer runtime-policy/migration drift and
   append-only-trigger restore failure remain separate recorded repair gates
   (058); a database-disabled build does not resolve them.
2. Only after an explicit owner deployment request, pause app/worker writers,
   take a private MariaDB backup including triggers, record its checksum and
   verify restoration to a separate authorized target. Include all nine member
   tables and reapply erasure suppression before reconnecting users. Record the
   production backup schedule, retention, locations, recovery owner/objectives,
   key custody/access and restore evidence (OP-31).
3. Run the overlay's engine pre-check **by hand**, before the release reads the
   tables. The query in database.md must return no non-InnoDB paid tables. Apply
   the reviewed subscriptions overlay with the migration role, then verify all
   nine engines, columns, unique keys, checks, foreign keys and original migration
   checksum/history. `CREATE TABLE IF NOT EXISTS` does not validate old objects.
   Missing/unavailable settings fail closed and can hide picks site-wide.
4. Record read-only host evidence first (OP-32/40):
   - `curl -I https://goalhint.com/en` and a canonical match URL must return
     `Cache-Control: private, no-store`, no `Set-Cookie`, and no LiteSpeed/CDN hit,
     shared-cache or positive Age header. Confirm proxy/CDN bypass for both pages
     and APIs, including cookies and RSC; headers alone are not a cache purge.
   - `SHOW VARIABLES LIKE 'max_allowed_packet'`: at least 8 MB (8,388,608 bytes).
     `SHOW VARIABLES LIKE 'innodb_log_file_size'`: greater than ten times the
     3 MB screenshot cap (greater than 31,457,280 bytes). Record version-specific
     redo capacity as well if the server replaces this variable.
   - After the approved deploy, use Settings diagnostics to record the actual
     trusted client-address header and proxy entry. A forged external
     `X-Forwarded-For` must not choose the address used by throttles; verify header
     replacement/ordering at the ingress. Current application parsing trusts the
     last forwarded address, so unverified ingress behavior is a blocker.
   - Verify LiteSpeed/Passenger accept a 3 MB JPEG plus multipart overhead and a
     slow upload survives the 90-second application read deadline. Lower the cap
     in a reviewed change if the host cannot support it. Do not silently raise
     app limits, logging or storage allowances.
   - Owner signs in on their physical phone, verifies idle-session behavior,
     reviews a screenshot and returns from WhatsApp with the unsent code panel
     intact. No verifier script signs in or uploads.
5. Deploy both app and worker only when authorized, with paid mode off. Worker
   deployment uses the existing `scripts/deploy-worker-cpanel.py`. Both database
   roles need the documented narrow DELETE grants on MemberAccount, MemberSession,
   PaymentScreenshot and RateLimitBucket; no DELETE on reports/codes/audit.
6. The owner enters approved plans, payment numbers and registered names,
   contact/sender, copy format and tested optional menu shortcuts. Do not seed real
   credentials or wallet values into source. Switch to test only under that
   approved exercise. In a browser without the owner session, open `/en/account`
   directly (its icon is hidden in test mode). Test gated to unlocked on the
   phone, the fragment code link, a renewal, a second browser/device, expiry,
   Facebook-to-Chrome recovery, file picker/clipboard, Messages return, forced tab
   discard, retry and upload at about 200 kbit/s. A real small payment requires
   separate spending authorization; a manual synthetic/test code avoids spending.
7. Require OP-40 approval and date, release-ready **effective** privacy/terms and
   all legal items below. Then the authorized owner switches on and runs:

   ```text
   python scripts/verify-production-paywall.py
   python scripts/verify-production-seo.py
   ```

   Both scripts make cookie-less GETs only and never sign in, upload, approve or
   change settings. They refuse cookies, cached/private-page regressions and gate
   leaks. Paywall verification needs a published scheduled forecast within the
   upcoming week; no qualifying fixture is an incomplete check, not a pass. Free
   finished-fixture predictions are intentionally allowed. Before deployment,
   `python scripts/verify-launch-rendering.py` exercises the same verifiers against
   local production route factories and explicitly synthetic data.
8. If verification fails, the authorized owner switches back off. Watch pending
   payments, upload Busy events, error reports, review backlog and code delivery
   throughout the first week; assign the owner responsible for responding.
9. Rollback is mode off, effective across settings caches within 30 seconds.
   Prefer a forward fix and owner-approved extensions for affected periods.
   Rolling code back before 061 removes enforcement while paid periods continue
   and restores obsolete policy copy. Do not roll schema or delete paid history
   as routine rollback. No new environment keys or npm dependencies were added.

Host evidence has **not** been collected: trusted header/entry, forged-header
result, packet/redo sizes, CDN behavior, upload limits/deadline, physical owner
login, backup/restore and deployed worker grants are all pending OP-32/40.

## Owner-input reconciliation and activation checklist

† means required before paid activation; ordinary implementation is allowed.

| Input | Evidence/status | Decision row |
| --- | --- | --- |
| Approved implementation scope/security | v1.9 followed: phone-only login, account-bound code for each new browser, automatic renewal on unlocked devices, any country-code account and UGX to Ugandan wallets. No security redesign is proposed. | OP-37/38 |
| Plans and trial | Supplied: Daily 1 day/1,000; Weekly 7 days/5,000; Monthly 30 days/20,000 UGX, equal content; one free 2-day trial per new number. Owner enters Settings/Plans. | OP-38 |
| Receiving/sender/contact number | MTN, calls and WhatsApp supplied: `256783230321`. Never seeded into committed settings. † MTN registered name still needed. Airtel number/name needed only if offered; otherwise leave Airtel hidden. | OP-38 |
| † Final free/paid split | Implementation preserves public finished/canceled/awarded picks, factual insights and performance; confirm the remaining split decision before activation. | OP-37 |
| Review expectation and note | Supply typical review time and any extra note, or explicitly choose no estimate/note; there is no guaranteed SLA. | OP-38 |
| † Real message/image verification | Six SMS drafts are intentionally synthetic, per owner request. Still need at least three real anonymized messages per offered network covering payer-sent and owner-received layouts, and anonymized app/SMS screenshots. Retain exact punctuation/labels while replacing names/digits. | OP-38 |
| † Phone/menu evidence | Confirm whether each offered menu accepts international or local pasted numbers; test optional menu shortcuts and amount placement, or leave shortcuts absent. Physical Android/in-app, clipboard/file picker, tab discard, 200 kbit/s retry and 90-second upload evidence remains pending. | OP-38/40, 063 |
| Prefix lists | Owner accepted empty prefixes and explicit receiving-network choice. No prefix list is required to activate; future auto-selection needs verified lists. | OP-38 |
| Device/image defaults and owner session | Current defaults: 2 unlocked devices, 90-day approved/reversed image retention; confirm or configure them. Shared owner login keeps its existing 2-hour idle policy. A longer idle period is optional and needs a separately reviewed change; password re-entry for protected settings remains. | OP-26/38 |
| † Refund/consumer policy | Approve refunds, extensions, network reversals, wrong-account approvals and outage compensation; confirm required disclosures and cooling-off duties. App does not execute refunds. | OP-39/27 |
| † Data protection and retention | Hosting/backup countries; log/backup/payment-record/payer/audit retention; lawful bases; PDPO registration position; Meta/WhatsApp cross-border safeguards and phone/linked-device copies; erasure/restore suppression and breach procedure. No new facts supplied; drafts/off explicitly retained. | OP-26/27/31 |
| † Legal/operator publication | Existing operator Wilson Wasswa/Uganda, 18+ and public contact are recorded. Paid-service Ugandan governing-law/dispute arrangements, tipping/licensing position and consumer duties still require verified approval. No licence or exemption is claimed. | OP-27/39 |
| † Provider/source permissions | Confirm paid fallback-prediction access rights, source retention and reporting reuse. Resolve rights/evidence under OP-06/08 and retain odds hidden unless OP-36 display/advertising/history rights and trial qualify it. | OP-06/08/36 |
| † Existing release gates | Resolve performance-claim policy (OP-17), source retention (OP-08), production backup schedule/retention/storage, recovery ownership/RPO/RTO, key custody/access and restore evidence (OP-31), broader release signoff (OP-34), plus the host/grants/cache/upload evidence above. Synthetic counts never approve performance or production capacity. | OP-08/17/31/32/34/40 |
| † Final notices, deployment and activation | Supply final privacy/terms facts and effective dates, explicit deployment request, then separate paid-activation approval/date and first-week monitoring owner. Current instruction: no deployment, drafts, paid mode off. | OP-26/27/39/40 |
