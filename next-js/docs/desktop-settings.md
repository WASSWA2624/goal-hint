# Desktop settings

The desktop Settings workspace keeps its title and five section switches above
the form, with Undo, Save changes and save status in a visible footer. Form content
scrolls independently. The existing mobile heading, four tabs, forms and save dock
retain their layout; the new management interfaces are desktop only.

## Support contacts

Support accepts up to eight labelled phone numbers with MTN, Airtel or Other
network labels. Choose calls, WhatsApp, or both, customer visibility and an optional
primary number. Reorder or remove contacts. Duplicate numbers must be combined in
one contact. Customer desktop screens show every enabled contact with its methods.

A null directory uses the existing configured call and WhatsApp numbers. The first
explicit directory save makes the stored directory authoritative for support, while
payment receiving details retain their environment configuration. Primary capable
contacts supply the legacy compact/mobile links and message placeholders. An
explicit empty list has no fallback. While subscriptions are open, the settings
service refuses removal of the last usable contact.

## Access and display

MTN and Airtel payment dial codes remain visible beside their receiving details
on desktop. The optional mobile dial-code drawers keep their existing layout.

Subscriptions closed stops new payments; Testing opens development flows;
Subscriptions open accepts subscriptions. Protected predictions require valid
access in every mode. Mode changes have their own explicit confirmation and apply
independently of other unsaved fields. Trial duration applies to new accounts.

The copied-number setting controls desktop payment copying. Review time is a
customer-facing estimate rather than a processing deadline. The payment note is
extra payment-screen copy, separate from outgoing message templates.

## Messages

Events include account welcome after verification, account verification, password
reset, payment report received, payment approved/rejected, credit added and
subscription renewed. Welcome and report-received messages initially remain off.
Existing payment notices retain their generic default until the owner edits them.

Each ordinary event can be disabled or sent through SMS, WhatsApp, or both. Both
selected channels create independent durable dispatch claims. Authentication stays
required and sends through the channel explicitly requested by the member.

The variable picker and source list expose only values available to the selected
event. Templates use `{{variable_name}}`, for example `{{verification_code}}`,
`{{expiry_hours}}`, `{{payment_reference}}`, `{{amount}}`, `{{plan_name}}`,
`{{account_url}}` and `{{support_url}}`. Missing values, unknown variables and
oversized messages fail validation or dispatch rather than sending unresolved
tokens. Previews use synthetic sample data and never send a message. Codes remain
generated, checked and expired by authentication; settings store their placeholders.

SMS content is editable. WhatsApp uses a provider-approved template name and its
ordered parameters. Authentication retains the approved Yoola OTP mapping.
Transactional WhatsApp additionally requires explicit member consent, which can be
withdrawn in desktop account preferences and is cleared when the phone changes.
Account updates are sent only to the account's current verified phone number.
An unsupported destination, missing consent or unconfigured provider does not
produce a successful delivery claim. Provider acceptance does not prove receipt.

Email remains unavailable because accounts do not yet have verified email
addresses or an email delivery integration. Gateway credentials remain server-only.

## Deployment

Apply `20261029140000_desktop_settings_contacts_messages` before using the new
application build, regenerate Prisma and restart application processes. The
migration preserves existing queued SMS rows, adds nullable contact/template and
consent settings, and expands the notification channel/decision/state constraints.
Run the existing private `payments:notifications` worker with its approved gateway
configuration to dispatch queued messages. Saving settings never contacts a gateway.
