# Member account authentication

Registration requires a supported phone number and a password of 8–128 characters. Numbers are canonicalized with their country code; passwords use salted scrypt hashes. Duplicate registration returns HTTP 409. Registration creates a restricted cookie and redirects to account verification. Password login for an unverified number resumes verification. Pending cookies cannot access member content, payment submissions, trials, profile changes, or administrator pages.

Phone fields throughout the app share a country selector with flags and a separate national-number input. Countries can be searched by name, abbreviation or calling code; requests still submit the canonical full number, including the selected country code.

Verification shows one step at a time: choose SMS or WhatsApp, then enter the delivered six-digit code. The code step shows only the registered number's last three digits. Contact support and Back to log in stay visible side by side on small screens. Existing-code entry and returning to delivery selection support resuming or requesting another code. Completing signup or a member login redirects to the home page (`/en`), including flows begun from protected content or Subscribe. Pending verification and password-change sessions finish their required step before reaching home. Separate recovery and profile changes retain their validated return destination.

## One active device

A phone-number account can be signed in on only one device at a time. The login form's information control explains that logging in here signs out the other device. A successful fully authenticated login atomically ends previous sessions for that account before issuing its new session. The destination page confirms a successful login and explicitly confirms that the other device was signed out only when a live authenticated session on another browser was revoked. This dismissible notice has no automatic timeout. A tab-scoped event flag carries it through the redirect without storing account details, session tokens or destinations. If browser storage is blocked, the login form displays the confirmation with a Continue button instead.

Completing account verification or password recovery follows the same one-device rule. Incorrect credentials do not end an existing login; restricted verification and reset-only sessions do not displace a fully authenticated session until authentication or password reset is completed. Separate browsers and in-app browsers count as separate devices.

The newly signed-in device inherits the account's current approved subscription without changing its expiry. Administrators and normal users use the same phone-and-password login form and the same one-device policy.

## Account verification

SMS is selected by default. The member can switch to WhatsApp when supported; exactly one available method remains selected. The action reads **Send by SMS** or **Send by WhatsApp** to match the selection and is disabled without a valid number and a supported method. Delivery uses YoolaSMS in both production and development when server-only credentials are configured. A code expires exactly 24 hours after issuance or immediately after successful use. Every new request invalidates earlier codes for that purpose, including requests from another session or delivery channel. At most three requests per account and purpose are allowed in a rolling 24 hours; changing numbers does not reset the allowance, and a reused number retains its recent requests. Reservations and failed/uncertain deliveries count toward the limit to prevent concurrent or retried sends from exceeding it. Five incorrect guesses invalidate a code. Codes are stored as keyed hashes; no public response, URL, log, or database field contains the plaintext code.

Successful verification grants a normal member cookie. It does not grant a subscription. Changing the phone number requires the current password, revokes existing sessions/codes, and requires verification of the new number before using the account again.

Pasting accepts only a complete six-digit ASCII code after trimming surrounding whitespace, preserving leading zeros. Message text, letters and longer numbers are rejected without extracting or truncating digits. Clipboard autofill is attempted only during interaction with an empty code field in a secure browser context; permission denial leaves manual entry and native paste available. It never overwrites an edited code, submits automatically, or persists clipboard contents. The server verifies the submitted code before granting access.

## Password recovery

1. Forgot password opens the recovery page. The user enters their registered number and chooses SMS or WhatsApp.
2. The acknowledgement is generic for missing or ineligible accounts. Eligible accounts receive a six-digit code through the selected channel. The same 24-hour expiry, three-request rolling allowance, newest-only rule, and guess limit apply independently to recovery.
3. A valid code is consumed atomically and grants a reset-only cookie for 15 minutes. The user chooses a new password. This cookie cannot access member or administrator content.
4. Saving the password invalidates outstanding codes and all existing sessions, and issues a new member cookie.

Profile password changes and password recovery share a rolling 24-hour limit: a member can save a new password only once during that period. The restriction is checked under the account lock, including concurrent requests. Members can contact the administrator for further assistance. Recovery requests remain visible under Admin → Password requests. After manually checking identity, an admin can issue a single-use temporary password that expires in 15 minutes and resets the password-change restriction. It invalidates existing passwords, codes, and sessions; logging in with it grants the same reset-only cookie. Temporary passwords are displayed once privately and never placed in audit records.

Production and development delivery setup, country/channel coverage and server-only API credentials are described in [yoola-messaging.md](yoola-messaging.md). Development uses real delivery with configured credentials; automated tests inject synthetic delivery.

## Administrator access

Everyone signs in at `/en/account?view=login`. The server determines the role after checking the phone number and password: administrators go to `/admin`; ordinary users go to `/en`. Verification and password-change requirements finish before either destination. A signed-in administrator visiting an account page goes directly to the dashboard. Unauthenticated `/admin/*` and `/analytics` pages redirect to the shared form.

Configure server-only `GOAL_HINT_ADMIN_PHONES` as a JSON array of canonical numbers, and `GOAL_HINT_ADMIN_PASSWORD_HASH` (preferred) or `GOAL_HINT_ADMIN_PASSWORD`. Generate a scrypt hash with `npm run analytics:hash-password`. `GOAL_HINT_ANALYTICS_SECRET` must be a strong private secret in production. Configured admin numbers authenticate with the environment credential. Public registration and member recovery cannot provision/reset an administrator. Removing a configured number or rotating its credential withdraws existing admin access.

The separate admin/analytics username login is retired. Legacy login POST endpoints issue a fixed HTTP 303 to the shared form without accepting or forwarding credentials. Old owner cookies cannot authorize any dashboard or change an account's role. A successful account login clears the old cookie; sign-out clears both account and legacy owner cookies even during storage failures. Existing legacy session tables remain available for cleanup, with no schema migration required. Administrator login retains the analytics browser-exclusion cookie.

## API

All writes require same-origin requests. Responses are private and not cached; cookies are HttpOnly, same-site, and Secure in production. Optional `return` paths are validated locally.

| Endpoint | Request | Success |
| --- | --- | --- |
| `POST /api/account/register` | `{phone,password,return?}` | `{next,phone,requiresVerification:true}` plus restricted cookie |
| `POST /api/account/login` | `{phone,password,return?}` | `{next,phone,...}` plus appropriate cookie |
| `POST /api/account/verification` | `{channel,return?}` with pending cookie | Verification delivery acknowledgement |
| `POST /api/account/verify` | `{code,return?}` with pending cookie | Normal member cookie |
| `POST /api/account/forgot` | `{phone,channel,return?}` | Generic recovery acknowledgement |
| `POST /api/account/reset-code` | `{phone,code,return?}` | Reset-only cookie |
| `POST /api/account/reset` | `{password,return?}` with reset-only cookie | New member cookie |
| `POST /api/account/password` | `{password,currentPassword}` | Rotated member cookie |
| `POST /api/account/phone` | `{phone,currentPassword}` | Restricted cookie for a changed phone |
| `GET /api/account/session` | — | Verified phone, otherwise null |
| `POST /api/account/sign-out` | — | Clear cookie and end session |

`/api/account/sign-in` remains a password-login alias.

## Database rollout

Deploy `20261023090000_member_message_verification` through the existing database deployment workflow before the new code. The migration adds `MemberAccount.phoneVerifiedAt` and `passwordChangedAt`, and restores `MemberVerification` for request/code tracking with a delivery channel. Existing account numbers are grandfathered as verified; new registrations and phone changes require delivery verification. Historical retired challenges are invalidated. Update column-scoped grants for the added account fields, and ensure SELECT/INSERT/UPDATE/DELETE on `MemberVerification` as shown in [manual-account-grants.sql](../deploy/manual-account-grants.sql). Schema generation does not apply the migration to any application database.

Apply `20261023130000_single_member_login` before deploying one-device enforcement. This data-only cleanup retains the newest active fully authenticated session per account and removes older active logins, so existing accounts also meet the policy. Restricted verification and password-reset sessions are preserved. No columns or schema changes are required by this migration.

See [subscriptions.md](subscriptions.md) for payment approval, screenshots, saved slips, and related grants. Never print real environment credentials or phone numbers in deployment logs.
