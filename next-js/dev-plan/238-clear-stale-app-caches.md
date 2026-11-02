# 238 · Clear stale app caches

- Repair the incomplete local dependency installation before database maintenance.
- Keep the existing bounded cache transaction and add `cache:reconcile -- 1000 --all`
  to drain the backlog, with a finite pass limit and accurate aggregate counts.
- Diagnose missing maintenance runtime dependencies without exposing private errors.
- Clear disposable local build, browser and native WebView caches while preserving
  accounts, payment records, saved content, private configuration and linked worktrees.
- Verify the actual cleanup counts and cache locations, run focused regression
  checks, and commit only these maintenance changes to `main`.

## Verification

- Ten focused Python tests pass, covering bounded/default maintenance, backlog
  draining, invalid argument redaction, the pass limit and safe startup diagnostics.
- The verified local MySQL instance had 172 expired cache responses and three
  pending invalidations. Maintenance removed all 172 responses and acknowledged
  all three invalidations. All 26,321 journal rows were retained. Member, payment
  and saved-slip counts stayed at 2, 1 and 0 respectively.
- A same-user limited helper followed the existing MSIX administration runbook
  to verify the real database UUID/port/datadir and quarantine the real native
  WebView profiles. Both native profile paths and the appearance cache are absent.
  Generated build/cache files and profile backups remain local and ignored.
- Chrome confirms `goalhint.com` has no usage data. Computer Use stopped when it
  could not confidently verify the current browser URL during the localhost
  check; localhost browser storage remains unverified.
- The owned demo cleanup helper failed before reaching its initial cache census;
  no demo cache changes were made and no demo MySQL process remains running.
- The full Python suite ran 155 tests with eight failures in existing migration
  snapshot/trigger checks and dependency-dependent development/backup checks.
  Root dependency restoration is owned by the coordinated dependency-repair chat.
