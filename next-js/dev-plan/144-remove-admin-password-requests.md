# 144 Â· Remove admin password requests

## Scope

Remove the admin Password requests section and every admin-assisted password
reset path. Preserve user-initiated Forgot password and signed-in Change password,
including verification, rate limits, one-device sessions, and account protections.

## Implementation

- Remove the menu entry, page, count query/context, badges, request components,
  manual reset forms, temporary-password reveal state, and subscriber reset action.
- Reject the former subscriber temporary-password operations; remove their service
  methods, credential generator, demo state, and temporary-password login branch.
- Keep account recovery codes, reset-only cookies, current-password checks, and
  the password-change cooldown. Stop writing admin request queue timestamps.
- Remove the three obsolete account columns and queue index through a forward
  migration. Preserve verified-code recovery for unfinished legacy resets using
  an invalid hash marker, without accepting old credentials or changing regular
  hashes, unregistered stubs, erased accounts, or historical audit records.
- Clean active documentation, help/privacy copy, galleries, fixtures, and tests.
  Keep immutable historical migrations and legacy audit-event interpretation.

## Verification

- Prisma client generation and schema validation passed; application type checking
  passed.
- Focused authentication/admin unit tests: 84 passed before integrating the
  concurrent Settings/Subscriber commits. Latest integrated authentication,
  admin-route, navigation, deletion, and directory run: 75 passed, 1 failed.
  The failure is an existing source assertion requiring literal `method="post"`
  in unchanged `code-tools.tsx`; the production/preview conditional method is
  already present in HEAD. No password workflow failed.
- Isolated MySQL migration regression passed, including preserving ordinary hashes,
  recovery for pending/consumed legacy resets, untouched unregistered/erased rows,
  historical audit data, and removal of obsolete columns/index. Authentication,
  single-device session races, saved slips, and wallet checks passed.
- The broader legacy MySQL run reported 52 passed, 10 failed, and 1 opt-in demo
  skipped (63 reported cases). Remaining failures use pre-existing access-code
  return contracts or empty-plan assumptions; production access-code services and
  default plan seeds were not changed by this cleanup.
- Admin and member production fixture builds passed normal TypeScript checking
  and HTTP/API acceptance, including route/session protections and subscriber
  operations.
- Browser checks passed at desktop and mobile sizes: no Password requests menu,
  retired page returns 404, retired mutation returns 400, remaining navigation
  works, verified-code Forgot password completes, and signed-in Change password
  retains current/new password fields. No page errors were observed.
- The migration was first exercised against a disposable MySQL instance. The
  running local application database was subsequently migrated as recorded below.
  Hosted environments still require the migration alongside this application version.

## Local migration follow-up · 29 October 2026

- Applied `20261029120000_remove_admin_password_requests` to the ownership-verified
  `goal_hint_demo` database used by the running localhost:3000 application. The
  persistent configured MySQL instance and hosted databases were untouched.
- Saved and authenticated an encrypted checkpoint of the affected account columns
  before deployment. Prisma records the completed migration with the exact source
  checksum, and its migration history is current.
- Verified removal of the three retired columns and queue index. All 51 existing
  accounts, their ordinary password hashes, and sampled account/session,
  verification, payment, access-period, and audit table counts were preserved.
- Schema comparison matches the application models; the intentionally separate
  `DevelopmentDemoSourcePair` table remains intact.
- Real-database service checks passed for recovery-code generation and consumption,
  restricted reset authorization, password saving, old-password rejection,
  current-password checks, session replacement, and the 24-hour change limit.
  Verification delivery was captured locally; no external messages or notification
  outbox intents were sent.
- Reloaded the normal Next.js development worker so its cached Prisma client
  picked up the migrated schema. Process identity checks confirmed the original
  MySQL server and development launcher stayed running; the demo was not reseeded.
- The live localhost:3000 browser walkthrough passed ten checks: code recovery,
  password saving, sign-in with the new password, rejection of both old passwords,
  rejection of an incorrect current password, and successful signed-in password
  change, without page errors. Only Forgot password delivery used the injected
  local capture adapter; code verification, reset, change, and login used the
  actual running application's endpoints.
- Removed the temporary test accounts and their verification/session records.
  Final comparison with the authenticated pre-migration checkpoint confirms all
  51 original account identities and password hashes are exactly unchanged.
