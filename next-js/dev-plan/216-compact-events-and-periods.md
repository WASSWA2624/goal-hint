# 216 · Compact events and match periods

## Goal

Use desktop horizontal space for compact incident rows and one event toolbar.
Add contextual half-time, added-time, extra-time and full-time dividers.

## Implementation

- Place names, assists, On/Off substitutions, decisions and comments inline
  beside recognizable symbols; wrap only when the available width requires it.
- Replace the repeated title/description/status rows with one compact toolbar,
  an icon legend, the event count and latest-first indication.
- Keep source sequence and all incidents. Insert period dividers using observed
  minutes, verified fixture status and the supplied live clock. Added time is
  separate from extra-time periods. No whistle minute, half-time score or
  announced added-time total is guessed.
- Keep source metadata and existing missingness/authorization behavior. Verify
  normal-time, half-time and extra-time cases, including direct penalties.

## Verification

- 53 focused event, Touchline, detail-page, completion/access and live-read tests
  passed. Period assertions cover normal halves, explicit added time, live
  half-time, extra-time intervals, direct penalties and abandoned matches.
- Full application TypeScript and scoped ESLint passed.
- The isolated native Next.js production build passed; all 16 stored-observation
  rendering states passed against that build.
- Browser acceptance passed at 1440px and 1280px desktop and 390px phone, with no
  console errors or horizontal overflow. Desktop incident examples fit rows no
  taller than 48px; the combined toolbar stays within 40px. Light and dark themes
  preserve physical yellow/red cards and accessible incident labels.
- Raw HTML/flight checks retain the unfinished-match access boundary. Completed
  observations remain public. The half-time example has no false full-time
  marker; the extra-time example shows its interval and final boundary.
- Preview data is synthetic. This validates the rendering and access behavior,
  not live provider coverage or exact whistle timestamps.
