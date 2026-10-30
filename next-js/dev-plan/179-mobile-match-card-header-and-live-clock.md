# 179 — Compact mobile match header and live clock

## Request

Refine the chosen Team stack card everywhere a mobile match appears, including
Matches, Slip Builder and saved/Best Slips. Keep desktop rows. Move status to the top right, align scores with their teams just
before that column, and emphasize the match number. Under the badge, keep Odds,
Prob. on one row, then abbreviated market/pick on the second row beside the
teams, ending by the away-team row. Move the mobile slip header arrow to the
left and align its equally wide status badge with the match badges below.
Keep date, time and league on one row with league ellipsis and equal-width
status badges. Live badges show observed minutes, added time, halftime and
extra time.

## Implementation

- One shared `teamStackStyles` grid owns the mobile geometry in both adapters.
- Metadata never wraps: number, date, time, league; the league uses remaining
  width. Full competition names remain in accessible text and titles.
- Mobile match/slip statuses use the shared `mobileStatusWidth` (8rem, capped at 128px).
  At narrow effective widths match status moves to
  its own top row so the metadata keeps its single row.
- Home and away scores align with the corresponding team immediately before
  the status/facts column, with an additional 12px end gutter moving scores left.
  Team names never wrap into scores: they use one-line ellipsis and retain their
  complete accessible names/titles. Missing observations never fabricate scores or clocks.
- Odds and Prob. each precede their value on one compact line with a 4px gap
  between groups below the badge. The second line uses existing shared market/pick abbreviations: 1X2, DC,
  O/U, BTTS; 1/X/2, 1X/X2/12, exact goal lines and Yes/No. Full accessible
  meanings and titles remain. The details end by the away-team row. Original forecast,
  stored alternative, precise odds/probability, gating and settlement stay bound.
- `liveClockLabel` centralizes observed time: 45+2′, 90+4′, HT, 104′,
  120+1′, break, penalties and interrupted/suspended phases. Paused phases
  override stale minutes. Mobile badges show the glowing dot, Live and the
  clock, with ET during extra time and HT during halftime. Terminal mobile
  badges also identify FT/AET/Pens. Desktop keeps its existing Live badge and clock.
- Fixtures exercise every live clock state with the same saved selection and
  original price/probability; focused unit tests cover time and paused phases.
- The production mobile slip frame's blue start border doubles from 2px to 4px.
- Mobile headers and match ordinals use a faint themed blue tint. The shared
  ordinal component reserves the same 18px width as team logos; kickoff dates
  align with team names. Multi-digit ordinals fit within that fixed slot.
- The native slip disclosure stays keyboard accessible; its arrow occupies the
  left column, pointing right when collapsed and down when expanded. Header and
  match badges share width and right alignment. Odds/market start at the left
  badge edge; probability percentages and picks finish at the right edge. Narrow
  or enlarged-text headers reflow without covering the identity or metrics.

## Verification

- All 58 focused web tests passed, including clocks, labels, selection binding,
  slip state, card rendering contracts and subscription transitions.
- TypeScript checking passed. Browser review covers 320px, 375px and 430px
  phones in both themes, enlarged text, desktop rows and the supplied live phases.
- Best Slips and Builder filter containers have no mobile outer border or
  horizontal inset. Shared app headers stay at viewport top after scrolling.
- The market/prediction row ends at the away-team row; the shared grid stretches
  teams and facts together. Enlarged text may reflow metrics to preserve values.
- Lint passed with zero warnings. SSR checks passed for 13 match examples and
  the complete slip scenario/native-form matrix, including access redaction.
- Browser review inspected 301 card layouts. The offline-placeholder row was
  checked separately at all six phone/theme combinations after correcting the
  measurement to compare row centers rather than unequal caption-box tops.
  No card overflow, overlapping team scores or runtime errors remained.
- The pre-existing Builder legend/actions overflow at 200% text remains outside
  the cards, as recorded in plan 178. Card contents reflow without clipping.
