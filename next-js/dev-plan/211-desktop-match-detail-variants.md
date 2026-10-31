# 211 · Desktop match details review

## Goal

Create ten detailed desktop match-detail variants with an easy review switcher.
Keep the home/away arrangement, one featured prediction, and all other content
in eight clearly owned tabs. Production integration follows design selection.

## Implementation

- Build a local, dependency-free studio in `design/match-details-desktop/`.
- Use reusable rendering functions and the exported shared brand/radius tokens.
- Vary scoreboard composition, prediction layout, navigation and data density.
- Preserve selected tab, viewer and match status between variants, with direct
  review URLs, previous/next controls, a shortlist, and local review notes.
- Simulate visitors, unsubscribed members, paid access and earned referral access.
  Completed fixtures are public. Upcoming, live and postponed predictions require
  entitlement. Reuse the canonical completed-status helper; omit restricted
  predictions, odds, probabilities and predictive scenarios from API responses.
- Use clearly labeled synthetic facts, original club monograms, shirt fallbacks,
  two positional formation pitches, real table structures and match timelines.
- Keep featured selection out of other markets. Keep recent form, head-to-head,
  standings, events, lineups, venue/officials and analysis in their own tabs.
- Explain the existing eligible verified-registration reward (one day) accurately.
- Keep all account actions inside the local review and all output ignored.

## Verification · 31 October 2026

- Eleven HTTP access and existing production completed-match access tests pass.
  Locked responses exclude every predictive field and the source fixture module.
- All ten variants and eight tabs pass layout/containment checks at 1280px and
  1440px: 160 combinations, no horizontal overflow or browser console errors.
- All 160 variant/viewer/fixture-state combinations pass featured, market and
  analysis gating checks. The access/referral guidance appears exactly once.
- Browser interactions pass: 22 positioned starters, eight substitutes, shirt
  number/age/previous-rating modes, player profiles, H2H window/competition/ground
  filters, live statistics, event filters, market categories and explanations,
  account/referral guidance, focus return to the shared access panel, both tab
  keyboard orientations, URL refresh and Back, shortlist filtering/persistence,
  per-design notes and focus mode.
- Visually reviewed all ten desktop directions and detailed lineup, venue,
  head-to-head and locked market states. Supporting text tokens have at least
  4.5:1 contrast against their principal surfaces. Corrected a Windows UTF-8
  conversion issue and checked every review source for encoding artifacts.
- Node syntax and staged whitespace checks pass. No added dependencies or
  production build changes. Preview data and identity are simulated; production
  integration, provider collection and actual evidence links follow selection.
