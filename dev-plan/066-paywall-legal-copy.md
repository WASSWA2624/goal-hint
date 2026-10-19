# 066 Legal, help, policy copy and analytics

**Feature:** Privacy, terms, help and contact copy that is true whether paid access is off or on, the paid-access analytics goals, and the paid-access documentation.

**Depends on:** [062-gated-ui-entry-points.md](062-gated-ui-entry-points.md), [063-get-access-payments.md](063-get-access-payments.md), [039-privacy-page.md](039-privacy-page.md), [040-terms-page.md](040-terms-page.md), [041-contact-page.md](041-contact-page.md).

**Source:** [App specification](../app-write-up.md), sections 1, 12, 13 and 15 (version 1.9 paid access); [monetization plan](../prompts/monetization.md), sections 5.9 (analytics), 6 (copy), 7 ("With the features"), 8 (066) and 9; OP-26, OP-27, OP-37 and OP-39 in [implementation decisions](../docs/implementation-decisions.md).

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing code before implementing this feature. Every statement must be true with the mode `off` and `on`. Make no accuracy, win-rate, ROI or "sure win" claims, and invent no legal facts the owner has not supplied.

- **Shared copy** (`src/i18n/messages/en.ts`): `metadata.description` (line 24), `privacy.description` (18), `terms.description` (20) and `navigation.footerNote` (33, add 18+).
- **Privacy** (`src/i18n/messages/privacy.ts`, `src/app/_components/privacy-content.tsx`, `src/domain/privacy-notice.ts`) covers: phone-only accounts and the member cookie; what a payment report holds (payer number, transaction ID, amount, screenshot), and that a pasted SMS and the form draft stay in the browser; screenshot handling (owner-only access, database storage, deletion after N days, copies in backups); throttle records (keyed hashes) and the lawful basis; the hosting country, the WhatsApp/Meta transfer and copies on the owner's phone; erasure requests; and a one-line notice by the phone field and the form. Add the notice blockers `payments`, `refunds` and `data-protection` until OP-39 and OP-26 are resolved.
- **Terms** (`src/i18n/messages/terms.ts`, `src/app/_components/terms-content.tsx`, `src/domain/terms-notice.ts`) cover: plans and prices, with changes applying only to new purchases; the free trial (once per number, no payment, 2 days from when the owner sends the code); manual approval with no guaranteed turnaround; access from payment confirmation (or the end of the current period) to expiry, in EAT, with plans that differ only in length; personal use, codes valid only on the paying account, number changes and the device limit (in-app browsers count); refunds, extensions and compensation (OP-39); suspension, revocation and blocking; Ugandan law and disputes, and operator contact (OP-27); 18+, no guarantee and responsible gambling; the weak protection of a phone-number login; and the narrowed `terms.use.body`, which removes unfinished-fixture picks from the reuse licence (OP-37).
- **Help** (`src/i18n/messages/help.ts`, `src/app/_components/help-content.tsx`): replace the "free … no account" intro. Add a "Get access" topic: the free trial for new numbers, paste the SMS, tap the code link then Unlock, renewals on an unlocked phone, and open in Chrome if it opens inside Facebook.
- **Contact** (`src/i18n/messages/contact.ts`): one line pointing to Get access. Keep `contactNotice.releaseReady` true, because it gates indexing in `src/server/seo/policy.ts`, and keep the contact page free of database reads.
- **Operator facts** (`src/domain/public-operator.ts`): keep `audience`; add a `paidAccess` fact ("paying in UGX to our Ugandan MTN or Airtel numbers").
- **Analytics** (`src/domain/analytics.ts`): goals `subscribe-view` (pageview of `/[locale]/subscribe`), `trial-requested`, `payment-submitted` and `code-entered`, never with values. The last three are custom events named `trial_requested`, `payment_submitted` and `code_entered`; the tracker and collect schema accept only `^[a-z][a-z0-9_]{0,47}$` (`src/components/analytics/tracker.ts:273`, `src/domain/analytics.ts:36`). Add `routeLabels` for both pages. Keep `normalizeFreeText` (`src/domain/analytics-classify.ts`), which already redacts long digit runs.
- **Rendering scripts** that assert the old copy: `scripts/verify-terms-rendering.py`, `verify-privacy-rendering.py`, `verify-contact-rendering.py`, `verify-navigation-rendering.py` (lines 67–68) and `scripts/lib/policy_rendering.py`.
- **Docs:**
  - `docs/subscriptions.md` (new): model, flows, settings, purge, host checks, breach procedure, and the glossary "gated = subscriber-only; locked = cutoff-locked". Its owner checklist covers the wallet and sender check, the stolen-ID and number-change steps, sending codes only from the listed numbers, and the wa.me history residual (send from the phone with the WhatsApp app).
  - `docs/database.md`; `docs/local-database.md` (grants); `deploy/how-to-deploy.md` (overlay list).
  - `docs/privacy-page.md`; `docs/terms-page.md` (lines 41 and 48).
  - `docs/seo-discovery.md` (49–54, 128); `docs/match-feed-api.md:13`; `docs/match-detail-api.md` (8–9, 140); `docs/slip-builder.md:193`.
  - `docs/analytics.md` (goals and event names, noting that no-JS code entries are not counted), `docs/help-page.md`, `docs/contact-page.md`.

**Files.** The section 7 "With the features" files above; `src/domain/analytics.ts`; `scripts/verify-terms-rendering.py`, `scripts/verify-privacy-rendering.py`, `scripts/verify-contact-rendering.py`, `scripts/verify-navigation-rendering.py` (67–68), `scripts/lib/policy_rendering.py`; `docs/subscriptions.md` (new) and the docs listed.

## Acceptance checks

Run `npm test`, `npm run test:privacy:html`, `npm run test:terms:html`, `npm run test:contact:html` and `npm run test:navigation:html`.

- No "free, account-free" or "no payments" statements remain.
- The copy is true with the mode off and on, and makes no accuracy or win-rate claims.
- Terms and privacy carry review dates and the new blockers.
- Every custom goal's event name matches the tracker pattern `^[a-z][a-z0-9_]{0,47}$`.
- `verify-navigation-rendering.py:67-68` still forbids sign-in actions on the pages it checks, so no sign-in form (`action="/api/account/sign-in"`) appears outside `/en/account` and `/en/subscribe`.
- The account icon (`href="/en/account"`, "Account") passes that check and appears only when the mode is `on`.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Update `docs/development-progress.md` with changed files, checks and results, and actual blockers. Record justified implementation choices in `docs/implementation-decisions.md`, including which OP-26/27/37/39 facts the owner supplied.
