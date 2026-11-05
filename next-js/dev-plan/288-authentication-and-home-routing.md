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

## Coordination

Implementation is isolated in `codex/auth-routing`. Performance work owns its
benchmark/rendering optimizations and avoids these route semantics. Payment work
owns checkout components; this change only adjusts the Subscribe route's entry
guard. Integrate sequentially after the payment handoff, preserve active worktrees
and stashes, and update the overview with the final implemented behavior.
