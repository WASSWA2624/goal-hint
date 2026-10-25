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

After an administrator approves or rejects a payment, approves a credit top-up, or an auto-renewal buys a period from credit, Goal Hint sends one SMS to the registered account number using the same SMS endpoint and credentials. A separate payer number is never the recipient. An owner-recorded payment with a transaction ID also receives its approval notification; a free trial, a manual access grant without a recorded payment, a reversal or a number change does not.

Approval, rejection, credit and renewal messages use the same minimal account-update notice with guidance to sign in or contact the administrator. Payment references, decisions, amounts, credit balances, package names, subscription expiry and review reasons stay in authenticated account views. This limits the financial information visible to the gateway and in device notification previews.

### The outbox

Each of those decisions writes one `PaymentNotice` row in its own database transaction, so a committed decision always has its notice and a rolled-back one never does. The row holds the account, the decision kind and its payment or access period, its state and attempt count; it holds no phone number and no message text. Right after an owner decision commits, the request tries to send it at once and the admin notice reports the result. Renewals are not sent from the member's page: the worker's `members.ts notify` step (every five-minute cron slot, right after `renew`) or the next owner page load sends them, and every notice a crash, a timeout or an unconfigured process left behind.

A dispatcher reads the registered number under the account lock, claims the row with a 60-second lease and an attempt, sends outside any transaction, then records the answer under the account lock again, fenced by its lease. States:

| State | Meaning |
| --- | --- |
| `pending` | Waiting to send, or waiting for its next retry |
| `sending` | Claimed under a lease; a lease that runs out is recorded as `uncertain` |
| `accepted` | Yoola accepted the message. This is gateway acceptance, never proof that the member's phone received it |
| `failed` | Refused four times, invalid, or not sent within a day (`expired`) |
| `uncertain` | The request may have been accepted: never resent automatically |
| `skipped` | No registered number (an erased account) or a country Yoola does not serve |

The adapter classifies each failure without keeping provider text:

| Result | Classification | Outbox |
| --- | --- | --- |
| Timeout, network failure or refused redirect | uncertain | closed as `uncertain` |
| HTTP 5xx | uncertain | closed as `uncertain` |
| Other non-2xx HTTP status (400, 401, 429, …) | refused | retried |
| 2xx with an unreadable body, no status or an unknown status | uncertain | closed as `uncertain` |
| JSON status `error` or `failed` | refused | retried |
| JSON status `success` or `queued` | accepted | `accepted` |

Only a definite refusal is retried: up to four attempts with a jittered backoff that starts at five minutes and doubles up to an hour, then the notice fails. An uncertain send is never resent automatically, because it may already have been delivered and billed. These classes are an assumption about Yoola's behaviour (its refusal semantics are not documented); a refusal Yoola still billed could cost at most four messages. A notice not sent within a day of its decision fails as expired. A process without `YOOLA_SMS_API_KEY` (or with an invalid `YOOLA_SMS_SENDER`) leaves rows pending without spending attempts, so a worker missing the key never exhausts a notice that a configured web process could still send. **The worker's private environment (`deploy/.env.worker.production.local`) must hold `YOOLA_SMS_API_KEY` and any `YOOLA_SMS_SENDER`**, or only owner page loads send renewal notices.

The admin Overview shows **SMS notices to check**: notices refused and retrying, failed, unconfirmed, for an unsupported country, or waiting more than 15 minutes (which usually means SMS settings or the members worker need attention). **Send again** resets a failed or unconfirmed notice and sends it at once; the member may receive it twice if the earlier one arrived. **Dismiss** removes a closed notice the owner has dealt with. Both are audited (`payment_sms_resent`, `payment_sms_dismissed`). The members purge deletes accepted and skipped notices 7 days after they close, and failed or unconfirmed ones after 30 days; open rows are never purged. Erasure deletes an account's notices and permanent deletion removes them by cascade.

Every recorded outcome adds an owner audit event (`payment_sms_attempted`) with the decision and classified status. It does not contain the recipient number, message body, credentials or provider response, and none is written for an erased or deleted account. Notification failures never undo an approval, rejection, credit or renewal. The admin decision notice says `SMS accepted for delivery`, that the SMS is queued for an automatic send or retry, that delivery could not be confirmed and will not be resent automatically, that it could not be sent, or that the destination is unsupported or has no registered number. Payment decision notifications are independent of account-verification and password-reset code request allowances and work in both development and production.

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

Requests use fixed HTTPS endpoints, refuse redirects, bypass caching and have a ten-second timeout. HTTP errors, invalid responses, provider rejection, and transport failures produce a generic safe error, classified only as not sent, refused or uncertain (see the table above). Provider response bodies and codes are never logged. An accepted request means Yoola accepted delivery; it does not prove handset receipt. The adapter never retries, because a timed-out request may already have been delivered and billed; only the payment outbox retries, and only definite refusals. A user can explicitly request a new code within the application's request limit.

Run the isolated adapter checks with `node --conditions=react-server --test tests/yoola-messaging.test.mjs`.
