# Goal Hint — Existing Application Feature Audit

## Objective
Conduct a **read-only audit** of the existing Goal Hint application. Inspect current project rules, code, UI, APIs, database structures and integrations before assessing the requirements below. **Do not implement, modify, or rebuild anything.** Reuse existing functionality and recommend only necessary improvements.

## Requirements to Verify

1. **CRITICAL — Saved Slip Builder configurations:** Up to 10 named configurations per user; Save Current Filters dialog; optional default; load from dropdown; rename, edit, update and delete; accessible from subscriber dashboard; persisted across logins/devices. Loading must populate filters without automatically generating slips.
2. **HIGH — Subscriber dashboard:** Subscription package/status/expiry, remaining time, renewal access, saved filter configurations, referral statistics/reward days, relevant account activity. Keep simple; do not duplicate homepage Best Slips.
3. **HIGH — Referral rewards:** Unique referral link per registered user; one free access day for each verified new registration, regardless of payment; valid rewards accumulate without a lifetime cap; track balance and apply earned access after paid access expires; prevent self-referrals, duplicates and fraud.
4. **HIGH — Invite Friends:** Subtle entry points in dashboard and main menu; copy personal link and share via WhatsApp, Telegram or native sharing; clear invitation text; no intrusive pop-ups.
5. **MEDIUM — Existing prediction/slip sharing:** Verify share buttons, accurate branded image generation, correct links, WhatsApp flow, mobile/desktop compatibility and access controls; recommend fixes only where needed.
6. **HIGH — Sessions:** Maximum two concurrent active sessions per account. Upon successful third login, invalidate the oldest session immediately on the server without advance notification. Check race conditions, session expiry, and minimal data retention. Verify phone-number authentication for new logins.
7. **HIGH — Registration and referral security:** Phone verification, bot protection, rate limits, duplicate/suspicious registration checks, self-referral prevention and reward eligibility checks; avoid unnecessary friction for legitimate users.
8. **MEDIUM — In-app notifications:** New predictions, relevant match results, subscription expiry/renewal, expired access, earned referral days and essential account events; organised and non-intrusive. No external SMS/WhatsApp reminders in this scope.
9. **MEDIUM — Subscription management:** Existing packages, activation, expiry and remaining-time calculations, renewal, in-app reminders and integration with earned referral access.
10. **VERIFY — Match details:** Accurate available match/team/player statistics, form, head-to-head, predictions, odds, probabilities and supporting analysis. Avoid duplicate screens.
11. **VERIFY — Overall prediction performance:** Historical wins/losses, market, league and probability-band analysis, combinations, sample sizes, time periods and accurate calculations. Do not introduce personal betting/profit tracking.
12. **VERIFY — Mobile functionality:** Navigation, responsive layout, slips collapsed by default and expandable by header, Slip Builder, saved configurations, subscriptions, sharing/referrals and match details. Defer detailed production load/performance optimisation.

## Required Audit Method
For each item, locate relevant source files, routes, components and data models. Classify as **Fully Implemented / Partially Implemented / Missing / Incorrectly Implemented / Unable to Verify**. Report evidence, gaps, risks, dependencies, priority and the **smallest practical corrective action**. Do not infer completeness from UI alone. Clearly separate verified facts from assumptions.

## Deliverable
Create `goal-hint-feature-audit-report.md` containing a concise table:

| ID | Feature | Status | Priority | Evidence / Files | Gap | Recommended Action |
|---|---|---|---|---|---|---|

After the table, provide key risks, dependencies, unanswered questions and recommended implementation order. Prioritise saved configurations and subscriber-facing functionality. **Stop after reporting; await explicit approval for each subsequent implementation.**
