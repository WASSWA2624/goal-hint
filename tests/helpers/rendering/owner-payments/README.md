# Synthetic owner acceptance app

Launch with `python scripts/verify-owner-payments-rendering.py --serve`. The script builds the isolated production fixture, runs its HTML and API assertions, and prints a local browser URL. All accounts, payments and actions are scripted; no business database or messaging provider is used.

To repeat checks against an already built fixture, add `--fixture .tmp/owner-payments-<id>`. Omit that option after application changes so the fixture is rebuilt with current sources.

- `/admin/subscribers` shows six synthetic records with Open, Blocked and Erased account states and different last sign-in dates.
- `/admin/subscribers?accountId=00000000-0000-4000-8000-000000000100` preserves the original account detail and management actions.
- `/admin/subscribers?accountId=00000000-0000-4000-8000-000000000103` selects the blocked account.
- `/admin/subscribers?accountId=00000000-0000-4000-8000-000000000104` selects the erased account.
- `/admin/subscribers?fixture=empty` starts with no directory records.

Search by `0700000101`, `+256 700 000 204`, or `+44 7700 900123`. Search sends the number in the POST body and normalizes it before filtering. `256700000999` has no results; a blank search restores all six records. The directory state describes account availability; it does not infer paid subscription access. Existing Payments, Codes, Overview, password-request and Audit fixtures remain available.
