# Stable performance period metrics

## Implemented

- Matches summaries remove outcome selection and list order/pagination from their aggregate query. All other applied cohort filters, timezone and exact date-time bounds remain authoritative.
- Lists and summaries share source generations with separate version identities. Late summaries are checked against the period version and viewer rather than the filtered row total.
- Confirmed Matches metrics survive status navigation while its result list updates. Changing period, cohort filters, source version or viewer invalidates the retained summary.
- Best Slips reuses the selected-period aggregate before outcome filtering. Status clicks retain dates and odds, clearing only list page/cursor. Applying odds preserves the selected period.
- Results & performance status cards filter the published-slip history without changing its period statistics or return metrics. History links retain the status; cancelled slips have their own category. Streamed status/pagination updates retain the confirmed history metrics and rows, with busy controls, until the next result arrives. Prediction summaries without a corresponding list remain read-only.
- Shared performance presentation, percentage denominators, entitlement checks and foreground progress behavior remain in place.

## Existing limits

- Legacy all-date Best Slips browsing scans a bounded archive and cannot claim complete all-history metrics; those counts remain unknown.
- Public published-slip history releases only completed original selections. Pending aggregate counts do not grant access to unfinished slip records.

## Verification

All 171 focused query, aggregate, response validation, navigation and history regression tests passed across the integrated source. Checks cover every outcome, empty lists, pagination, period changes, source invalidation and viewer changes. Targeted and full lint and integrated type checking passed. Browser verification uses the local demonstration server in both themes. Production deployment is separate from source integration.
