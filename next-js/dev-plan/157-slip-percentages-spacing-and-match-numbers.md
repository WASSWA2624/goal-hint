# 157 — Slip percentages, tighter spacing and match numbers

## Scope

Add result percentages, align desktop filters with the slips, tighten the space
above them, and number match rows. Retain the prior header colors as requested.

## Implementation

- Show Won/Lost/Pending/Void/Cancelled counts with percentages of the complete
  selected date-range total, before result filtering or pagination. Use at most
  one decimal place, 0% for an empty known range, and a dash when unavailable.
  All retains its total count. Include the percentage in accessible names.
- Remove the filter section's outer border, padding and background, as well as
  the date group's border/padding, so the first date button and Reset align with
  the slips' outer edges. Preserve result-toggle framing and keyboard focus.
- Keep percentage text in the button's current color. Use compact date labels
  below 1600px and preserve horizontal date scrolling in narrow desktop spaces.
- Remove Last 30 days and Next 30 days presets per the user's follow-up; Custom
  range covers both periods. Keep legacy API parsing and applied labels intact.
  Reduce narrow-desktop toggle gaps/padding so large range totals also fit.
- Reduce desktop Best Slips page-top and inter-section gaps to 4px. Tighten its
  local access panel padding/gaps without affecting other screens or mobile.
- Restore the existing header colors after the user's follow-up; keep the
  established slip content and disclosure geometry.
- Give In progress a distinct blue tone and a smooth breathing halo around a
  steadily visible dot. Respect reduced motion; retain its label and geometry.
- Add plain, localized match ordinals before dates, starting at 1 within each
  slip. Reuse an accessible number component and an optional date prefix in the
  shared desktop row, leaving ordinary feed rows unchanged. Preserve valid time
  elements and original fixture dates.

## Verification

- Scoped ESLint passed. The combined cache/query/access/card/header test run
  passed all 37 tests on Node 24.18.1.
- TypeScript and the integrated production build passed on Node 24.18.1 /
  npm 11.16.0, including all 21 static pages and the offline asset manifest.
- Isolated production browser checks passed for percentages (including 13/83
  and 1/7), zero/unknown counts, edge alignment, 4px banner/list spacing, both
  themes and responsive layouts. Large totals fit at 1024px; match numbers
  restart per slip and were checked through 100 on desktop and mobile.
- Visually inspected the final 1440px light and 1024px dark desktop layouts and
  320px mobile glow. The animated halo preserves a solid dot; reduced-motion
  mode keeps the glow steady. Prior header colors remain intact.
