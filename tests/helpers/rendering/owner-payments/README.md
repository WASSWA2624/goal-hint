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

Settings previews use the real Settings page, HTTP adapter and settings service over transactional in-memory rows. Open `/api/fixture/session?page=settings&scenario=writable` to establish the synthetic member cookie and enter Settings. The collapsed **Synthetic settings controls** below the page switches scenarios and resets their saved data. Each scenario has independent state, including after refresh:

- `writable`: complete payment/contact details; saves, phone normalization, shortcut clearing and mode changes work.
- `managed`: the eight payment/contact identity fields are read-only; the server refuses changes to them.
- `missing`: payment/contact details, an active plan and notice readiness are absent, so release requirements are shown.
- `requirements-race`: initial requirements pass, but an active plan disappears during a mode switch; the server returns a requirement error.
- `save-failed`: writes fail without changing the row or audit count.
- `saved-without-requirements`: the write commits, but its follow-up overview read fails; the successful response contains saved values without requirements. A reload can read the overview again.

Check saving and Undo, inline validation, mode confirmation and refusal, managed details, refresh persistence, narrow layouts and both themes. `/api/fixture/settings` exposes the synthetic row and audit count for guarded harness checks; a same-origin POST resets the selected scenario. Its selector cookie and `X-Settings-Fixture-Scenario` header belong only to this isolated test application.

Audit previews open through `/api/fixture/session?page=audit`. The real page receives 17 synthetic events spanning payments, access, accounts, settings, plans, sign-ins and maintenance. They include configured-administrator actors, legacy/system/subscriber actors, opaque references, a device-session hash and an unknown event. The stub applies exact-action filtering before newest-first ordering and the 100-row limit; `/admin/audit?action=payment_approved` contains one row, while an unrecognized action restores the full loaded window.

Check client search, category and period filters, clearing them, empty results, event disclosure and exporting only the filtered rows. Summaries should show friendly labels; session/device hashes must not appear in the interface or CSV. Non-session reference IDs may be disclosed. Row 9 is dated `2026-10-22T22:30:00Z`, which belongs to 23 October in EAT; row 17 is `2026-09-30T21:30:00Z`, which belongs to 1 October in EAT. These exercise civil-day filtering across UTC boundaries. All audit records and downloads are synthetic.

Payments review previews open through `/api/fixture/session?page=payments` or `/admin/payments?fixture=review`. This opt-in scenario adds three pending reports in total (Weekly 7 days, Monthly 30 days and Daily 1 day), one approved report, one reversed report, one rejected report and one superseded report. Pending is oldest first; reviewed history is newest first. The Monthly report includes a generated JPEG reading **SYNTHETIC PROOF**, served through the production authenticated screenshot handler and private response headers.

Approving and rejecting mutate the isolated in-memory reports, update pending counts and remain visible in the correct history after refresh. Approval validates the owner-entered transaction ID, network, amount and plan, detects already-approved IDs, and grants synthetic access. Rejection can purge the attachment. Notification success is simulated; no SMS, wallet or business database is contacted. POST `{"scenario":"review"}` to the guarded `/api/fixture/payments` endpoint resets this scenario; POST `{"scenario":"baseline"}` restores the original one-report fixture and 17 audit events. Opening the opt-in page again preserves decisions until reset.
