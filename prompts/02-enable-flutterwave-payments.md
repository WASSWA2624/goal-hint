# Enable Flutterwave payments

Start after the direct subscription checkout change has been implemented and reviewed.

## Goal

Enable automated Flutterwave checkout in development, testing, and production. Reuse the existing checkout, provider work, and database support wherever possible. Keep existing payment options usable where eligible.

## Scope

- Audit the current checkout, Flutterwave migration, runtime policy, and deployment tooling before adding code. The migration exists, `runtime-policy.ts` marks the settings inactive, and tracked `next-js/.env.example` provides five placeholders. A name-only check found all five declarations in `next-js/.env.test`. The ignored local `next-js/.env.development` and `next-js/.env.production` each declare the secret key and both webhook settings. Tracked `next-js/scripts/sync-hosted-env.mjs` currently accepts Flutterwave settings for staging only. Verify the active config paths and update that wiring as needed. Hosted configuration is unverified.
- Use the same names across environments: `GOAL_HINT_FLUTTERWAVE_PUBLIC_KEY`, `GOAL_HINT_FLUTTERWAVE_SECRET_KEY`, `GOAL_HINT_FLUTTERWAVE_ENCRYPTION_KEY`, `GOAL_HINT_FLUTTERWAVE_WEBHOOK_SECRET`, and `GOAL_HINT_FLUTTERWAVE_WEBHOOK_URL`. Use empty placeholders or secret references as appropriate. The user supplies test credentials privately for nonproduction and live credentials privately for production. Configure a separate provider webhook URL and webhook secret for each applicable environment. Check declarations by name only and keep credential values out of source, logs, reports, and other environments. Treat missing settings and placeholders as unconfigured.
- Verify the selected API and version, required credentials, webhook signature scheme, and merchant eligibility against official Flutterwave documentation. Check phone-only account compatibility, collection methods, and settlement requirements before exposing a method. Authenticate webhooks on the server. Use the provider's server-side transaction verification to check successful status, expected reference, amount, and currency against the stored checkout before activating access. Keep pending, cancelled, and failed attempts recoverable, and make retries and duplicate callbacks safe against duplicate grants.
- Retain production sales prerequisites, including published Privacy and Terms, an enabled public support contact, and applicable access and payment settings. Live enablement also requires actual live credentials and a configured production webhook. Verify production readiness without making a live charge.

## Completion criteria

- Verify sandbox configuration in development and testing, then complete an end-to-end sandbox payment through checkout, verified callback, access activation, and return. Exercise missing configuration, invalid signatures, duplicate webhooks, mismatched payments, and pending, cancelled, failed, and retried payments. Verify existing methods still work and an unready production environment stays gated.
- Report which environments were verified and any remaining hosted readiness blockers. Follow `AGENTS.md` for any UI changes and update root `APP_OVERVIEW.md` to describe the integration, remaining limits, and verified deployment status.
