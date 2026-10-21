# Local SMS and WhatsApp setup

WhatsApp is selected by default. Every verification form also offers SMS. The server never silently switches channels.
Both use the same five-minute challenge deadline and resend limits. Registration verifies the new account's number;
phone/password changes send to the currently registered number. No old password is required.

The ignored `.env.development.local` contains the local gateway fields and inherits the private `.env.local` permissions.
Paste credentials there, not into chat. Nodemon watches environment files and restarts the development app after saving.
The private administrator allowlist is stored separately in the existing `.env.local`, so operator commands use it too.

## SMS: Android phone with the hosted gateway

1. On the Android phone, download the official secure
   [SMSGate APK](https://github.com/capcom6/android-sms-gateway/releases/latest/download/app-release.apk).
   Install `app-release.apk`. If prompted, allow installation from that browser.
2. Open SMSGate and allow SMS sending. If you need to choose between SIMs, grant the requested phone-state permission.
3. Enable **Cloud Server**, then tap **Offline** to connect. Wait until it says **Online**.
4. Copy the generated Cloud Server username and password into these prepared fields:

   ```dotenv
   GOAL_HINT_SMS_GATEWAY_URL=https://api.sms-gate.app/3rdparty/v1/messages
   GOAL_HINT_SMS_USERNAME=<Cloud Server username>
   GOAL_HINT_SMS_PASSWORD=<Cloud Server password>
   GOAL_HINT_SMS_TOKEN=
   ```

5. Keep the phone connected to the internet with an active SMS-enabled SIM and sufficient balance. SMSGate's
   **Settings → System → Disable battery optimizations** helps keep delivery running in the background. Keep your usual
   messaging app as the default; no USB cable or separate gateway signup is needed for Cloud Server mode.

If Android greys out SMS permission, open **Settings → Apps → SMSGate → ⋮ → Allow restricted settings**, then grant SMS
permission. See the official [installation guide](https://docs.sms-gate.app/installation/),
[hosted-server guide](https://docs.sms-gate.app/getting-started/public-cloud-server/) and
[permission troubleshooting](https://docs.sms-gate.app/faq/errors/).

## WhatsApp: Meta Cloud API

SMSGate sends through the phone's SIM. WhatsApp codes use Meta's separate business messaging service; the recipient's
registered number must be on WhatsApp.

### Connect an existing WhatsApp Business app number

For a number already used in the WhatsApp Business app, use Meta's **Coexistence** onboarding to keep the app and its
history while adding automatic API delivery. Meta documents this route through a Solution Partner or Tech Provider
that supports business app number onboarding. Creating a developer app alone does not connect that existing number.

1. Sign in to [Meta Business Suite](https://business.facebook.com/) with the Facebook account that will manage Goal Hint.
   Select the existing business portfolio, or create one using the business's actual details.
2. Update WhatsApp Business on the phone and back up its chat history. Meta requires app version 2.24.17 or later.
3. Choose a provider from [Meta's partner showcase](https://business.facebook.com/messaging/partner-showcase) that supports
   **Coexistence / Connect an existing WhatsApp Business app**. Check its fees and integration credentials before
   connecting. Goal Hint currently calls Meta's Graph API directly; a provider offering only its own API requires a
   separate adapter. The provider must also handle the Embedded Signup and webhook requirements.
4. In that provider's Meta-hosted signup, select the business portfolio and the option to connect the existing
   WhatsApp Business app. Enter the business sender number. Meta checks the account's eligibility during onboarding.
5. Complete the connection on the phone using the official Facebook Business message and the instructions shown by
   Meta. Enter Meta's connection code in its signup flow, never in Goal Hint or chat. Review any optional history sharing.
6. Obtain the actual sender's Meta **Phone number ID** and a token authorized for `whatsapp_business_messaging`.
   Configure the private environment fields below, then create and approve the authentication template.
7. Test delivery to a separate WhatsApp recipient before testing account registration and security changes. Confirm
   arrival on the recipient's phone; an API acceptance response alone does not confirm delivery.

The ordinary delete-and-register migration is a different route: Meta warns that it loses messaging history and stops
the number working in the WhatsApp Business app until it is deregistered from Cloud API. Do not use that route when
the intent is to keep the existing app account. See Meta's
[existing-number migration guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/migrate-existing-whatsapp-number-to-a-business-account)
and [Coexistence requirements and onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users).

### Developer test connection and sender configuration

Meta's test sender can establish API connectivity while business sender onboarding is pending. It does not send from
the existing business number. After Coexistence onboarding, configure the real sender's credentials instead.

1. Open [Meta Apps](https://developers.facebook.com/apps) and sign in. Complete developer registration if prompted.
2. Choose **Create App**, enter **Goal Hint** and your contact email, then choose **Connect with customers through
   WhatsApp**. Select or create your business portfolio and finish creating the app.
3. In **Customize use case → Connect on WhatsApp → Quickstart**, choose **Start using the API**. Connect or create a
   WhatsApp Business Account in **API Setup**.
4. For the initial connection test, select Meta's test phone as **From**, add and verify your own WhatsApp number as
   **To**, generate a temporary access token, and send Meta's test message from that screen. Keep your personal number
   as the recipient. This test establishes connectivity; it does not replace the application's authentication template.
5. Record the **Phone number ID**, not the telephone number or WhatsApp Business Account ID, and the access token in
   `.env.development.local`:

   ```dotenv
   GOAL_HINT_WHATSAPP_ACCESS_TOKEN=<Meta access token>
   GOAL_HINT_WHATSAPP_PHONE_NUMBER_ID=<business sender phone number ID>
   GOAL_HINT_WHATSAPP_TEMPLATE_NAME=goal_hint_verification
   GOAL_HINT_WHATSAPP_TEMPLATE_LANGUAGE=en_US
   GOAL_HINT_WHATSAPP_API_VERSION=v25.0
   ```

6. In WhatsApp Manager's message templates, create `goal_hint_verification` in English (US), category
   **Authentication**, with a **Copy code** button, a **5-minute** expiration footer and **300-second** message delivery
   TTL. Wait for approval and confirm that the template is available to the selected sender. If the test account cannot
   create or use it, complete Meta's sender onboarding first; SMS testing remains available independently.
7. Temporary tokens expire. Replace the testing token with an appropriately permissioned system-user token when
   configuring a durable business sender. Keep its permissions and expiry under your control.

The exact template-creation body, if using Meta's management API instead of its UI, is:

```json
{
  "name": "goal_hint_verification",
  "language": "en_US",
  "category": "AUTHENTICATION",
  "message_send_ttl_seconds": 300,
  "components": [
    { "type": "BODY", "add_security_recommendation": true },
    { "type": "FOOTER", "code_expiration_minutes": 5 },
    { "type": "BUTTONS", "buttons": [
      { "type": "OTP", "otp_type": "COPY_CODE", "text": "Copy code" }
    ] }
  ]
}
```

Follow Meta's [getting-started guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
and [authentication copy-code template guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/copy-code-button-authentication-templates).
Provider acceptance does not prove delivery; confirm arrival on the recipient's phone.

## Administrator numbers and testing

`GOAL_HINT_ADMIN_PHONES` is a private JSON array of canonical country-code digits, for example:

```dotenv
GOAL_HINT_ADMIN_PHONES='["256700000001","256700000002"]'
```

Configured numbers use **Login → Administrator login** (or `/en/account?view=code`) and receive a code through the chosen
channel. No password or subscription is needed. A verified, unblocked member session opens the dashboard and all member
content; it persists across visits until logout or its ordinary session expiry. Removing a number from the environment
and restarting the server removes its administrative privileges. Entering a number alone never grants access.

Test SMS after saving SMSGate credentials, then test WhatsApp after its token, sender and approved template are ready:

1. Register a non-admin test number, select a channel, request a code, and enter the code received on that phone.
2. Open Account, change the password using a new code, and verify that the existing password is also accepted as the new
   password. No old-password field appears.
3. Change the phone using a code received at the currently registered number. Changing to another configured admin
   number requires that number's own login-code flow; an old-phone proof cannot claim administrator access.
4. Sign in with an administrator number through **Administrator login**, open the dashboard, and confirm that subscriber
   content is available without purchasing a plan. Log out to end the verified session.
5. Request a code and wait five minutes; confirmation must fail after expiry. Resend creates a fresh code. Switching
   channels shares the same resend cooldown and never extends an existing code's life.

On the development PC, use `http://localhost:3000/en/account`. From a phone on the same Wi-Fi, use the PC's LAN address
instead of `localhost`; the current address can be obtained with `Get-NetIPAddress -AddressFamily IPv4`. No live SMS or
WhatsApp message is sent by automated tests.
