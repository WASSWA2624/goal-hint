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
- The migration was exercised against a disposable MySQL instance. The working
  application database has not been migrated; deployment must apply the forward
  migration alongside this application version.
