# 215 · Visual match events

## Goal

Replace the text-only event list with a compact, chronological football timeline:
home incidents left, away incidents right, newest recorded incidents first.

## Implementation

- Use distinct football, card, substitution and VAR symbols with accessible text.
  Preserve the supplied minute and stoppage time, player names, assists and
  decision details. Show incoming and outgoing substitutes explicitly.
- Reverse source sequence, preserving same-minute incidents and period boundaries.
  Keep unknown minutes unknown; do not reconstruct scores or invent milestones.
- Preserve attribution, independent source clocks, partial coverage, delayed
  observations and existing authorization. Reuse the timeline on phones.
- Keep source metadata in one expandable disclosure on the desktop events tab,
  with actual coverage/delay notices visible beside the timeline.
- Verify semantic event variants, ordering, team placement, desktop/phone layout
  and incomplete/empty/unavailable source states using labelled synthetic records.

## Verification · 31 October 2026

- Fifty focused event-presentation, message-count, detail, occurrence, access,
  observation, URL and pitch tests: passed.
- Route type generation and final TypeScript checks: passed. Scoped ESLint
  and whitespace checks: passed.
- Isolated native production build using the actual application components:
  passed. Fourteen rendering states cover the combined panel and dedicated
  Events view: live, partial, delayed, confirmed empty, unsupported coverage,
  retained final and missing snapshot.
- Browser checks at 1440px and 1280px: passed, including both team sides,
  newest-first source sequence, added time, all event symbols, On/Off names,
  VAR decisions, unknown minute/card handling and accessible source clocks.
  Both runs verify the existing 390px phone disclosure with all incidents.
- Unfinished guest events remain gated, and protected event details are absent
  from the native page's raw HTML/flight. No browser errors or horizontal
  overflow were observed in the passing runs.
- Visually checked light/dark desktop and phone layouts. Physical card colours
  remain yellow/red in both themes. Synthetic fixture/player data is labelled
  in the review controls and stays outside production imports.
