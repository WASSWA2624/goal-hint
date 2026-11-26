# Member account authentication

Registration requires a valid mobile number and a password of 8–128 characters. The signup form shows the canonical phone number with its country code for confirmation before posting. Edit or Cancel returns to the form with the entered values. Passwords use salted scrypt hashes. Duplicate registration returns HTTP 409, including concurrent submissions. Registration has no address or phone attempt quota. Login, password recovery and protected account actions retain their existing limits. New regular members get a normal authenticated session and open Matches immediately. Eligible new registrations receive the configured one-time trial in the account creation transaction. Disabled offers do not create an entitlement, and only verified members with pre-existing unused trial eligibility retain manual activation.

Phone fields throughout the app share a country selector with flags and a separate national-number input. Countries can be searched by name, abbreviation or calling code; requests still submit the canonical full number, including the selected country code.

Successful signup opens Matches (`/en/matches`) for every entry point. Existing-member login, legacy account verification and password reset default to Matches and preserve eligible checkout and shared-slip return paths. A legacy restricted session can enter an already-delivered six-digit code, choose Forgot password for the registered number, or return to Login. Restricted cookies cannot access private member content, payment submissions, profile changes, or administrator pages.

Login and Register use the canonical Account URLs. A signed-out Subscribe visit redirects to Login; verification-only and reset-only sessions resume their required Account form. Pricing and subscription availability do not decide whether someone is signed in. Failed session reads show the existing unavailable message instead of treating the visitor as signed out. An authenticated member opening Login/Register goes to Matches (or their shared slip); the plain Account URL still opens their account workspace. Verification's Back to login clears the restricted session and returns to Login, while ordinary logout returns to Matches.

Account writes have a bounded request deadline, retain inline server errors, and handle non-JSON proxy failures without navigating to a malformed URL. The login form allows one in-flight submission and shows connection-specific feedback on transport failures. Identity changes observed on tab focus or page restoration refresh private page content as well as the header.

## Password changes and recovery

Forgot password is available only while signed out. A signed-in recovery link
opens Account → Change password, which uses the authenticated session and asks
for a matching new password and confirmation. The form and endpoint accept nonempty passwords up to 128 characters, including repeated characters and previously used passwords. Recovery request/code-confirmation APIs reject authenticated
cookies before sending or consuming a code. Signed-out and reset-only sessions
retain the existing delivered-code recovery flow. Saving a password rotates the
current cookie, keeps that device signed in and revokes every other session.
Changing the number requires the current password, clears admission and ownership proof for the old number, and revokes prior sessions and codes. The replacement requires successful Forgot password recovery before account access resumes. A member in the password recovery cooldown keeps the original number and session until they can complete recovery.

## Two active sessions

A phone-number account can have two authenticated, unexpired sessions. A successful third login immediately deletes the oldest active session on the server inside the existing account-locked transaction. Age follows authentication time, then creation time and token hash for deterministic ties; ordinary activity does not change login age. Re-signing in from the same browser replaces its token before counting the other session. Expired and restricted sessions do not consume active slots. Login proceeds directly to its destination with no eviction prompt or popup; sign-out returns to the matches. Actionable inline errors, verification instructions and trial-access details remain part of their respective forms.

Incorrect credentials, blocked/throttled attempts and rolled-back login transactions preserve existing sessions. Restricted verification and reset-only sessions cannot evict authenticated sessions. Completing phone verification, changing a password/phone or completing password recovery still rotates authorization and revokes prior sessions for security. Separate browser profiles and in-app browsers count as separate sessions; tabs sharing a cookie share one session.

Both signed-in devices inherit the account’s active subscription and share its expiry. Administrators and normal users use the same phone-and-password login form and the same two-session policy. Token hashing, 90-day rolling server expiry, daily touch and existing expired-row maintenance remain unchanged.

Admin → Subscribers → Log out devices revokes selected active sessions for that subscriber. The all-devices action also remains available. Protected pages and APIs check the current stored session.

## Legacy account verification

Previously issued account codes remain usable until consumed or expired. Only Forgot password sends a new code. Successful legacy verification grants a normal member cookie and records proof of the current number. It leaves access dates and existing referral rules intact. Registration alone cannot establish proof of phone ownership.

Pasting accepts only a complete six-digit ASCII code after trimming surrounding whitespace, preserving leading zeros. Message text, letters and longer numbers are rejected without extracting or truncating digits. Clipboard autofill is attempted only during interaction with an empty code field in a secure browser context; permission denial leaves manual entry and native paste available. It never overwrites an edited code, submits automatically, or persists clipboard contents. The server verifies the submitted code before granting access.

## Password recovery

1. While signed out, Forgot password opens the recovery page. The user enters their registered number and chooses SMS or WhatsApp. Signed-in recovery deep links redirect to Account → Change password; signed-in recovery-code requests and confirmation are rejected.
2. The acknowledgement is generic for missing or ineligible accounts. Eligible accounts receive a six-digit code through YoolaSMS using their selected supported channel. A code expires after 24 hours. The three-send rolling allowance applies across channels and survives a phone change. A new request replaces older codes, and five incorrect guesses invalidate a code.
3. A valid code is consumed atomically and grants a reset-only cookie for 15 minutes. The user chooses a new password. This cookie cannot access member or administrator content.
4. Saving the password invalidates outstanding codes and all existing sessions, and issues a new member cookie.

Profile password changes and password recovery share a rolling 24-hour limit: a member can save a new password only once during that period. The restriction is checked under the account lock, including concurrent requests. Signed-in members use Change password with a new password and confirmation, without their current password or a verification code. Saving issues a fresh current-device cookie and revokes all previous sessions. Signed-out members use verified recovery. Recovery does not create an admin request, and administrators cannot issue member passwords or bypass this restriction.

Production and development delivery setup, country/channel coverage and server-only API credentials are described in [yoola-messaging.md](yoola-messaging.md). Development uses real delivery with configured credentials; automated tests inject synthetic delivery.

## Administrator access

Everyone signs in at `/en/account?view=login`. The server determines the role after checking the phone number and password: administrators go to Overview at `/admin`; ordinary users go to Matches at `/en/matches`. Verification and password-change requirements finish before either destination. A signed-in administrator visiting an account page goes directly to the dashboard. Validated payment-review links retain their selected payment destination. Unauthenticated `/admin/*` and `/analytics` pages redirect to the shared form.

Configure server-only `GOAL_HINT_ADMIN_PHONES` as a JSON array of canonical numbers and `GOAL_HINT_ADMIN_PASSWORD` as their shared private password of 8–128 characters. `GOAL_HINT_ANALYTICS_SECRET` must be a strong private secret in production. Public registration and member recovery cannot provision or reset an administrator. Removing a configured number or rotating the password withdraws its existing administrator sessions.

The separate admin/analytics username login is retired. Legacy login POST endpoints issue a fixed HTTP 303 to the shared form without accepting or forwarding credentials. Old owner cookies cannot authorize any dashboard or change an account's role. A successful account login clears the old cookie. Sign-out clears both cookies during storage failures and reports unconfirmed server revocation. Existing legacy session tables remain available for cleanup. Administrator login retains the analytics browser-exclusion cookie.

## API

All writes require same-origin requests. Responses are private and not cached; cookies are HttpOnly, same-site, and Secure in production. Optional `return` paths are validated locally.

| Endpoint | Request | Success |
| --- | --- | --- |
| `POST /api/account/register` | `{phone,password}` | `{next,phone,trial?}` plus normal member cookie. `next` is Matches. |
| `POST /api/account/login` | `{phone,password,return?}` | `{next,phone,...}` plus appropriate cookie |
| `POST /api/account/verification` | Legacy delivery request | Retired with recovery guidance |
| `POST /api/account/verify` | `{code,return?}` with pending cookie | Normal member cookie and optional active-trial metadata |
| `POST /api/account/forgot` | `{phone,channel,return?}` | Generic recovery acknowledgement |
| `POST /api/account/reset-code` | `{phone,code,return?}` | Reset-only cookie |
| `POST /api/account/reset` | `{password,return?}` with reset-only cookie | New member cookie |
| `POST /api/account/password` | `{password,confirm}` with authenticated member cookie | Fresh current-device cookie and revocation of all previous sessions |
| `POST /api/account/phone` | `{phone,currentPassword}` | Restricted cookie for a changed phone |
| `GET /api/account/session` | — | Admitted account phone and role, plus a subscription summary when available. An unavailable summary is `null`. An expired or revoked session has no account identity. |
| `POST /api/account/sign-out` | Optional fixed `?destination=login` for leaving verification | Clear cookies and end session; Matches by default, Login for that fixed intent |

`/api/account/sign-in` remains a password-login alias.

## Database rollout

Apply `20261122200000_member_admission` before deploying this version. It adds a nullable admission timestamp without backfilling any account or ownership proof. Existing verified accounts continue to use their proof. Run the payment-message worker from the new release to retire legacy queued member messages without delivery and retain previously recorded outcomes.

Deploy `20261029120000_remove_admin_password_requests` with the admin password-workflow removal. It removes the obsolete request timestamp, temporary-password hash/expiry, and queue index. Accounts affected by an unfinished legacy admin reset retain verified-code recovery eligibility through an intentionally unusable password marker; ordinary password hashes, reset-only sessions, verification codes, and historical audit events are preserved. Coordinate migration and application rollout; previous releases still reference the removed columns.

The historical `20261023090000_member_message_verification` migration added `MemberAccount.phoneVerifiedAt` and `passwordChangedAt` and restored `MemberVerification` for codes with delivery channels. See [manual-account-grants.sql](deployment/manual-account-grants.sql) for table grants. Schema generation does not apply any migration.

`20261023130000_single_member_login` is a historical, data-only cleanup from the former one-session policy. Keep the applied migration unchanged; do not rerun it to enforce the new limit. Moving from one to two active sessions needs no schema change or new migration. The login transaction enforces the cap and cleans any excess older sessions it encounters.

See [subscriptions.md](subscriptions.md) for payment approval, screenshots, saved slips, and related grants. Never print real environment credentials or phone numbers in deployment logs.
