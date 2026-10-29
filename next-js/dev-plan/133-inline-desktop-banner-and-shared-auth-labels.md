# 133 · Inline desktop banner and shared authentication labels

## Scope

Apply selected concept 01, Inline invitation, only to the desktop subscription
banner. Synchronize copy, pricing and destinations with confirmed private session
state. Preserve mobile banner styling, expiry display and behavior. Standardize
Sign in / Sign up / Sign out across application copy without changing endpoints.

## Implementation

- Keep desktop presentation separate from the existing mobile status design.
  Use a 38px strip with square text actions directly below the header divider.
- Resolve loading, signed-out, unsubscribed, pending, expired and active states
  from the existing session store; reuse its polling and expiry refresh behavior.
- Use current plan pricing from the private subscription summary, safe account
  return destinations, account actions for guests, and no repeated subscription
  sales for active subscribers. Keep account-page duplication suppressed.
- Add canonical authentication keys and migrate forms, navigation, account,
  slip access actions, galleries, administrative copy and relevant messages.
- Update the gallery to show the applied selection and document the behavior.

## Verification

- Full application ESLint and TypeScript checks passed. Follow-up lint also
  passed for the final shared prose and desktop presentation changes.
- 127 focused authentication, session, subscription, payment-notification and
  analytics tests passed, including all six new banner-state tests.
- Production banner fixture build and eleven SSR/private-session scenarios
  passed. Account fixture production build and HTML/API acceptance passed,
  including canonical form headings/submits, preserved endpoints, header links,
  sign-out, recovery, role gates and cookie clearing.
- Browser acceptance passed loading suppression and thirteen scenario/transition
  checks, including pending payments, exact state changes, closed sales, changed
  prices, missing prices, temporary failure retention and sign-out. Safe account
  return links were checked. Desktop geometry passed at 1024/1280/1440px: 38px
  banner, zero header gap and no overflow. Existing mobile status remained visible
  without the desktop design or overflow at 320/390/768px. Screenshots inspected.
- The broad unit suite was run and did not pass. Two stale private-route test
  arrays were corrected to include the existing `/api/slips/:path*` rule and their
  targeted checks pass. Known remaining pre-existing failures reproduce in
  unchanged `seo-metadata.test.mjs` (outdated source-order regex) and
  `slip-cohort.test.mjs` (75% default versus a 60% fixture). No production SEO or
  slip-generation behavior was changed to address those failures.
- Full application production build and database integration suites were not
  run; the changed UI/authentication surfaces have production fixture builds and
  focused behavior coverage. No database schema or API contracts changed.
