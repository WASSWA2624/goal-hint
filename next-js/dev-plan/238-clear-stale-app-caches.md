# 238 · Clear stale app caches

- Repair the incomplete local dependency installation before database maintenance.
- Keep the existing bounded cache transaction and add `cache:reconcile -- 1000 --all`
  to drain the backlog, with a finite pass limit and accurate aggregate counts.
- Diagnose missing maintenance runtime dependencies without exposing private errors.
- Clear disposable local build, browser and native WebView caches while preserving
  accounts, payment records, saved content, private configuration and linked worktrees.
- Verify the actual cleanup counts and cache locations, run focused regression
  checks, and commit only these maintenance changes to `main`.
