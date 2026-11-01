# 220 · Mobile lineups and availability

## Goal

One complete mobile pitch showing both teams, followed by Home/Away team-sheet
tabs. Default to Home, with starters, substitutes, then injuries/suspensions.

## Implementation

- Reuse the proportional full-pitch drawing and formation projections. Rotate
  the field into portrait on mobile; retain the horizontal desktop presentation.
- Keep both teams on the mobile pitch independently of the selected roster tab.
  Use compact pitch names and complete names/positions in the team sheet.
- Put availability immediately after each team's substitutes and remove the
  separate injuries disclosure. Keep legacy injury/player links functional.
- Preserve missing-data, player navigation, source clocks and access behavior.

## Verification

- All 56 focused match-detail, navigation, event and access tests passed,
  including a regression for legacy injury/team/player links.
- The isolated native Next.js production build passed. Browser acceptance passed
  at 320px, 390px, 768px and 1440px, with zero console errors or horizontal overflow.
- Both goals and all 22 starters share one proportional field. Shirt centres stay
  on their corresponding halves; the centre circle remains circular. Compact
  small-phone labels/targets and position-mode shirt codes do not overlap.
- Home opens by default. Pointer and keyboard switching changes only the team
  sheet, with all 22 players remaining on the pitch. Complete starting lists,
  substitutes and team-specific injury/suspension examples remain visible.
- Legacy injury links, availability/player details, Back navigation, desktop's
  both-team view, light/dark themes and the unfinished public HTML/flight boundary
  passed. No separate injuries disclosure remains.
- Screenshots were visually reviewed. The native fixture uses explicitly labelled
  fictional sample players and reports; no production/provider facts were added.
- Final scoped TypeScript and ESLint checks passed. The native review server at
  `http://127.0.0.1:3118` uses the verified production build; its mobile smoke check
  also passed after refresh, including legacy injury links and both team sheets.
