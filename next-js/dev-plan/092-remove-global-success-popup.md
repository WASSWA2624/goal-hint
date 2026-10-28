# Remove the global success popup

## Scope

- Remove the fixed success popup and its Dismiss step throughout the app.
- Keep successful authentication redirects, single-device session replacement,
  and sign-out cleanup intact.
- Keep actionable inline errors, verification guidance and access details.

## Implementation

- Remove the global `MemberLoginNotice` mount from `OnlineRuntime`.
- Delete the notice component and its session-storage flash mechanism, including
  the login/sign-out producers and obsolete flash unit tests.
- Update the public client import-graph test to inspect the remaining online
  runtime rather than the deleted notice component.

## Verification

- All 52 targeted authentication and public import-graph tests passed, including
  signup/login destinations, one-device session replacement, failed credentials,
  verification and password recovery, and the public client dependency graph.
- A repository search found no remaining popup mount, flash producer/consumer,
  or Dismiss-message consumer. Remaining Dismiss actions belong to the admin's
  payment-SMS reconciliation workflow and do not present success popups.
- Full ESLint, TypeScript and the optimized production build passed. The offline
  manifest was regenerated with the obsolete notice component removed.
