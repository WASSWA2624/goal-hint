# 049 Controlled production deployment

**Feature:** Release the qualified application and verify production operation.

**Depends on:** [046-staging-deployment.md](046-staging-deployment.md), [047-shadow-qualification.md](047-shadow-qualification.md), [048-release-readiness.md](048-release-readiness.md).

**Source:** [App specification](../app-write-up.md), sections 5, 9, 11–15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, deployment runbook and latest release-readiness report. Deploy only the qualified build/configuration when every mandatory gate has passed and the required production infrastructure/action is authorized. Re-run checks invalidated by subsequent changes. Do not buy the domain, subscriptions or hosting, exceed spending caps, or treat this plan as proof that external services have been provisioned. If credentials/authorization are absent, complete reviewable deployment preparation and record exact blockers without claiming the app is live.

Use the reproducible staging-tested configuration and safe database migration procedure. Take/verify the required backup and rollback point; preserve immutable forecasts and database compatibility. Configure server secrets, durable workers, protected daily enqueue at 21:00 UTC, independent recovery, a single leased continuous poller and the persistent account-wide limiter. Coordinate any shared trial/staging/provider usage; a deployment cannot reset quota or grant another daily budget. Verify the active API-Football subscription and total payable cost remain within US$45 alongside separate operating caps.

Using available authorized domain infrastructure, configure `goalhint.com`, DNS, HTTPS and canonical `www`/root redirects. Enable production indexing only after confirming canonical metadata and factual public pages. Keep ads disabled, English/light mode active and public features account-free. Enable owner-approved monitoring and expiry/recovery controls without inventing notification recipients.

Smoke-test public HTML/read APIs from a fresh session, private mutation rejection, health checks, image fallback and stored-data freshness. Verify schedules/leases through real observations where possible; record pending midnight or live-match observations honestly. Watch initial operation through an appropriate bounded observation period and apply the documented compatible rollback if release health fails. Never fabricate a production URL, successful cron run or populated forecast history.

## Acceptance checks

- Record actual deployment/build identity, canonical URL, HTTPS/redirect checks and safe migration result.
- Verify public access, secrets isolation, worker/poller ownership, budget state and monitoring health.
- Confirm real forecast/result behavior preserves publication, lock and settlement invariants.
- Record rollback readiness and any outstanding time-dependent observations with an owner.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Update `docs/development-progress.md` with changed files, actual deployment/check results, evidence and blockers. Record release/rollback decisions in `docs/implementation-decisions.md` and finish the production operations runbook.
