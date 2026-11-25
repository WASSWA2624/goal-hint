# GoalHint — 03: Subscriptions, Trials, and Access Control

## Objective
Make existing **Paid Access** settings and entitlement checks consistent across **Matches, Slips, and Builder** without altering predictions, slip generation, odds, markets, layouts, or subscription pricing. Execute after authentication and recovery foundations.

## First inspect
Find the current Paid Access on/off setting, new-account trial setting, account-creation timestamps, subscriptions, admin-granted access periods, plan/payment logic, APIs, and UI gates. Do not replace functioning modules. **No screenshots are provided.**

## Rules
1. **Guests (not logged in):** Keep the intended public summaries/teasers, but do not reveal protected full predictions/picks or allow protected operations. Use the existing login/register path when access is requested.
2. **Logged in + Paid Access OFF:** Give registered users **full permitted access** to Matches, Slips, and Builder without requiring a subscription or trial. This switch must not remove public guest limitations.
3. **Logged in + Paid Access ON:** Grant protected access only if the user has an **active paid subscription, valid admin-granted access, or an active free trial**. Otherwise display the existing subscription/access prompt without leaking premium data.
4. A **free trial starts at the account's original creation time**; use the app's configured duration (do not hardcode a number or restart it on login, password reset, or device change). Expiry and entitlement rules must match on mobile/desktop and in server/API checks.
5. Keep access-period, payment, subscription, and Admin **Grant access** behavior coherent. Changing Paid Access settings must take effect correctly; do not incorrectly revoke the underlying subscription record.
6. Preserve the distinction between **automatic Best Slips** and the **user-controlled Builder**; do not change existing slip/prediction algorithms or builder filters.

## Verify
Exercise a matrix for guest, logged-in without entitlement, trial active/expired, active/expired subscription, admin-granted access, and Paid Access ON/OFF across all three areas. Include server/API bypass tests and time-boundary checks. Reuse UI components; make targeted modifications only. Report changes and tests.
