# Manual accounts: no messaging gateway

SMS and WhatsApp verification/activation gateways are retired. No messaging-provider credentials, authentication templates, external gateway, OTP delivery, or automated message is needed.

Members register with their phone number and password. Forgot Password submits an admin request; an admin verifies identity and shares a temporary password manually. Subscriptions unlock only after payment proof is approved in the admin dashboard.

Call admin and optional support-chat links are user-initiated contact options. They do not send messages automatically or activate accounts.

Use [member-authentication.md](member-authentication.md) for account recovery and environment-managed admin login, and [subscriptions.md](subscriptions.md) for receiving numbers and manual approval. Old `GOAL_HINT_SMS_*` and `GOAL_HINT_WHATSAPP_*` environment entries are ignored and are not retained by runtime policy; remove them from deployment configuration when no longer needed elsewhere.
