# 213 · Adopt Touchline for desktop match details

## Goal

Implement the approved 01 Touchline desktop composition in the shared Next.js
application: home/away scoreboard, one featured prediction/access panel, and
eight accessible information tabs. Retain the existing phone experience.

## Implementation

- Use production projections, entitlement checks, URL navigation, theme tokens
  and section components. Keep design fixtures out of production imports.
- Group comparison/form, head-to-head, standings, lineups/availability, other
  markets, events, venue/officials, and analysis/news/record without duplication.
- Preserve deep links and revision-history state. Use keyboard-accessible sticky
  tabs and load only active section data, through existing deduplicated APIs.
- Keep completed forecasts public and unfinished forecasts restricted to paid
  or earned entitlement. One panel owns account/referral guidance; restricted
  tab content returns to it. Preserve server-side redaction and odds policy.
- Keep missing data explicit; never copy synthetic tables, rosters or reports.
- Show both desktop lineups on one horizontal pitch, defending left and right
  goals. Rotate supplied provider formation coordinates onto each team's half;
  show formations with the team identities and preserve clickable full names.
  Keep phone pitches unchanged. Tighten desktop header, prediction and tab
  spacing; group team-sheet provenance into one expandable disclosure.
- Verify real component rendering, desktop/phone behavior, access states and
  source/URL boundaries before committing intended files and pushing main.

## Verification · 31 October 2026

- Main application `npm run typecheck`: passed.
- ESLint on changed implementation, fixtures and verification scripts: passed.
- Forty focused URL, detail, completed-access, observation and Touchline
  tests: passed. Canonical terminal statuses govern public access.
- An isolated Next.js production build renders the actual route, components,
  store and HTTP handlers using validated sample projections: passed.
- All eight tabs at 1280px and 1440px: passed, without horizontal overflow.
  Both runs also verify keyboard tabs, filter/URL refresh, player profiles,
  Back navigation and the unchanged 390px phone drawer presentation.
- Sixteen browser access combinations (visitor, expired, paid and earned access;
  scheduled, live, postponed and completed): passed with no match-view errors.
  One access/referral panel is present; the featured family is absent from the
  additional-market list. The fixture's unrelated header-session read is stubbed
  and its absent offline worker is disabled during component acceptance.
- Sixteen raw HTML/flight and insight-handler checks: passed. Unfinished
  predictions never enter public HTML/flight; protected insight reads remain 403.
- Visually checked all eight native tabs, full-name formation shirts, partial
  standings, venue/referee facts and locked states. Shared form/team controls
  and section headings are not repeated. Missing grid coordinates retain the
  complete starter list rather than guessing player positions.
- Horizontal formation checks verify 22 starters on one pitch, both formations,
  left/right goals, own-half placement and non-overlapping markers in number
  and position modes. Geometry unit checks cover away rotation and unavailable
  coordinates.
- Updated the existing paywall rendering assertion for the new desktop access
  panel. Server authorization, provider rights, collection and phone access
  presentation are preserved. Full standings, ages, portraits, ratings, pitch
  measurements and manager records remain explicitly unavailable when absent.
