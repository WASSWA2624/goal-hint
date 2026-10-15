# Production SEO release — 15 October 2026

The owner explicitly instructed: **“Fix all and deploy changes to production.”**
This authorizes publication of the public football pages and deployment of the
reviewed fixes. It supersedes the earlier prelaunch indexing hold. It does not
claim that incomplete privacy/terms operating facts have been verified: those
pages retain their draft status and their own noindex controls.

## Changes

- Keep the canonical landing URL and server-rendered navigation stable through
  hydration. Device-local dates remain available through an explicit choice in
  Filters, including a return to East Africa dates.
- Cache bounded, pure timezone validation/day-bound calculations; load the date
  calendar on demand. Preserve DST and non-hour-zone behavior.
- Publish eligible production pages and root-level sitemap shards under the
  owner's explicit release authorization. Staging, filters, empty archives,
  unknown fixtures and forecastless match pages keep their existing policies.
- Read performance cohorts in batches of 1,000, with one repeatable-read snapshot,
  a shared 16 MiB payload budget and a maximum total of 31,000 fixtures. Counts
  are complete; accuracy metrics still require their separate evaluation policy.
- Replace MySQL-only JSON casts with the root `JSON_EXTRACT` operation supported
  by both MySQL and MariaDB. Stored JSON integrity uses the same representation
  as each database's inserted document. Existing migration history is unchanged.
- Deploy a separate private worker runtime with existing credentials and owner
  approvals. A five-minute cron uses `flock` and a 270-second timeout, preserving
  database job leases and provider budgets. The web bundle carries no provider key.
- Retain the earlier redirect, sitemap, forecast-disclosure and mobile-grid fixes.

The prior PageSpeed baseline was mobile Performance **64**, SEO **69**, LCP
**4.8 s**, Total Blocking Time **740 ms**. Post-deployment measurements and actual
deployment identifiers are recorded below after verification; no score of 100 is
claimed in advance.

## Verification and deployment evidence

Pending the final deployment checks. Diagnostic output is kept under the ignored
`.tmp/seo-production/` directory; credentials are never included in this report.
