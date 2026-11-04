# 279 — Manual payments, opt-in trials, and Back navigation

Use the existing manual checkout, account access periods, and shared web navigation. Verify with isolated demo services and synthetic receipts. Keep the Flutter hosts on the shared web flow and use their existing WebView history where supported.

## Implementation

- Manual checkout previously overlaid the database receiving details with runtime environment values. The demo cleared those values, so its member quote could reject both providers while the admin screen showed configured recipients. Admin settings, quotes, and the legacy payment path now use the same stored provider rules. The existing audit log records provider edits and review decisions. The server refreshes the transfer quote before advancing from Pay.
- Registration marks eligibility and preserves phone verification. Activation and paid conversion use the account lock, and access continues to use the existing UTC access periods and device checks. Wallet renewals do not start from trial-only access. Active trials and earned referral time retain their duration when paid access is queued.
- The shared Back logic covers checkout steps, Referrals, match details, Best Slips, and existing admin record controls. Public listing, help, account authentication, and informational screens continue to use their normal browser history and existing controls. Checkout saves eligible choices for up to 30 minutes within the verified session. Old browser payment drafts are removed and unsent evidence stays in memory. Admin list state is preserved within its workspace. Arbitrary unsaved admin forms and local filters may need re-entry after a full reload.

## Migration and rollback plan

1. Back up the local database before migrating a persistent copy. Use a disposable MySQL database to verify the change first. Apply the Prisma migration on MySQL or the matching overlay on MariaDB through the documented database workflow.
2. Add independent MTN and Airtel enable flags. Existing stored recipients with both a number and name retain availability if the application validates those details. Incomplete settings remain unavailable. New settings default to disabled until an administrator configures and enables a provider.
3. Add nullable eligibility and forfeiture timestamps to `MemberAccount`. New registrations record eligibility. Existing account rows and historical trial or paid access periods keep their current state. Trials still use the existing access-period records for their start and expiry.
4. Before a separately authorized rollout to a deployment that previously supplied receiving details through environment settings, reconcile those settings with the database through the protected admin workflow. Confirm each provider's intended recipient, dial shortcut, and enabled status before opening checkout. Keep any secrets in their existing private configuration.
5. For a local rollback, stop the app and use the previous revision with the additive columns left in place. Keep the backup and the applied migration record. If schema rollback is required before any new writes, restore the pre-migration local snapshot. After new writes, preserve the access and payment history and plan a forward correction before returning to the old trial and provider rules. If DDL fails partway, inspect the schema and migration ledger before retrying or restoring.

## Local acceptance checklist

- Confirm the six configured packages and the Daily 24-hour label against the checkout quote. Walk Package, Pay, Details, and Review on MTN and Airtel. Change provider settings as an administrator and check updated details, disabled and incomplete states, and audit entries.
- Submit synthetic evidence, check that the member is still awaiting review, verify private evidence access, reject with a reason, and approve a valid receipt. Retry submission and approval, and confirm one access grant.
- Register and sign in without starting a trial. Activate with the configured duration, race two requests, check expiry with a controlled clock, and exercise approval both before activation and during an active trial.
- Return from Referrals and from checkout steps using the app control, browser Back, and Android system Back where available. Check direct links, refresh, expired selections, logout, and a different account. Verify safe draft fields are restored where applicable and payment evidence is kept out of browser storage.
- Compare responsive screenshots in light and dark themes. Exercise the Windows and Android Flutter hosts where available and record platforms that could not be run. Record timing observations separately from functional fixes.

## Verification recorded locally

- The full Prisma migration chain applied on isolated MySQL 8.4.11. The targeted migration test verified provider backfill and preserved historical accounts, claims, and allocated payments. The MariaDB overlay is included for the existing deployment workflow.
- Isolated MySQL checkout, legacy payment, administrator review, and opt-in trial suites passed. They cover both providers, idempotent approval, rejection, evidence ownership, activation races, expiry, and full paid and earned duration after a trial. Focused authentication, settings, route, and navigation tests passed.
- The browser fixture displayed the six specified packages and submitted both MTN and Airtel through Package, Pay, Details, and Review. Each synthetic receipt returned pending, and the Pay step displayed the configured recipient and the UGX 1,000 amount. Desktop light and mobile dark screenshots preserved the layout. A separate browser check activated the configured three-day trial through Account.
- The original application returned the provider error for both methods with valid stored recipients in the local database. The updated HTTP flow quoted and submitted both methods, restored duplicate requests, and enforced admin-only evidence access. An MTN approval forfeited an unused trial. An Airtel rejection left the trial available. Sign-out invalidated the earlier session for activation.
- At 390 px, Chromium returned from Referrals to the checkout Pay entry with the Weekly plan and MTN selected. Back and Forward restored Package and Pay. A direct Referrals link fell back to Account. Refresh closed an unfinished attachment, and reopening it showed empty evidence fields.
- Prisma generation and validation, TypeScript, scoped lint, the theme token contract, the local production-mode build, and nine Flutter shell tests passed. The shell tests include native Back delegation. The Android emulator stayed offline. The Windows debug build completed, and its first native run hit a WebView startup error before navigation. The web build reported filesystem tracing warnings in the existing app-download catalog.

## Local timing

The cold checkout fixture included about 39 seconds of development compilation before hydration began. Warm fixture document requests took 0.39–3.2 seconds under different levels of host load. The first real checkout quote took 2.5 seconds during route compilation, and repeat quotes took 109–263 ms. These measurements characterize local development and leave production performance open.
