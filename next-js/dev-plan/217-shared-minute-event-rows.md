# 217 · Shared-minute match events

## Goal

Place home and away incidents from the same minute on one row, with a single
central time label, to use desktop space more efficiently.

## Implementation

- Group consecutive events by recorded base minute and added minute after period
  dividers are inserted. Keep unknown times separate and never cross a divider.
- Render the two team columns around one clock. Keep every incident and preserve
  latest-first order within each column, including multiple events for one team.
- Reuse the grouping and incident components on desktop and phone. The incident
  count, source notices, period markers and access rules retain their meaning.

## Verification

- All 55 focused event, Touchline, detail-page, completion/access and live-read
  tests passed. The grouping tests cover repeated incidents for both sides,
  input immutability, distinct added minutes, missing times and period boundaries.
- Full application TypeScript and scoped ESLint passed.
- The isolated native Next.js production build and all 16 observation-rendering
  states passed. One cold-start readiness attempt timed out; its retry passed
  without code changes.
- Browser acceptance passed at 1440px and 1280px desktop and 390px phone, with no
  console errors or horizontal overflow. The 15-incident fixture has 14 minute
  rows: its two 74-minute substitutions share one clock and a single horizontal
  row under 40px. All source incidents, access boundaries and phase markers remain.
- Light and dark themes passed; yellow/red symbols keep their physical colours.
  Preview records are synthetic, not evidence of live provider coverage.
