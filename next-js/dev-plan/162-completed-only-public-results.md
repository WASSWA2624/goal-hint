# 162 — Completed-only public results

## Scope

Guests and unsubscribed users may view only completed matches and slips whose
matches are all completed. A previous date alone never grants access.

## Implementation

- Use one canonical terminal-fixture predicate for match and slip access.
  Played finals, cancelled, abandoned and awarded fixtures qualify; live,
  scheduled, postponed and unknown fixtures do not.
- Public slip eligibility requires every original matched selection's completed
  result plus canonical fixture completion. Keep settlement separate from this
  access proof: early Lost or void/cutoff cycles cannot expose unfinished legs.
- Filter public cohorts before statistics and pagination in Best Slips, saved
  history, performance and Matches. Partition match caches by completion scope.
- Recheck entitlement after reads; re-read the correct cohort on tier changes
  so public pages/counts are exact and active selections cannot leak on expiry.
- Apply completion gates to shared-slip tokens and direct match detail/history
  APIs. Withhold unfinished forecasts, probabilities, prices and live data.
- Show one subscription notice for unfinished direct matches and explain the
  completed-only rule above public slips. Keep subscriber access unchanged.
- Use terminal completion for public card authorization as well as server
  gates, including cancelled fixtures; keep played-score finality separate.
- Keep confirmed defaults: Today for subscribers, Yesterday for public viewers.
  Fully completed results may be public today; unfinished old matches remain
  restricted. No database migration is required.

## Verification

- All 89 targeted slip unit/service tests passed, including public 150-row
  subsets, saved-history scans, performance statistics and shared-token expiry.
- The match scope passed 173 distinct targeted tests across runs, including
  canonical completion, source SQL/cache scope, public counts and insights 403.
- Independent TypeScript, scoped ESLint and the integrated production build
  passed. No database migration is needed. Two isolated MySQL integration
  checks skipped before startup because mysqld is unavailable; no real database
  was mutated by these checks.
- All 18 browser completion checks and 22 direct-match access checks passed,
  including early Lost/live legs and original void/current-live mismatches.
- The official raw HTML/RSC/API paywall fixture was updated to this policy so
  it no longer asserts the former public unfinished previews/probabilities.
  Its strict isolated production build passed, followed by all 695 transport,
  history, insights, completion, revocation and private-route checks across nine
  viewer states. The cancelled-card authorization regression also passed all
  five SEO card tests.
