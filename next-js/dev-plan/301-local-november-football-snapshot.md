# 301 Local November football snapshot

Download the available fixtures for November 1–30, 2026 in the Africa/Kampala timezone for offline development. Give November 11 through 4 first priority in reverse date order, followed by November 12 through 30 and then November 3 through 1 in reverse order.

- Try one date range for fixture lists and use daily lists if the provider rejects it. Enrich eligible matches in batches of up to 20 fixture IDs. Count requests through the existing quota gateway and retain completed pages locally so a retry can reuse them.
- Import provider identities, schedules, scores, status codes and available match details into a separate owned MySQL database. Record source coverage and retrieval times. Start the local app with its provider operations disabled.
- Verify the database against the downloaded fixtures and check the normal match feed and a completed match detail with outbound fetch disabled. Switch development to the snapshot after verification. Keep the prior demo database available for rollback.

The provider rejected the unscoped month range. The download used 296 quota requests, comprising the range attempt, 30 daily fixture lists and 265 fixture detail batches. Independent verification matched all 13,590 fixtures and their status codes across 30 dates. The normal match handlers returned the full fixture count and verified a finished match's score and statistics with outbound fetch disabled.
