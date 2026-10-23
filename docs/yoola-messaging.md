# YoolaSMS member messages

Goal Hint generates and checks six-digit codes. Both account verification and password recovery use a rolling 24-hour lifetime, a maximum of three message requests per account and purpose within 24 hours across both channels, and only the newest issued code. Changing numbers does not reset the account allowance; a reused number also retains its recent requests. A code stops working after successful use or expiry. Password changes share a rolling 24-hour restriction; the administrator can assist a member who needs further help.

The delivery adapter uses Yoola's documented [SMS endpoint](https://yoolasms.com/api-integration) (`POST https://yoolasms.com/api/v1/send`) and [WhatsApp endpoint](https://yoolasms.com/api-integration-whatsapp) (`POST https://yoolasms.com/api/v1/send-whatsapp`). It does not call Yoola Verify: its [documented ten-minute expiry](https://yoolasms.com/sms-otp-verification-api) does not meet Goal Hint's 24-hour requirement. Code hashes, limits, expiry and consumption are enforced by the account service.

## Production setup

1. Create or use the owner's YoolaSMS account, copy the API key from its dashboard, and fund its credit balance.
2. Ask Yoola to enable transactional SMS delivery for account verification and password recovery. Also request activation of any international destination routes you will use; the provider enables these per account. The standard send API has no documented route parameter; routing is configured on the provider account.
3. Confirm WhatsApp authentication messaging is active for the account and the documented `yoola_otp_verification` template is available. Goal Hint sends this approved template with one parameter: its generated verification code. Users explicitly request a message on WhatsApp by selecting that delivery channel; that request is the consent supplied as `consent: "yes"` to Yoola.
4. Set server-only `YOOLA_SMS_API_KEY` in the production environment. Optionally set `YOOLA_SMS_SENDER` to an approved alphanumeric sender ID. If omitted, Yoola supplies its default sender. Keep these values out of browser configuration and source control.
5. Deploy the application and its database migration, then perform an owner-authorized end-to-end delivery check with a phone you control on each enabled channel. Confirm receipt, code consumption, and resend behavior before opening registration to members.

The SMS request sends JSON fields `api_key`, `phone`, `message`, and optional `sender`. The WhatsApp request sends `api_key`, `phone`, `template_name: "yoola_otp_verification"`, `template_params: [code]`, and `consent: "yes"`. The registered phone is a single canonical number with its country code and no leading plus.

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

External delivery is enabled only when `NODE_ENV=production`. Development requests exercise the same code lifecycle but the adapter performs no external request and does not print, return, or persist a plaintext code. Automated account tests inject a delivery dependency to capture their own synthetic codes. Adapter tests inject `fetch` and use invented numbers and credentials; they never contact Yoola.

Requests use fixed HTTPS endpoints, refuse redirects, bypass caching and have a ten-second timeout. HTTP errors, invalid responses, provider rejection, and transport failures produce a generic safe error. Provider response bodies and codes are never logged. An accepted request means Yoola accepted delivery; it does not prove handset receipt. There are no automatic retries because a timed-out request may already have been delivered and billed. A user can explicitly request a new code within the application's request limit.

Run the isolated adapter checks with `node --conditions=react-server --test tests/yoola-messaging.test.mjs`.
