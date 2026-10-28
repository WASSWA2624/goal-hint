# Matches defaults and subscriber banner removal

## Scope

- Open Matches with All statuses, Today, Highest chance, all four markets, an
  empty search and no league, country, time, probability or odds constraints.
- Keep the existing access rules: Predictions only defaults to checked for full
  access and public Completed lists; it remains unavailable for other free lists.
- Remove the separate Predictions are for subscribers / Sign up feed banner.
- Preserve slip headers and match rows.

## Implementation

- Share the Matches date and sort defaults with Reset and mobile filter counts.
  Date & Time counts the selected date as one, plus any kickoff-time restriction.
- Preserve explicit URL choices, including Last 30 days and kickoff sorting.
  Keep public API defaults and dated archive dates/order unchanged.
- Remove the banner component and both responsive usages; keep prediction access,
  locked cards and subscriber-only controls unchanged.
- Update current help/documentation and existing navigation/reset assertions.
  Cover page defaults, actual route reads, time zones, explicit choices and access.

## Verification

- Targeted ESLint and application TypeScript checks passed.
- Relevant query, controls, state, pagination, navigation, route, discovery and
  paywall unit checks passed after updating page-link expectations.
- Production paywall fixture compilation and TypeScript passed.
- Browser checks at 320/390/768/1440px confirmed Today, Highest chance, four
  markets, banner absence and unchanged guest access, with no horizontal overflow.
- Explicit Last 30 days / kickoff and Completed's checked Predictions only were
  verified in the browser. Reset restored All, Today and Highest chance, retaining
  the browsing zone and restoring the guest's disabled Predictions only control.
- Align the access scanner with the existing public probability policy: protected
  picks/odds are still stripped, and redirects retain Today / Highest chance.
  All 668 raw HTML/RSC/API, oracle, history, insights, slips and private-route
  checks passed across nine viewer states, including banner absence.
- A broader run found an existing unrelated source-regex failure at
  `tests/seo-metadata.test.mjs:97`: it expects one access read in the Best Slips
  route, whose unchanged code now has initial and final access reads. Neither
  that test nor its production source is changed by this task.
- Existing detached worktrees and stashes remain intact. The owned browser and
  access-fixture server were closed; other servers remain untouched.
- Commit intended changes and push main after final verification.
