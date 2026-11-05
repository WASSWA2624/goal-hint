# Authentication and home routing

## Approved scope

Preserve the existing UI while making Matches the app entry, Dashboard open
Overview, and account authentication use consistent URLs and session states.

## Implementation

- Route `/` and `/en` to `/en/matches`; give the existing Best Slips listing its
  own `/en/best-slips` route. Keep shared URL helpers, metadata, discovery, direct
  links and legacy filter links consistent.
- Use `/admin` as the administrator landing destination; explicit payment-review
  links still open their selected payment.
- Centralize account entry and completion paths. Ordinary authentication ends
  at Matches, with existing shared-slip and administrator review exceptions.
- Resolve verified, blocked, verification-only, reset-only, expired and unavailable
  sessions independently of subscription settings. Subscribe routes guests and
  restricted sessions to Account before reading prices or checkout state.
- Make verification's Back to login clear the restricted session and return to
  Login; normal member/admin logout still opens Matches.
- Bound account requests and retain useful errors after transport/response failures;
  do not automatically retry writes. Refresh private page content after identity
  changes in another tab or server revocation.

## Verification

Run focused server/client/navigation tests, production synthetic member-page
checks, and browser authentication journeys in light/dark themes and mobile/
desktop viewports. Run lint, type checking, unit tests and a production build
before integration. Test fixtures must not send messages or access a live database.

### Results

- Full lint and type checking passed. The production synthetic Account/Subscribe
  HTML and API acceptance checks passed.
- Light/dark desktop/mobile browser profiles passed 72 layout checks and 44
  authentication journey groups, with no browser page errors. These cover
  registration, required verification, recovery, failed login and retry, canonical
  destinations, admin Overview, logout, cross-tab identity changes, initial session
  races and browser Back. Representative screenshots were inspected; no styling
  was changed.
- Pinned Node 24.18.1 server/driver qualification also passed all 22 journey
  groups across desktop and mobile, with zero browser page errors. This reused
  the production fixture without rebuilding or changing the source.
- The initial full Node run reported 2,900 passed, five failed and one skipped.
  The obsolete homepage-streaming assertion was updated. Three fixture builds
  could not resolve Next through the isolated worktree's external dependency
  junction, and one unrelated 150 ms accounting-deadline assertion failed under
  host load. All five passed their final reruns.
- Final integrated checks in the native primary checkout passed all 174 tests
  on the repository's pinned Node 24.18.1, including authentication, sessions,
  navigation, SEO, loading, server/client import boundaries and not-found
  rendering. The initial broad run used the tool shell's system Node 26; no
  application runtime or dependency pin was changed.
- Final full lint, the standard Turbopack production build (including TypeScript
  and static generation), and offline-manifest generation passed on Node 24.18.1
  in the primary checkout. Database access was disabled. The build included the
  latest payment, prediction and community changes already on main.
- Python script tests reported 159 passed and six failed. Five failures compare
  pre-existing out-of-date schema snapshots; the sixth is a checked-in SQL overlay
  checksum compared against Windows CRLF bytes. The schema and migration files
  were unchanged by this authentication work.
- No live account, database, SMS/WhatsApp delivery or installed-app session was
  used. This verifies source behavior; it is not a production deployment.

## Coordination

Implementation is isolated in `codex/auth-routing`. Performance work owns its
benchmark/rendering optimizations and avoids these route semantics. Payment work
owns checkout components; this change only adjusts the Subscribe route's entry
guard. Integrate sequentially after the payment handoff, preserve active worktrees
and stashes, and update the overview with the final implemented behavior.

Implementation was merged into main after the other completed source changes.
Heavy validation ran sequentially with the performance audit; active performance
and payment OCR worktrees, existing stashes and unrelated screenshots are retained.
