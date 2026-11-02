# 238 · Clear stale app caches

- Repair the incomplete local dependency installation before database maintenance.
- Keep the existing bounded cache transaction and add `cache:reconcile -- 1000 --all`
  to drain the backlog in one Node process/pool, with a finite pass limit and
  accurate aggregate counts. Each transaction keeps its original batch bound.
- Diagnose missing maintenance runtime dependencies without exposing private errors.
- Clear disposable local build, browser and native WebView caches while preserving
  accounts, payment records, saved content, private configuration and linked worktrees.
- Verify the actual cleanup counts and cache locations, run focused regression
  checks, and commit only these maintenance changes to `main`.

## Verification

- 34 focused checks pass (nine Python and 25 JavaScript), covering bounded/default
  maintenance, backlog draining, cache freshness, private database authorization,
  invalid argument redaction, the pass limit and safe startup diagnostics.
- Scoped lint and TypeScript compilation with incremental output disabled pass.
- The verified local MySQL instance had 172 expired cache responses and three
  pending invalidations. Maintenance removed all 172 responses and acknowledged
  all three invalidations. All 26,321 journal rows were retained. Member, payment
  and saved-slip counts stayed at 2, 1 and 0 respectively. The repaired application
  service verifies readiness and reports zero expired responses/pending work.
- A same-user limited helper followed the existing MSIX administration runbook
  to verify the real database UUID/port/datadir and quarantine the real native
  WebView profiles. Both native profile paths and the appearance cache are absent.
  Generated build/cache files and profile backups remain local and ignored.
- Chrome confirms `goalhint.com` has no usage data. Computer Use stopped when it
  could not confidently verify the current browser URL during the localhost
  check; localhost browser storage remains unverified.
- After dependency restoration, the owned demo drain acknowledged all 1,397,822
  remaining invalidations. All 1,444,822 journal rows were retained, no expired
  responses remain, and member/payment/saved-slip counts stayed at 52/48/96.
  The owned MySQL session shut down cleanly after verification. Fresh build output
  created by startup verification was also moved out of the active `.next` path.
- Before dependency repair, the full Python suite ran 155 tests with eight
  failures in existing migration snapshot/trigger checks and dependency-dependent
  development/backup checks. The repaired launcher subsequently passed its 60
  checks; the focused maintenance checks above pass with restored dependencies.
