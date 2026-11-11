# 302 Local live football and quota

Use the November snapshot as the starting point for real football development. Retire the old owned synthetic database after verifying preserved account and payment records.

- Start the existing football worker only against the verified loopback snapshot. Refresh schedules and results, batch match detail requests, and stop dedicated checks of confirmed final scores. Keep team and player observations with their fixture.
- Use the existing pre-match odds importer and a separate in-play feed and market catalog. Store changing prices and availability with their observation times.
- Report account limits and local usage by endpoint from the shared quota ledger. Check real coverage, quota and both odds feeds before relying on the setup for a full provider day.

The running local app passed the match page smoke test. The worker applied live
result batches and stored fresh match details. The first verified pre-match
projection covered 308 fixtures, and the shared in-play poll produced current
prices. Type checking, focused provider and poller tests, and isolated MySQL
result, odds, and quota checks passed. The daily schedule import completed all
eight dates. Its separate forecast selection encountered the commit timeout on
the initial large cohort. A full busy provider day is still needed to measure
steady quota use.
