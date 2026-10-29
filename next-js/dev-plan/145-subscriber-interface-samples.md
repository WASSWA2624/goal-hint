# 145 · Subscriber interface samples

## Scope

Create ten reviewable Subscribers layouts with automatic general search,
compact filters and record summaries, network artwork, and modal action forms.
Reuse existing components and retain the live layout until a sample is approved.

## Implementation

- Add a public, non-indexed sample gallery with ten arrangements, direct sample
  links, theme controls, reset, and responsive directory/detail views.
- Reuse the real SubscriberDetail and its account forms through an optional
  compact dialog presentation, and the existing ManualCodeForm for adding access.
- Use one shared sample directory with automatic text search, account/access/
  package/recent-sign-in filters, immediate counts, and independent scrolling.
- Keep the title and add action aligned across the workspace; compress facts
  and action buttons so tabs follow immediately below the account summary.
- Present grant, number-change, restriction, and device actions as native modal
  forms with keyboard and focus behavior. Omit Reset password following the
  user’s clarification. Keep all sample actions on an isolated in-memory
  transport, including safe native form fallbacks.
- Use fictional carrier metadata and the existing MTN/Airtel artwork, with an
  unknown-network fallback. Do not infer carriers from payments or empty prefix
  configuration, or claim online status from coarse session timestamps.
- Keep the phone country picker within a native dialog’s interactive layer.
- Add an isolated production rendering fixture and verification script.

## Verification

- The scoped commit candidate passed an isolated production build, TypeScript,
  and server-rendered gallery checks for ten samples, shared controls, local
  artwork, unique IDs, safe native form actions, and the absent password action.
- Targeted ESLint and all 16 existing phone/country tests passed.
- Browser checks passed across all ten layouts at 320, 390, 1024, 1280, and
  1440px, including both themes (80 layout combinations). No document overflow,
  duplicate identifiers, clipped action buttons, or page errors were found.
- Automatic partial/local phone search, text and network search, combined
  status/access/package filters, recent-sign-in filtering, and selection/count
  updates were verified without admin API requests.
- Modal focus, Escape, return focus, safe GET fallbacks, country selection inside
  a native dialog, and visible form errors without stale feedback were verified.
- Sample grants, new accounts, blocking/unblocking, device sign-out, and number
  transfers updated only the in-memory records. Reset restored the samples.
- The broader working-directory TypeScript check encountered unrelated ongoing
  account-notification, message-template, and settings changes. The owner fixture
  built and passed subscriber checks, then stopped on an unrelated Payments
  response-shape assertion. These changes are outside this scoped commit.
