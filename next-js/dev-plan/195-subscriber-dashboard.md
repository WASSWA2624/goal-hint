# 195 — Subscriber dashboard

## Scope

Complete the existing Account page's subscription essentials: show the current
package's stored name and a short, member-safe payment/access activity list.
Keep expiry, time remaining, queued renewals, payment and security controls in
place. Custom Filters stays in Slip Builder. Referral statistics and reward days
depend on the separate referral ledger and are outside this change.

## Implementation

- Add an account-scoped, authenticated read using a consistent database snapshot.
  Read only safe projections; cap activity at ten entries. Recent decisions and
  reversals on older payments must still appear. Queued, expired and revoked
  periods must never supply the active package name.
- Show each payment's latest recorded status and each access grant/removal with
  its real timestamp. Do not present this summary as a complete audit trail.
- Reuse Account styles and locale messages, with readable empty/unavailable
  states and no extra dashboard navigation or placeholder referral values.
- Verify authentication, account isolation, date boundaries, deterministic
  ordering, bounded queries, privacy, server rendering and desktop/mobile layout.

## Verification

- `npm run typecheck` and ESLint on all changed TypeScript/JavaScript files
  passed. The final date-format change also passed both checks.
- Focused dashboard, subscription summary/expiry, member-session HTTP and page
  startup tests: **37 passed, one skipped**. The skipped genuine-MySQL suite
  needs a `MYSQL_TEST_SERVER_BINARY`; a new application-role dashboard case is
  included there, but real database execution remains unverified.
- `python scripts/verify-member-rendering.py --serve` built an isolated production
  member fixture and passed the existing member HTML/API checks plus new active,
  trial, queued, expired, closed-sales, empty, ten-record, private-account and
  unavailable dashboard assertions. Its duplicate whole-source typecheck is
  disabled; the production source passed the root typecheck separately.
- Playwright CLI checks passed at 1440px in light/dark themes, 390px in both
  themes, and 320px for overflow. Long package names wrap, timestamps include
  the year/EAT, active packages remain distinct from queued renewals, action
  targets meet 44px, and account actions remain reachable below fixed mobile
  navigation. No application runtime or hydration error was observed. The small
  fixture omits the service worker and builder route, producing expected 404s
  for those resources/prefetches.
- Screenshots under ignored `output/playwright/subscriber-dashboard-*` were
  inspected. Test fixtures use synthetic records, with no production account,
  messaging or database mutation. No schema migration is required.
- Updated feature-audit row 2: subscription/activity scope is delivered;
  referral statistics and earned-day balances remain dependent on row 3.
