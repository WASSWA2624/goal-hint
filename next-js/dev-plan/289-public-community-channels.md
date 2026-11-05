# Public community channels

## Scope

Make Community available to visitors and account holders independently of login,
subscriptions, configured URLs and navigation overflow. Use the shared dialog,
settings controls and light/dark themes.

## Implementation

- Default to six visible destinations: WhatsApp Group, WhatsApp Channel, Telegram,
  TikTok, X and Instagram. Preserve explicit per-destination visibility choices.
- Store an administrator-controlled `communityVisible` switch, defaulting to true,
  with the existing protected settings and audit flow. Add matching Prisma and
  MariaDB migrations; do not change production configuration from this task.
- Give Community its own Settings section with a URL and visibility control per
  destination. Channels without links remain visible as non-clickable rows with
  “Coming soon” copy. Configured destinations retain their Join/Follow links.
- Title the dialog “Join our community” with the shared group icon.
- Validate official HTTPS invitation/profile URLs and common share parameters.
  Omit hidden URLs from public responses and fail closed on storage errors.
- Reserve More menu space whenever Community is public, even with no ordinary
  overflow. Refresh settings after a successful save and quietly on focus/polling.
- Use recognizable monochrome brand glyphs from Simple Icons (CC0) with theme
  text colours and shared dimensions; retain square community rows.

## Verification

Check defaults, URL validation, visibility persistence, protected settings and
public API responses. Exercise the real components using the synthetic community
fixture: visitor/member/admin access, save/undo/reload, configured/blank links,
global/per-channel hiding, all-hidden state, keyboard focus, external launch,
mobile/desktop and both themes. Run relevant tests, lint, type checking and a
production fixture build. Record actual outcomes in the completion report.

Verified on 5 November 2026: 52 focused community, settings and navigation tests
passed; scoped ESLint, full type checking and Prisma validation passed.
The production rendering fixture passed browser checks at 320, 390 and 1440px
in both themes, including save/reload, undo, immediate refresh, global and
individual hiding, configured/empty links, all-hidden state and six intercepted
external openings, with no browser errors. These initial checks preceded the
follow-up change from homepage fallbacks to non-clickable “Coming soon” rows.
The database integration test was skipped because a genuine MySQL test-server
binary was unavailable. No production
database or platform membership was changed.

The follow-up passed 23 community/navigation tests, scoped ESLint and the fixture
build/type check. Browser verification passed at 320, 390 and 1440px in both
themes: the “Join our community” title and group icon fit, blank rows neither
navigate nor receive keyboard focus, and configured links still open. Save,
undo, reload, visibility and mixed configured/blank states passed with no browser
errors. No additional database migration is needed for this presentation change.

## Release

Apply `20261105110000_public_community_channels` before deploying the updated
application. Add real invitations/profile URLs in Settings → Community. The app
can launch an external destination; membership and platform availability remain
controlled by the destination platform.
