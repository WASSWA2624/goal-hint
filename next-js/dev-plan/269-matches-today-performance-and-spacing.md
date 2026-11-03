# 269 — Matches performance period and spacing

- Default Matches performance to today's EAT reporting date, with the heading
  Today’s performance. Retain the existing 30-day browsing window. Outcome
  cards open today's matching results with the same cohort filters. Preserve
  explicit historical periods and legacy yesterday summary links.
- Reuse the compact performance header for Matches and Best Slips: align the
  title and period with the cards, remove bottom header padding and keep a 1px
  heading/card gap. Scope the reduced top title padding to Matches.
- Reduce search-row vertical padding to 2px on mobile and 4px on desktop,
  retaining shared control heights and theme tokens.
- Keep a clear, modest gap between performance and the results section. Group
  the Matches/Predictions header with the first match card so there is no gap
  between them on either screen size. Preserve pagination and search dividers.
  Reuse the match-card border tokens and one shared adjoining divider.
- Verify both themes, responsive geometry, native filter actions and actual
  reporting-date navigation. Update the overview and integrate on main.

## Verification

82 targeted tests passed, including EAT/device midnight boundaries, today's
result navigation, default/reset URLs, explicit archive periods and backward
compatibility for yesterday links. Application typecheck, focused ESLint and
the theme contract passed.

The production fixture build and streaming checks passed, including ten complete
dashboard states. Eight light/dark browser combinations passed at 320, 390,
1024 and 1440px. Checks covered aligned title/date edges, a 1px title/card gap,
20px mobile and 12px desktop separation before the results header, matching
frame tokens, a single adjoining divider, zero header/list gap, compact search
spacing, fitting layouts, native filter actions and restored focus. Today's
outcome navigation and accurate historical headings passed. Screenshots were
reviewed in both themes.

Two live mobile views also passed. An unavailable aggregate interrupted a live
desktop check; a later direct API read returned HTTP 200 with today's twenty
pending matches. The development server worker restarted during the final live
recheck, so complete responsive acceptance used the isolated production fixture.

Production fixtures use synthetic data; hosted deployment is separate.
