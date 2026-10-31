# Account notifications

Account → Notifications contains an essential in-app inbox and a separate WhatsApp preferences panel. This batch adds no external messages or delivery channel. Header and section badges show the private unread count. Opening a notice does not silently mark it read; explicit controls support individual read/dismiss and mark all as read. Links lead to Payments, Subscription or Referrals.

## Events and schedule

- Approved/rejected payment decisions use their durable submission IDs. A later reversal does not create another approval or a false rejection.
- Access activation occurs when an existing access period starts, never when a future queued period is created.
- Referral earnings use the existing exactly-once verified-registration award; they neither require payment nor change reward eligibility.
- Approaching expiry begins at the existing renewal lead, **one hour** before the effective continuous access end. `activeSubscriptionUntil` joins paid, trial, queued and earned-referral periods. A real gap does not extend current access. Expired access starts at that exact end, not a calendar-day boundary. Renewals or schedule extensions withdraw obsolete reminders.

Durable facts are reconciled on authorized reads and maintenance, so a missed process run is repaired on the next read. Notifications do not grant access, renew subscriptions, debit credit or mutate payments/referrals. A 15-minute maintenance interval and visible-page 60-second refresh are fallback discovery, not exact delivery promises. Reads calculate due reminders immediately.

## Persistence and privacy

`MemberNotification` stores account ownership, a unique `(accountId,eventKey)`, kind/time and read/dismiss/withdraw state. Source keys prevent duplicates across concurrent reads, workers and service restarts. Dismissing hides an entry while retaining its deduplication state. Entries are visible for 90 days; older state is pruned on a later authorized refresh or maintenance run. Payment and referral ledgers retain their existing rules.

Every API and page read rechecks the authenticated session, verified phone and account under the account lock. Expired access and closed sales do not block account settings. Foreign, revoked, restricted, blocked, erased or administrator identities cannot access a member inbox. The client cannot submit an account ID or notification content. Responses are private/no-store, cursor pages are bounded to 20, and DTOs expose no phone, payer details, referred identity or source keys. The shared unread store clears on identity changes and writes no browser storage. Account erasure removes notifications; permanent deletion cascades.

## Operations

Apply `20261031104143_account_notifications` before deploying the application. Grant the application only SELECT/INSERT/UPDATE/DELETE on the new table using [the deployment template](deployment/account-notification-grants.sql); do not grant DDL. The [MariaDB overlay](../prisma/mariadb/20261031104143_account_notifications.sql) is separate from MySQL deployment and records the MySQL migration checksum after structural checks.

`npm run members:notifications` reconciles eligible accounts in bounded pages. Existing `members:renew` also reconciles after renewal; the live runner triggers the same service opportunistically. A scheduled renewal/notification job is still required for unattended production operation. Output contains checked/failed counts only. Deployment owners should alert on nonzero failures and verify worker scheduling separately from in-app visibility.

`npm run test:notifications` covers timing, ownership, retention, concurrency and real MySQL persistence; genuine integration checks require `MYSQL_TEST_SERVER_BINARY`. See [implementation verification](../dev-plan/202-essential-account-notifications.md). Prediction/result alerts remain a separate product decision.
