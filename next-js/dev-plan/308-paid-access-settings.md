# 308 — Paid access settings

- Replace Off, Test and On with Off and On. Off opens paywalled content and tools to everyone. On uses valid account access and can optionally open premium content to all verified signed-in members.
- Make checkout readiness independent of the saved mode. Keep new production purchases gated by publication, support and the applicable plan and payment method. Keep existing payment requests actionable.
- Accept whole trial days from 0 to 366. Pause new trial activations when access is already free. Honor existing periods.
- Use the two authenticated sessions for account access and retire separate paid-device grants.
- Apply the forward MySQL and MariaDB migration before rollout. It converts Test to On, expands the trial duration and removes the separate device limit.
- Verify access checks, payment continuity, migration behavior and the admin UI on desktop and mobile in both themes.

## Local rollout on 12 November 2026

- Applied `20261111171000_paid_access_settings` to the configured local MySQL database at `127.0.0.1:3307`. After the deploy command timed out, applied the reviewed SQL and verified the new constraint and columns before recording the matching checksum with Prisma.
- The migration converted Test to On and preserved the existing 7-day trial and 90-day proof retention.
- Applied the two remaining local-engine migrations to the configured database. Both local databases now have zero pending or unfinished source migrations, and all recorded source checksums match.
- The running development dashboard uses the separate local football snapshot database. Confirmed that it has the migration and saved both On and Off through the dashboard. Restored its original Off mode, verified it after reload, and confirmed that a signed-out session received free content access.
