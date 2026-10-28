# Public slip summaries and access actions

## Scope

- Show total odds and whole-slip win probability in Best Slips headers for every
  visitor while retaining subscriber access for matches and selections.
- Replace the subscriber-only paragraph with one action: Log in to access for
  signed-out visitors, Subscribe for members without access, or the matches for
  entitled members.
- Preserve login/sign-up switching, safe return paths, collapsed summaries,
  probability ordering and fresh entitlement checks.

## Implementation

- Update the explicit service/API allowlist for public aggregate fields.
- Share summary formatting and fact components across previews and full slips.
- Allow the subscription navigation helper to select login for this screen,
  retaining registration as its existing default elsewhere.
- Use the final fresh viewer state for both data gating and the access action.

## Verification

- All 97 focused Best Slips, stored publication, paywall/navigation,
  authentication and slip-probability tests passed without skips.
- Full ESLint, TypeScript and the optimized production build, including its
  offline manifest, passed.
- The isolated production fixture passed 668 HTML, React flight, API, history,
  insights, oracle and private-route checks across nine viewer states. Public
  aggregates remain identical while private match data stays gated, including
  two access changes during a stored read.
- Five Best Slips rendering scenarios passed: guests, signed-in members without
  access, entitled members, 100 slips and limited coverage. Summaries remain
  collapsed, ranked, keyboard accessible and free of competing header links.
- Playwright confirmed the guest action opens Login, switching to Sign up keeps
  the Best Slips return path, and public odds/probability plus the single access
  action fit at 390 and 1280 pixels without horizontal overflow.
- Browser checks also confirmed signed-in members without access reach
  Subscribe, while entitled members expand their original matches and have no
  access action. No hydration errors occurred in the isolated fixture.
- A live entitled-to-anonymous cookie change was picked up by the existing
  automatic refresh: private match nodes and slip IDs disappeared, aggregate
  odds/probability remained, and the login action returned.
- Updated a stale oracle-redirect assertion to allow the explicit safe
  `picks=all` default introduced by the unified match filters. Private-data
  assertions remain in force. The compiled fixture was reused for the rerun.
