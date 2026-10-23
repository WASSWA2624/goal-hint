# Synthetic owner acceptance app

Launch with `python scripts/verify-owner-payments-rendering.py --serve`. The script builds the isolated production fixture, runs its HTML and API assertions, and prints a local browser URL. All accounts, payments and actions are scripted; no business database or messaging provider is used.

Open the printed `/api/fixture/session` browser entry once to establish the fixture's synthetic administrator member cookie. The production dashboard guard verifies that cookie; legacy owner cookies do not grant access. The fixture uses an isolated synthetic allowlist and never changes the developer's environment or real accounts.

To repeat checks against an already built fixture, add `--fixture .tmp/owner-payments-<id>`. Omit that option after application changes so the fixture is rebuilt with current sources.

- `/admin/subscribers` shows six synthetic records with Open, Blocked and Erased account states and different last sign-in dates.
- `/admin/subscribers?accountId=00000000-0000-4000-8000-000000000100` preserves the original account detail and management actions.
- `/admin/subscribers?accountId=00000000-0000-4000-8000-000000000103` selects the blocked account.
- `/admin/subscribers?accountId=00000000-0000-4000-8000-000000000104` selects the erased account.
- `/admin/subscribers?fixture=empty` starts with no directory records.

Search by `0700000101`, `+256 700 000 204`, or `+44 7700 900123`. Search sends the number in the POST body and normalizes it before filtering. `256700000999` has no results; a blank search restores all six records. The directory state describes account availability; it does not infer paid subscription access. Existing Payments, Codes, Overview, password-request and Audit fixtures remain available.

Subscriber actions now persist in memory across refreshes. The script exercises notes, block/unblock, signing out devices, temporary passwords, access transfers, erasure, deletion and manual creation/grant/extend/revoke, then restores the original six records before browser checks. Use the collapsed **Synthetic acceptance controls** below Subscribers to reset again. The guarded fixture-only endpoint `/api/fixture/subscribers` provides a redacted snapshot on GET and resets on same-origin POST; no tokens, password hashes or temporary passwords are stored in that snapshot.

Focused browser checks:

- At desktop width, confirm the selected account's narrow directory, compact summary, six action buttons and four tabs. At phone width, use **Find account** and confirm the forms fit the viewport.
- Switch tabs with clicks and arrow keys; only the selected tab's content should be mounted. Open each action, cancel it, and confirm focus returns to its toolbar button.
- Save a changed note, block/unblock with a reason and sign out the two synthetic devices. Refresh to confirm updated state.
- Grant access to the selected fixed phone, then use Access to extend/revoke a period. **Add subscriber** can create a synthetic record for `256700000999`.
- Use Change number with `256700000777`, a verification method and confirmation. Remaining access moves to that new account; the old phone stays on its old account with revoked periods and locked devices.
- Reset the password after confirming the caller. The synthetic password appears once, signs out devices and disappears after Done; the fixture never sends it anywhere.
- Delete account opens a contextual panel with an unchecked confirmation. **Erase personal data instead** retains accounting history; permanent deletion removes the selected account's related synthetic records. Reset the fixture afterward.
