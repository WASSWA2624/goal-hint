# Account verification and messaging setup

Account verification and self-service password recovery use the existing delivery channels. Configure server-only YoolaSMS credentials and supported SMS/WhatsApp coverage as described in [yoola-messaging.md](yoola-messaging.md).

Members register with their phone number and password. Forgot password verifies control of the registered number before allowing a new password; signed-in password changes require the current password. These account flows do not create admin tasks. Subscriptions continue to unlock through the existing payment approval and account-credit processes.

Call admin and optional support-chat links are user-initiated contact options. They do not send messages automatically or activate accounts.

Use [member-authentication.md](member-authentication.md) for account recovery and environment-managed admin login, [subscriptions.md](subscriptions.md) for receiving numbers and payment approval, and [yoola-messaging.md](yoola-messaging.md) for current delivery configuration. Keep provider credentials out of client bundles and committed files.
