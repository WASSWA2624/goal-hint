# Member authentication and verification

Account authentication uses the registered phone and a password (8–128 characters). Passwords use the existing salted
scrypt password storage helper. There is no photo upload, old-password requirement, password history restriction or
requirement that a new password differ from the old password.

Phone and password changes require a code sent to the **currently registered number**, by **WhatsApp (default)** or
**SMS**, chosen explicitly by the member. Signed-out password recovery uses the same channels; existing accounts created
before passwords were introduced can use recovery to set their first password. The server never falls back silently
between providers. The registered number must use WhatsApp to receive a WhatsApp code; SMS uses its mobile connection.
Changing a phone updates the same account, so its subscription codes, payment history and current device's unlocked
access remain. Both changes revoke other sessions and rotate the current cookie. Recovery signs out every old device.

## Deployment

Apply `20261020193000_member_password_sms` through the existing reviewed database deployment workflow before deploying
the application changes. The migration adds nullable password/session authentication fields and `MemberVerification`.
It leaves legacy sessions present but unauthenticated; members must log in or recover their password. This is necessary
because earlier cookies could be issued with a number alone. Number-only and subscription-code-only login are no longer
authentication methods. Subscription codes remain usable after password login through the Account page.

Grant the application role SELECT, INSERT, UPDATE and DELETE on `MemberVerification`, in addition to its existing member
grants. Expired challenges are deleted by the existing hourly members purge. Account erasure clears password hashes and
verification records. The provisional 30-day unpaid-account purge does not delete accounts with a registered password.

For the existing local development role, an administrator applies:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON goal_hint_db.MemberVerification TO 'goal_hint_app'@'127.0.0.1';
```

The local migration and this grant are applied and verified. The application role passed an insert/read/update/delete
probe inside a rolled-back transaction; no verification records were retained. The existing local database and
administrator credentials were preserved. See [local-database.md](local-database.md) for the Windows MSIX filesystem
redirection caveat when using local administrator files. Keep credentials outside the repository and chat.

WhatsApp/SMS selection and configured admin phone access reuse the existing challenge schema. They do not require
another database migration.

## WhatsApp: official Meta Cloud API

The default channel uses the official WhatsApp Business Platform Cloud API and an approved **authentication** template
with an **OTP copy-code button**, which works with this browser-based application. It does not automate a personal
WhatsApp session, use QR-session libraries or require the member to upload a photo. An operator must finish Meta business
and sender onboarding, assign the WhatsApp messaging permission to a suitable system-user access token, and approve the
template before real delivery is available. Meta service terms, account eligibility and charges apply; this integration
does not create or configure an external account or send a live message during setup/tests.

Set these server-only environment values, then restart the application:

- `GOAL_HINT_WHATSAPP_ACCESS_TOKEN`: the private Meta access token with `whatsapp_business_messaging` permission and access
  to the business phone number. Manage its renewal and revocation operationally.
- `GOAL_HINT_WHATSAPP_PHONE_NUMBER_ID`: the Meta business **phone number ID**, not the sender's telephone number or WABA ID.
- `GOAL_HINT_WHATSAPP_TEMPLATE_NAME`: the exact approved authentication template name.
- `GOAL_HINT_WHATSAPP_TEMPLATE_LANGUAGE`: its exact approved locale, for example `en_US`.
- `GOAL_HINT_WHATSAPP_API_VERSION`: optional supported Graph version, default `v25.0`. Upgrade deliberately before retirement.

Configure the authentication template with `add_security_recommendation: true`, footer `code_expiration_minutes: 5`,
`message_send_ttl_seconds: 300`, and a button with `type: "otp"`, `otp_type: "copy_code"`. These are **template creation /
management properties**, not invented per-message fields. The application sends the six-digit code as the body text
parameter and the URL-button parameter at index `0` to
`https://graph.facebook.com/<version>/<phone-number-id>/messages`. The only destination host is Meta's Graph API;
the access token is carried in the Authorization header and is never included in the URL or browser payload.

The code and its confirmation proof still expire exactly five minutes after the local challenge was created,
independently of provider queue timing or the template's visual footer. Only an actual successful acknowledgement with
`messaging_product: "whatsapp"` and one nonempty message ID is accepted; if a pacing status is included it must be
`accepted`. Missing configuration, failed HTTP responses, redirects, malformed/oversized acknowledgements and timeouts
fail closed with a redacted error and consume the unsent challenge. An acknowledgement means accepted for processing,
not delivered: an offline or unregistered recipient can fail asynchronously. Members can explicitly choose SMS after
the shared resend delay if WhatsApp is unavailable. There is no automatic provider switch, delivery-receipt webhook or
registered-number lookup in this feature.

Implementation checked against Meta's official
[copy-code authentication templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/copy-code-button-authentication-templates),
[template TTL](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/time-to-live) and
[Cloud API access tokens](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens) documentation.

## SMS: open-source Android gateway

The supported open-source provider is [SMS Gateway for Android](https://github.com/capcom6/android-sms-gateway).
It sends SMS through a physical Android phone and its SIM; the phone must remain online and its mobile plan must support
the intended SMS traffic. Self-host its private server behind HTTPS, then connect the Android app to it. Installation,
phone pairing, SIM charges and gateway credentials still require operator setup; this code change does not install a
gateway, create an external account or send any live SMS. See the official
[private-server setup](https://docs.sms-gate.app/getting-started/private-server/) and
[API guide](https://docs.sms-gate.app/integration/api/).

Set these server-only environment values and restart the application:

- `GOAL_HINT_SMS_GATEWAY_URL`: the exact HTTPS messages endpoint, without embedded credentials or a fragment. A private
  server behind the documented `/api` mount uses `https://sms.example.com/api/3rdparty/v1/messages`. If the operator
  chooses the public service instead, its endpoint is `https://api.sms-gate.app/3rdparty/v1/messages`.
- `GOAL_HINT_SMS_TOKEN`: a scoped gateway bearer token (preferred). Configure token renewal operationally.
- Or `GOAL_HINT_SMS_USERNAME` and `GOAL_HINT_SMS_PASSWORD`: the gateway's Basic authentication credentials.
- `GOAL_HINT_ANALYTICS_SECRET`: the existing strong production secret also used to key member rate limits and code/proof HMACs.

The adapter sends `Content-Type: application/json`, a bearer token or HTTPS Basic authentication, and this provider payload:

```json
{"phoneNumbers":["+256700000001"],"textMessage":{"text":"Goal Hint password change code: <six digits>. Expires in 5 minutes. Do not share this code."},"ttl":300}
```

Acceptance requires a 2xx response with a nonempty message `id` and a state of `Pending`, `Processed`, `Sent` or
`Delivered`; a failed or cancelled message is rejected. Queue acceptance is not a delivery receipt. HTTP errors,
redirects, malformed acknowledgements and timeouts fail closed. Missing configuration never pretends that a message was
sent, and no developer verification code is enabled. Codes, tokens and full gateway responses are never logged. No real
SMS is sent by automated tests.

## Verification lifetime and limits

Each randomly generated six-digit code expires **five minutes after challenge creation**, checked on the server. It is
HMAC protected in storage and accepts at most five attempts. Confirmation exchanges it for a cryptographically random,
single-use proof; this proof keeps the original expiry, so confirming near five minutes never extends the lifetime.
Proofs are tied to the action, account, registered phone and authenticated session (or an HttpOnly ephemeral browser
cookie for registration/recovery). A resend invalidates that browser's previous challenge for the same action.

Verification requests are limited to five per number per hour, ten per browser/session per hour and twenty per address per hour,
with at least sixty seconds between messages to a number. Confirmation has a fifty-per-address limit per fifteen
minutes; password login allows ten attempts per phone and thirty per address per fifteen minutes. Limits use the existing
durable HMAC-keyed counters and are **shared across WhatsApp and SMS**. Changing channels never resets them. The legacy
internal `sms-*` bucket keys are retained for continuity with previously stored limits. Deploy behind a trusted proxy
that sets the nearest address header correctly. Confirmation cannot alter a challenge's delivery: it accepts only its
ID and code. A new challenge on either channel invalidates earlier challenges and confirmed proofs for that action/browser.

## Configured admin phone access

`GOAL_HINT_ADMIN_PHONES` is an optional private JSON array of canonical phone-number strings, including country code and
without `+`, spaces or punctuation. For example, `["256700000001","256700000002"]` uses invented numbers. Leave blank or
use `[]` to disable it. Malformed arrays, non-string entries, invalid numbers, more than 100 entries or more than 4 KiB
are rejected by runtime policy without echoing the values. The configuration is sealed/redacted in policy output and
is never sent to the browser.

An allowlisted member can request a `login` verification code by WhatsApp or SMS and log in with its single-use proof
instead of a password. This still requires phone ownership, a same-browser ephemeral cookie, the original five-minute
deadline and all shared resend/attempt limits. A new member record stores no invented password hash. Existing records,
password hashes, payment history and subscription codes remain intact. Fresh allowlisted-admin logins always require a
code, including accounts that already have a password; ordinary password login remains available for other members.
Number-only cookies issued before verified authentication remain invalid even for an allowlisted number.

The current allowlist grants full member subscription access without payment **and administration-dashboard access**
after verified login. Existing owner-console credentials remain an independent authentication option. Removing a number
removes its special entitlement and dashboard privilege. A passwordless session on
an account with no real password is then rejected; an account with a real password can continue as an ordinary member.
Already configured admin accounts are excluded from the provisional unpaid/null-password account purge. If changing an
admin phone to a number outside the allowlist, establish a real password first to retain ordinary password access.
Changing an account's phone to a different allowlisted number is refused: proof sent to the old number cannot establish
ownership of a privileged new number. Log out and verify the allowlisted number through code login instead.

Server consumers share `isMemberAdminPhone(phone)` and `memberAdminPhones()` from `member-admin.ts`. These consult
current private server configuration and require canonical phone values; malformed configuration grants no privilege.
The normal persistent member session is reused across page visits; another login code is needed after logout or session
expiry, rather than for each dashboard visit or content request.

## HTTP contract

All writes require a same-origin request. Bodies are bounded to 2 KiB, fields are whitelisted, and responses use `no-store`.
Dates are ISO UTC timestamps and phone responses use canonical country-code digits. APIs return descriptive `message`
on errors; 429 responses include `Retry-After`.

| Endpoint | Request | Successful response |
| --- | --- | --- |
| `POST /api/account/login` | `{phone,password,return?}` or admin `{phone,verificationToken,return?}` | `{next,phone}` and member cookie |
| `POST /api/account/verification` | `{purpose,phone?,channel?}` | `{challengeId,channel,expiresAt,resendAt}` |
| `POST /api/account/verification/confirm` | `{challengeId,code}` | `{verificationToken,expiresAt}` |
| `POST /api/account/register` | `{phone,password,verificationToken,return?}` | `{next,phone}` and member cookie |
| `POST /api/account/phone` | `{phone,verificationToken}` | `{next,phone}` and rotated cookie |
| `POST /api/account/password` | `{password,verificationToken,phone?}` | `{next,phone}` and rotated cookie |
| `GET /api/account/session` | — | `{phone:null}` or `{phone}` |
| `POST /api/account/sign-out` | — | `{next,phone:null}` for JSON clients; form clients redirect |

Verification purposes are `register`, `reset` and configured-admin `login` when signed out, and `phone` and `password`
when signed in. `channel` is `whatsapp` or `sms`; omitting it selects `whatsapp`. An unsupported value is rejected.
Send `phone` for registration/recovery/admin login; signed-in challenges always use the stored registered phone regardless of request input.
For recovery, submit the same phone to `/password`. `/sign-in` remains an alias of password login for older links.
For admin login, confirm the `login` challenge, then submit its proof to `/login` with the same phone. A registration,
recovery or change proof cannot log in an admin. Supplying both password and verification token is rejected.
