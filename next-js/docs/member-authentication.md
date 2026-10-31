# Member account authentication

Registration requires a supported phone number and a password of 8–128 characters. Numbers are canonicalized with their country code; passwords use salted scrypt hashes. Duplicate registration returns HTTP 409. Registration creates a restricted cookie and a single trial access period using the duration in Admin Settings; zero days disables new trials. The period starts at registration. The signup notice shows its expiry and guides the member to phone verification. Password login for an unverified number resumes verification. Pending cookies cannot access protected member content, payment submissions, profile changes, or administrator pages.

Phone fields throughout the app share a country selector with flags and a separate national-number input. Countries can be searched by name, abbreviation or calling code; requests still submit the canonical full number, including the selected country code.

Verification shows one step at a time: choose SMS or WhatsApp, then enter the delivered six-digit code. The code step shows only the registered number's last three digits. Contact support and Back to log in stay visible side by side on small screens. Existing-code entry and returning to delivery selection support resuming or requesting another code. Completing signup, member login, account verification or password reset redirects to the home page (`/en`), including flows begun from protected content or Subscribe. Pending verification and password-change sessions finish their required step before reaching home. Signed-in profile changes retain their existing destinations.

## Two active sessions

A phone-number account can have two authenticated, unexpired sessions. A successful third login immediately deletes the oldest active session on the server inside the existing account-locked transaction. Age follows authentication time, then creation time and token hash for deterministic ties; ordinary activity does not change login age. Re-signing in from the same browser replaces its token before counting the other session. Expired and restricted sessions do not consume active slots. Login proceeds directly to its destination with no eviction prompt or popup; sign-out returns to the matches. Actionable inline errors, verification instructions and trial-access details remain part of their respective forms.

Incorrect credentials, blocked/throttled attempts and rolled-back login transactions preserve existing sessions. Restricted verification and reset-only sessions cannot evict authenticated sessions. Completing phone verification, changing a password/phone or completing password recovery still rotates authorization and revokes prior sessions for security. Separate browser profiles and in-app browsers count as separate sessions; tabs sharing a cookie share one session.

The newly signed-in device inherits the account's current approved subscription without changing its expiry, subject to the independent unlocked-device cap. A paid-device eviction clears entitlement but does not sign out an otherwise valid session. Administrators and normal users use the same phone-and-password login form and the same two-session policy. Token hashing, 90-day rolling server expiry, daily touch and existing expired-row maintenance remain unchanged.

## Account verification

SMS is selected by default. The member can switch to WhatsApp when supported; exactly one available method remains selected. The action reads **Send by SMS** or **Send by WhatsApp** to match the selection and is disabled without a valid number and a supported method. Delivery uses YoolaSMS in both production and development when server-only credentials are configured. A code expires exactly 24 hours after issuance or immediately after successful use. Every new request invalidates earlier codes for that purpose, including requests from another session or delivery channel. At most three requests per account and purpose are allowed in a rolling 24 hours; changing numbers does not reset the allowance, and a reused number retains its recent requests. Reservations and failed/uncertain deliveries count toward the limit to prevent concurrent or retried sends from exceeding it. Five incorrect guesses invalidate a code. Codes are stored as keyed hashes; no public response, URL, log, or database field contains the plaintext code.

Successful verification grants a normal member cookie and makes the account's current access period available on that device. A valid registration trial shows an active-trial notice and Browse app action. Verification does not create or extend a trial; there is no trial request or administrator approval step. Changing the phone number requires the current password, revokes existing sessions/codes, and requires verification of the new number before using the account again.

Pasting accepts only a complete six-digit ASCII code after trimming surrounding whitespace, preserving leading zeros. Message text, letters and longer numbers are rejected without extracting or truncating digits. Clipboard autofill is attempted only during interaction with an empty code field in a secure browser context; permission denial leaves manual entry and native paste available. It never overwrites an edited code, submits automatically, or persists clipboard contents. The server verifies the submitted code before granting access.

## Password recovery

1. Forgot password opens the recovery page. The user enters their registered number and chooses SMS or WhatsApp.
2. The acknowledgement is generic for missing or ineligible accounts. Eligible accounts receive a six-digit code through the selected channel. The same 24-hour expiry, three-request rolling allowance, newest-only rule, and guess limit apply independently to recovery.
3. A valid code is consumed atomically and grants a reset-only cookie for 15 minutes. The user chooses a new password. This cookie cannot access member or administrator content.
4. Saving the password invalidates outstanding codes and all existing sessions, and issues a new member cookie.

Profile password changes and password recovery share a rolling 24-hour limit: a member can save a new password only once during that period. The restriction is checked under the account lock, including concurrent requests. Members manage their passwords through Forgot password or the signed-in Change password form. Recovery does not create an admin request, and administrators cannot issue member passwords or bypass this restriction.

Production and development delivery setup, country/channel coverage and server-only API credentials are described in [yoola-messaging.md](yoola-messaging.md). Development uses real delivery with configured credentials; automated tests inject synthetic delivery.

## Administrator access

Everyone signs in at `/en/account?view=login`. The server determines the role after checking the phone number and password: administrators go to `/admin`; ordinary users go to `/en`. Verification and password-change requirements finish before either destination. A signed-in administrator visiting an account page goes directly to the dashboard. Unauthenticated `/admin/*` and `/analytics` pages redirect to the shared form.

Configure server-only `GOAL_HINT_ADMIN_PHONES` as a JSON array of canonical numbers, and `GOAL_HINT_ADMIN_PASSWORD_HASH` (preferred) or `GOAL_HINT_ADMIN_PASSWORD`. Generate a scrypt hash with `npm run analytics:hash-password`. `GOAL_HINT_ANALYTICS_SECRET` must be a strong private secret in production. Configured admin numbers authenticate with the environment credential. Public registration and member recovery cannot provision/reset an administrator. Removing a configured number or rotating its credential withdraws existing admin access.

The separate admin/analytics username login is retired. Legacy login POST endpoints issue a fixed HTTP 303 to the shared form without accepting or forwarding credentials. Old owner cookies cannot authorize any dashboard or change an account's role. A successful account login clears the old cookie; sign-out clears both account and legacy owner cookies even during storage failures. Existing legacy session tables remain available for cleanup, with no schema migration required. Administrator login retains the analytics browser-exclusion cookie.

## API

All writes require same-origin requests. Responses are private and not cached; cookies are HttpOnly, same-site, and Secure in production. Optional `return` paths are validated locally.

| Endpoint | Request | Success |
| --- | --- | --- |
| `POST /api/account/register` | `{phone,password,return?}` | `{next,phone,requiresVerification:true,trial?}` plus restricted cookie |
| `POST /api/account/login` | `{phone,password,return?}` | `{next,phone,...}` plus appropriate cookie |
| `POST /api/account/verification` | `{channel,return?}` with pending cookie | Verification delivery acknowledgement |
| `POST /api/account/verify` | `{code,return?}` with pending cookie | Normal member cookie and optional active-trial metadata |
| `POST /api/account/forgot` | `{phone,channel,return?}` | Generic recovery acknowledgement |
| `POST /api/account/reset-code` | `{phone,code,return?}` | Reset-only cookie |
| `POST /api/account/reset` | `{password,return?}` with reset-only cookie | New member cookie |
| `POST /api/account/password` | `{password,currentPassword}` | Rotated member cookie |
| `POST /api/account/phone` | `{phone,currentPassword}` | Restricted cookie for a changed phone |
| `GET /api/account/session` | — | Verified phone, otherwise null |
| `POST /api/account/sign-out` | — | Clear cookie and end session |

`/api/account/sign-in` remains a password-login alias.

## Database rollout

Deploy `20261029120000_remove_admin_password_requests` with the admin password-workflow removal. It removes the obsolete request timestamp, temporary-password hash/expiry, and queue index. Accounts affected by an unfinished legacy admin reset retain verified-code recovery eligibility through an intentionally unusable password marker; ordinary password hashes, reset-only sessions, verification codes, and historical audit events are preserved. Coordinate migration and application rollout; previous releases still reference the removed columns.

Deploy `20261023090000_member_message_verification` through the existing database deployment workflow before the new code. The migration adds `MemberAccount.phoneVerifiedAt` and `passwordChangedAt`, and restores `MemberVerification` for request/code tracking with a delivery channel. Existing account numbers are grandfathered as verified; new registrations and phone changes require delivery verification. Historical retired challenges are invalidated. Update column-scoped grants for the added account fields, and ensure SELECT/INSERT/UPDATE/DELETE on `MemberVerification` as shown in [manual-account-grants.sql](deployment/manual-account-grants.sql). Schema generation does not apply the migration to any application database.

`20261023130000_single_member_login` is a historical, data-only cleanup from the former one-session policy. Keep the applied migration unchanged; do not rerun it to enforce the new limit. Moving from one to two active sessions needs no schema change or new migration. The login transaction enforces the cap and cleans any excess older sessions it encounters.

See [subscriptions.md](subscriptions.md) for payment approval, screenshots, saved slips, and related grants. Never print real environment credentials or phone numbers in deployment logs.
