# Subscriptions and content access

## Purpose and scope

Subscriptions are time-limited, account-wide access periods. An active period unlocks the same content across all packages and authenticated devices. [Authentication](authentication.md) explains identity and verification. [Payments](payments.md) covers checkout, payment evidence and reconciliation.

## Current implementation

The standard package migration adds these offers for durations that do not already exist. `SubscriptionPlan` rows remain editable, so the live catalogue and prices depend on stored settings.

| Initial label | Duration | Initial price |
| --- | --- | --- |
| Daily | 24 hours | UGX 1,000 |
| Weekly | 7 days | UGX 5,000 |
| Monthly | 30 days | UGX 20,000 |

Admins can change the name, duration, price and availability of offers. A used plan remains in history. A plan with no payment, period or auto-renewal references can be deleted. Submitted payment requests and issued periods retain their recorded price, length and plan name.

### Effective access

| Viewer or policy | Effective server access |
| --- | --- |
| Guest, blocked account or invalid session, either mode | Public fixtures, completed predictions and Best Slips previews. Protected actions require login and eligible access. |
| Paywall **Off**, confirmed settings and eligible signed-in member | Full Matches, Best Slips and Builder access. New purchases, trials and automatic renewals are paused. |
| Paywall **On**, eligible signed-in member with no active period | Public projection and the existing subscription prompt. |
| Paywall **On**, active paid, trial, referral or admin-granted period | Full content with an eligible session. Access starts at the recorded start instant and expires exactly at the end instant. Future and revoked periods provide no current entitlement. |
| Active administrator, either mode | Full content through the administrator session. Admin accounts do not purchase or claim member trials. |

The free Matches projection keeps basic fixtures and completed predictions. It removes unfinished picks, probability values, odds and detailed prediction history, and rejects unfinished filters and probability sorting that could reveal subscriber values. Match Insights checks current completion before granting free access. [Slip Builder](slip-builder.md) requires full access to generate. [Automatic slips](automatic-slips.md) are browsable as previews, revealing completed choices and full completed slips. Protected readers enforce access on the server before returning results. Authorization reads current policy across processes. Unavailable settings may cause a `503` on access-aware reads.

## End-to-end flows

1. **Start a trial.** Ordinary phone-and-password registration issues a trial in the same transaction as account creation when the paywall is on and the configured duration is positive. The trial starts at `MemberAccount.createdAt`. Existing verified accounts with a pre-existing, unused offer can activate it through `POST /api/account/trial` while their original creation-time window is open. Login, password reset and device changes keep that original window. Historically issued trials keep their recorded dates and any paid periods queued behind them. A first paid grant forfeits an unclaimed legacy offer. If a trial is active when a first paid period is granted, paid access follows the trial.
2. **Choose and pay.** The localized Subscribe page sends a guest to the shared login, carrying a validated return path for the Match, Builder or slip journey. It offers active affordable wallet plans or plans with an eligible external payment method. A pending report or browser return alone supplies no access period. Verified manual payment, verified successful Flutterwave reconciliation, or a completed wallet purchase writes the entitlement transactionally. An approved top-up adds wallet credit. The member can spend that credit separately on a plan. Redeemed referral rewards grant access time separately from the cash price.
3. **Use and expire.** An issued `AccessCode` period belongs to the account and is read through the authenticated session. New paid time uses exact 24-hour units and usually queues after the existing unexpired paid/trial chain. Reward grants have their own rechaining rules. The current expiry shown in Account and the private session summary includes contiguous unrevoked periods. Access drops at the end timestamp unless another qualifying period or public policy supplies access. The read-time check enforces expiry directly.
4. **Renew or turn renewal off.** Members can opt into wallet auto-renewal with an active plan, positive spendable credit and accepted terms while sales are available. One hour before the chain end, the renewal service can buy the selected plan at its current price if spendable credit covers it. Account locks and a wallet request key tied to the period end prevent duplicate charges. The maintenance sweep covers recent expiries up to one day old, and an eligible member visit can trigger renewal after a longer lapse. Trial-only chains do not trigger a purchase. Turning renewal off remains available when sales are paused and leaves existing grants valid.
5. **Administer a period.** Admins can record a manual grant, extend an eligible period by 1–60 days per operation, revoke it with a reason, or reconcile a payment reversal. Period history is retained, while eligible queued periods are shifted when needed. The subscriber directory supports account blocks and administrative renewal disablement.

## Subscriber administration

- **Admin → Subscribers** lists registered accounts regardless of payment status. The existing search and filters run before the directory returns a 25-account page. Open keeps the account detail navigation. The row menu opens the same account actions as the detail view, including a secure reset for eligible accounts. [Subscriber directory](../next-js/src/server/admin/subscriber-directory.ts), [authentication](authentication.md).
- **Select All** applies to the current filtered page. The selected count and Manage menu follow the checked rows. Changing the filter or page clears the selection. Manage offers access grants, blocking, unblocking, device logout, erasure, and permanent deletion. Bulk grants issue free access by selected account ID. Phone number and password changes are individual actions.
- The admin endpoint validates the selected account IDs and the confirmed count, rechecks each target, and runs account mutations independently. A mixed result reports each failure and updates the directory and selected detail. A grant retry using the same request ID preserves the access period already issued for that account.
- Permanent deletion removes eligible accounts and their linked credentials, sessions, verifications, personal slips, eligible payments and evidence, and access periods in one transaction. The deletion audit records the operation without a deleted account identifier. Open payments, receipt accounting, wallet history, cash grants and number-move dependencies can require retention. Erasure removes personal data, revokes sessions, and preserves the accounting and access history. [Deletion and retention](../next-js/src/server/admin/delete-subscriber.ts), [payments](payments.md).

## Rules and edge cases

- `SubscriptionSettings` stores a singleton policy row. A missing row supplies defaults, including paywall Off. `/admin/settings` edits the mode and trial duration and reports checkout readiness separately. Switching modes preserves issued periods. The old `allowUnsubscribedMembers` column is retained for database compatibility and is outside the settings API and authorization rules. In production, new purchases require release-ready Privacy and Terms notices and support contact setup. Usable provider configuration or adequate wallet funding determines the offered options. Pending payment requests can still be reviewed and fulfilled with new sales paused.
- `AccessCode` is the historical model name for a grant. Newly issued periods unlock eligible signed-in devices directly. Plan and payment links, source, start and end timestamps, and revocation metadata are stored for audit. The `WalletEntry` ledger records balance changes separately.
- New auto-renewal enrollment checks published checkout readiness. Execution of an existing enrollment checks the stored paywall switch, selected active plan, period eligibility and spendable wallet credit. It can continue while other checkout-readiness requirements are unavailable. Existing payment requests have their own completion paths.
- The content resolver retains a compatibility check for a valid legacy analytics session. The Admin and Analytics dashboards use the current member administrator session. [Viewer access](../next-js/src/server/members/viewer-access.ts), [dashboard authorization](../next-js/src/server/analytics/analytics-http.ts).
- Account and Subscribe show subscription state, with the latter carrying any valid feature return path. Admin settings, plans, codes and subscribers support policy, catalogue and entitlement management. Account session polling refreshes status, while access enforcement uses independently verified server reads.

## Implementation references

- [Subscribe page flow](../next-js/src/app/_components/subscribe-route.tsx), [account page flow](../next-js/src/app/_components/account-route.tsx), [subscription summary](../next-js/src/domain/subscription-summary.ts), [access periods](../next-js/src/server/members/access-codes.ts), [period rules](../next-js/src/domain/subscription-period.ts) and [trial HTTP](../next-js/src/server/members/member-trial-http.ts).
- [Viewer access](../next-js/src/server/members/viewer-access.ts), [gated reads](../next-js/src/server/members/gated-reads.ts), [match projection](../next-js/src/domain/paywall.ts) and [slip projection](../next-js/src/server/slips/slip-preview.ts).
- [Plan management](../next-js/src/server/members/plans.ts), [settings](../next-js/src/server/members/settings.ts), [sales readiness](../next-js/src/server/members/sales-readiness.ts), [admin period operations](../next-js/src/server/admin/codes-http.ts), [renewal maintenance](../next-js/src/server/members/auto-renew.ts) and [members worker](../next-js/src/workers/members.ts). Renewal runs through member reads, maintenance hooks and `npm run members:renew`.
- [Prisma schema](../next-js/prisma/schema.prisma) defines `MemberAccount`, `SubscriptionPlan`, `SubscriptionSettings`, `AccessCode`, `PaymentSubmission` and `WalletEntry`. [Initial packages migration](../next-js/prisma/migrations/20261021103000_standard_subscription_packages/migration.sql) establishes the historical seed offers.
- [Package integration test](../next-js/tests/subscription-packages.integration.mjs), [access-period tests](../next-js/tests/access-codes.test.mjs), [gating tests](../next-js/tests/paywall.test.mjs), [wallet integration tests](../next-js/tests/wallet.integration.mjs), [subscription expiry tests](../next-js/tests/subscription-expiry.test.mjs) and [MySQL cross-feature access matrix](../next-js/tests/content-access.integration.mjs).

## Gaps and limits

The current deployed catalogue, prices, paid-access switch, trial duration and provider readiness are mutable runtime state. The repository defines defaults and behavior. Package purchases and wallet renewals are discrete periods. The member-facing cancellation control disables future wallet renewals. Period revocation and payment reversal are handled by administrators.
