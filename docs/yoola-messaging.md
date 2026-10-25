# YoolaSMS member messages

Goal Hint generates and checks six-digit codes. Both account verification and password recovery use a rolling 24-hour lifetime, a maximum of three message requests per account and purpose within 24 hours across both channels, and only the newest issued code. Changing numbers does not reset the account allowance; a reused number also retains its recent requests. A code stops working after successful use or expiry. Password changes share a rolling 24-hour restriction; the administrator can assist a member who needs further help.

The delivery adapter uses Yoola's documented [SMS endpoint](https://yoolasms.com/api-integration) (`POST https://yoolasms.com/api/v1/send`) and [WhatsApp endpoint](https://yoolasms.com/api-integration-whatsapp) (`POST https://yoolasms.com/api/v1/send-whatsapp`). It does not call Yoola Verify: its [documented ten-minute expiry](https://yoolasms.com/sms-otp-verification-api) does not meet Goal Hint's 24-hour requirement. Code hashes, limits, expiry and consumption are enforced by the account service.

## Production and development setup

1. Create or use the owner's YoolaSMS account, copy the API key from its dashboard, and fund its credit balance.
2. Ask Yoola to enable transactional SMS delivery for account verification, password recovery, and payment decisions. Also request activation of any international destination routes you will use; the provider enables these per account. The standard send API has no documented route parameter; routing is configured on the provider account.
3. Confirm WhatsApp authentication messaging is active for the account and the documented `yoola_otp_verification` template is available. Goal Hint sends this approved template with one parameter: its generated verification code. Users explicitly request a message on WhatsApp by selecting that delivery channel; that request is the consent supplied as `consent: "yes"` to Yoola.
4. Set server-only `YOOLA_SMS_API_KEY` in the ignored `.env.local` file for local development and in the production environment for deployment. Optionally set `YOOLA_SMS_SENDER` to an approved alphanumeric sender ID. If omitted, Yoola supplies its default sender. Keep these values out of browser configuration and source control, and restart the application after changing them.
5. Apply the application's database migration and start or deploy the application, then perform an owner-authorized end-to-end delivery check with a phone you control on each enabled channel. Confirm receipt, code consumption, and resend behavior before opening registration to members.

The SMS request sends JSON fields `api_key`, `phone`, `message`, and optional `sender`. The WhatsApp request sends `api_key`, `phone`, `template_name: "yoola_otp_verification"`, `template_params: [code]`, and `consent: "yes"`. The registered phone is a single canonical number with its country code and no leading plus.

## Payment decision notifications

An administrator's payment approval/rejection and its minimal SMS intent commit in the same database transaction. A private worker later attempts one SMS to the registered account number using the same endpoint and credentials. A separate payer number is never the recipient. An owner-recorded payment with a transaction ID also queues its approval notification; a free trial or manual access grant without a recorded payment does not.

Approval, rejection, credit and renewal messages use the same minimal account-update notice with guidance to sign in or contact the administrator. Payment references, decisions, amounts, credit balances, package names, subscription expiry and review reasons stay in authenticated account views. This limits the financial information visible to the gateway and in device notification previews.

Sending starts only after the database decision commits, outside retried database work. Invalid, refused or repeated decisions do not queue another message. The administrator initially sees `Account update SMS queued for delivery`; this does not claim provider acceptance. The outbox later records provider acceptance, an unconfirmed failure, unsupported/missing destination, cancellation or interruption. Provider acceptance does not prove handset receipt. Notification outcomes never reverse an approval, rejection or access grant.

A separate owner audit event records the classified notification status in the worker's final state transaction. Neither that event nor the outbox contains the recipient number, message body, credentials, amount, package, expiry, review text or provider response. The worker resolves the registered number under the existing account lock and skips erased or blocked accounts; erased accounts do not acquire fresh SMS audit events. An SMS already in flight cannot be revoked by account erasure.

Queued intents survive a process interruption and are recovered by the next private worker invocation. The worker commits a unique dispatch claim before contacting Yoola; concurrent workers cannot dispatch it again. A claim interrupted for at least one minute becomes `uncertain`, which requires operator reconciliation and is never automatically resent. A timeout or a failed final database commit may follow provider acceptance. Exactly-once handset delivery is not established without a verified gateway idempotency and receipt contract. Payment notifications remain separate from account-verification/password-reset request allowances and work in both development and production.

Review and apply `20261025230000_payment_notification_outbox` and the grants in `deploy/manual-account-grants.sql` before deploying this change. `npm run payments:notifications -- status` reads status counts without recipients; `npm run payments:notifications -- run 25` processes at most 25 intents, with an explicit maximum of 100. Run it under private worker supervision. The cPanel worker template examines at most three intents per invocation within a 60-second bound, independently of football-provider availability; database work may consume part of that budget. `status` never sends; `run` may send real SMS when credentials and queued intents exist. Inspect `failed` and `uncertain` counts and reconcile with the gateway/member before any separately approved manual resend. No automatic retry or claim of handset delivery follows from a stored `sent` status.

The private worker needs the same Yoola key/sender configuration as the web application. Missing or invalid credentials leave work queued without claiming its only automatic attempt. The admin Overview lists failed/unconfirmed notices, unsupported or missing destinations and intents waiting at least 15 minutes. Owner page reads only inspect stored state and never contact the gateway. **Send again** explicitly queues a new attempt, clears the old attempt token to fence late responses and records an audit event; the member may receive a duplicate if the earlier SMS arrived. **Dismiss** removes an eligible terminal notice and is audited. The private worker performs the new send.

Bounded member maintenance removes terminal `sent`, `unsupported`, `unavailable` and `cancelled` records after 7 days and `failed`/`uncertain` records after 30 days. Open intents remain. Erasure deletes the account's intents and delivery history; permanent deletion cascades. The sole active outbox is `PaymentNotificationOutbox`. The unexecuted alternative `PaymentNotice` migration was removed during branch consolidation before deployment; its original commit remains in Git history.

## Coverage

The shared `supportedMessageChannels` helper exposes WhatsApp in the seven countries on Yoola's [WhatsApp availability page](https://yoolasms.com/whatsapp-business-messaging): Uganda (`256`), Malawi (`265`), Zambia (`260`), Kenya (`254`), Tanzania (`255`), Rwanda (`250`), and Zimbabwe (`263`). Each also supports SMS.

SMS additionally covers the exact live international destination prefixes on Yoola's [coverage page](https://yoolasms.com/coverage), checked on 23 October 2026:

| Region | Published destinations and country codes |
| --- | --- |
| East and Central Africa | South Sudan (`211`), Ethiopia (`251`), DR Congo (`243`) |
| Other Africa | Nigeria (`234`), Ghana (`233`), South Africa (`27`), Cameroon (`237`), Senegal (`221`), Ivory Coast (`225`), Chad (`235`), Burkina Faso (`226`) |
| International | UAE (`971`), USA/Canada (`1`), UK (`44`), India (`91`), China (`86`), Japan (`81`), South Korea (`82`), Singapore (`65`), Germany (`49`), France (`33`), Italy (`39`), Spain (`34`), Netherlands (`31`), Australia (`61`) |
| Named regional routes | Saudi Arabia (`966`), Kuwait (`965`), Qatar (`974`), Malaysia (`60`), Thailand (`66`), Philippines (`63`) |

Yoola lists USA and Canada as one `+1` route; the helper follows that shared prefix. Generic entries such as "more countries" do not establish further supported prefixes. These published destinations still require international route activation on the owner's Yoola account. An unavailable or rejected provider route fails safely and does not verify the member. Add other countries only after Yoola confirms the exact supported route.

## Development and failure handling

Configured Yoola credentials enable real SMS and WhatsApp delivery in both development and production; `NODE_ENV` does not gate delivery. Missing credentials cause delivery to fail with a generic safe error. The same code lifecycle and account limits apply in both environments. Credentials and plaintext codes are never logged, and codes are never returned in public responses or persisted as plaintext. Automated account tests inject a delivery dependency to capture their own synthetic codes. Adapter tests inject `fetch` and use invented numbers and credentials; they never contact Yoola.

Requests use fixed HTTPS endpoints, refuse redirects, bypass caching and have a ten-second timeout. HTTP errors, invalid responses, provider rejection, and transport failures produce a generic safe error. Provider response bodies and codes are never logged. An accepted request means Yoola accepted delivery; it does not prove handset receipt. There are no automatic retries because a timed-out request may already have been delivered and billed. A user can explicitly request a new code within the application's request limit.

Run the isolated adapter checks with `node --conditions=react-server --test tests/yoola-messaging.test.mjs`.
