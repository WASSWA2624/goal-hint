# 137 · Inline mobile subscription banner

## Scope

Apply selected mobile concept 01, Inline invitation, to the shared mobile
subscription banner. Keep its brief copy and actions on one physical row beneath
the header. Preserve the approved desktop presentation and all unrelated work.

## Implementation

- Keep mobile presentation separate while sharing confirmed subscription-state
  resolution, session refresh, expiry updates and safe account destinations.
- Use current server-provided offer prices and the shared authentication catalog.
  Associate the price with access, never with account creation.
- Show both authentication actions to signed-out visitors, a subscription action
  to members without access, and access confirmation to active subscribers.
  Retain appropriate actions for pending payments and expired access; suppress
  unresolved status and duplicate account-page messaging.
- Use a compact single row, square controls, a thin header divider and no gap.
  Keep complete readable labels and avoid clipping, ellipses or hidden copy.
- Mark option 01 Selected · Applied in the mobile gallery. Preserve all ten
  illustrative alternatives and keep preview actions and shortlisting local.
- Document live session/pricing behavior separately from illustrative samples.

## Verification

- Application TypeScript, targeted ESLint, Python syntax and whitespace checks
  passed. All 25 focused state, navigation, session and expiry tests passed.
- The production fixture build and thirteen SSR/private-session scenarios
  passed, including unresolved desktop/mobile suppression and real client hooks.
- Browser acceptance passed fifteen scenario/transition checks at five widths
  (320/360/390/430/768px) in both themes: 150 mobile combinations. Every visible
  mobile banner remained one physical text row and 44px high, with zero header
  gap, no clipping/overflow and action targets at least 24px.
- Live offer changes, absent pricing, the maximum supported UGX 10,000,000
  offer, pending/closed-sales states, temporary session failure retention and
  sign-out transitions passed. The narrowest width uses a 5px inter-item gap to
  fit the maximum price with full-size labels.
- Authentication and plan/payment/account destinations retain the safe return
  path and correct fragments. Account/subscribe visibility checks passed.
- Desktop regression checks passed at 1024/1280/1440px across five states. Its
  markup, copy, styles and 38px geometry are preserved; state and navigation
  helpers are now shared with mobile. Screenshots were inspected.
- Full application production build and database integration suites were not
  run. The isolated production fixture covers the changed surfaces; no schema
  or API contract changed. Unrelated admin work was preserved.
