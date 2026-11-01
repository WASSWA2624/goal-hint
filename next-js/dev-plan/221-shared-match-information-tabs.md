# 221 · Shared match information tabs

## Intended result

- One selected information tab below Prediction on mobile and desktop. Put Team
  Stats, Markets & Odds, Lineups, Form & H2H and Analysis first; retain Events,
  Standings, Players, News, Match Info, Referees and Pick History.
- Scroll the mobile tab strip horizontally, support keyboard navigation and retain
  URL filters, player/result links and the existing access rules.
- Keep markets on one row with their selection, probability and available odds.
- Put the mobile Venue dropdown before the match-sample dropdown in Team Stats.
- Combine recent form and H2H behind a team/meetings selector. Show every result
  as date, actual home team, regulation score, actual away team, and club outcome.
- Preserve the full mobile pitch and selected team sheet. Remove the schematic
  caption and add supplied nationality, age and fixture-rating display modes.
  Missing values remain explicit; ratings are never derived from probability or
  substituted with season/career averages. Optional fields preserve old snapshots.

## Validation

- All 44 focused navigation, insight, detail and completion/access tests passed.
  Legacy links and optional player-field bounds have explicit regressions.
- Full TypeScript and scoped ESLint passed. The native production acceptance
  build passed; all 92 browser checks passed with no console errors.
- Verified 320px, 390px, tablet and desktop market rows, including supplied odds;
  both themes; native dropdown persistence; all tabs; keyboard scrolling;
  result order; H2H filtering and Back; full pitch/team switching and all five
  player display modes. Unfinished guest access remains restricted.
- Reviewed the native screenshots. The review server at localhost:3118 now runs
  the verified fixture with live reload, so shared source edits appear automatically.
  Synthetic player profiles and odds exist only in the labelled
  browser fixture; no provider facts, database migrations or paid fetches were added.
