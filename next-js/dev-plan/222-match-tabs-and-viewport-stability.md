# 222 · Match tabs and viewport stability

## Intended result

- Keep the match tabs, page scroll and prediction at the same vertical positions
  when switching between long and short sections. Reserve only the space needed
  below the current viewport, with content aligned at the top. Prevent browser
  footer anchoring and scrollbar width changes from moving the page.
- Center the selected mobile tab horizontally, clamped at the first and last
  tabs. Keep touch scrolling and minimal left/right controls. Fit desktop tabs
  with the shared More menu, 13px semibold labels, and keyboard access and focus.
- Add subtle semantic icon colors using the shared theme. Remove repeated
  headings, forced vertical reveals and unnecessary content remounts. Refresh
  observations in the background on day rollover; retain access revalidation.
- Present Teams, Venues and Matches as three compact native radio groups. Show
  the actual home/away fixture order and each club's own W/D/L badge.
- Expand market details inline. Keep home players above away players on the
  mobile pitch, with matching names/formations above and below. Use local country
  flags and short codes for supplied pitch, roster and availability nationalities.
- Label incoming substitutes In and outgoing substitutes Out.

## Verification

- Browser acceptance measures the tab bar, prediction and scroll position on
  every animation frame through long/short transitions at 320, 390, 1024 and
  1440px, from the page top, intermediate offsets and bottom. It also checks
  centering, desktop overflow, access, URL persistence and native content.
- Reproduced the original 553px scroll jump. The initial corrective check
  retained all three positions exactly. Bottom-of-page coverage also exposed
  footer anchoring, which is now disabled only on match details pages.
- Synthetic test players and event records remain confined to labelled fixtures.
  The live review at localhost:3118 continues to receive shared source changes.
- All 61 focused navigation, insights, detail, refresh and access tests passed.
  Full TypeScript and scoped ESLint passed. The production component acceptance
  build compiled successfully; all 248 browser checks passed without browser
  errors, including 80 transitions with exactly unchanged viewport positions,
  mobile centering, compact radio rows and keyboard selection, desktop label
  size/weight and overflow, theme coverage and unchanged access restrictions.
- All five event acceptance groups passed without failures or console errors:
  completed timelines, partial/unknown data, access boundaries, half-time and
  extra-time context, and the mobile timeline. In/Out wording is checked against
  the actual incoming and outgoing players.
