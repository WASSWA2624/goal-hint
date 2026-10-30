# 174 — Shared Compact Rail mobile slips and blue filters

## Scope

Implement the selected mobile Compact Rail slip summaries with tighter spacing,
blue filter cards, bracketed result percentages, floating Slip date labels,
generation timestamps and uniform status badges. Preserve existing behavior
and match content. Apply the subsequently requested larger rounded disclosure
indicator on desktop and a compact, centered equivalent on mobile.

## Implementation

- Keep `SlipCard` / `SlipCardSummary` as the common responsive entry points and
  `MobileSlipHeader` / `CompactSlipDisclosure` as the shared phone renderer for
  Best slips, generated slips, saved history, shared slips and access summaries.
- Group the styled slip number, pipe and timestamp on the left, with the
  fixed-width coloured status on the right. Isolate the chevron in its own
  separated column and keep all inline facts, including Matches, to its left.
  Use a restrained blue rail, 4px outer corners, 6px vertical padding and an
  8px starting gutter. The ending column centers the control with balanced
  spacing. Retain native disclosure and
  accessible titles, labels and probability explanation.
- Reuse the desktop `SlipStatusBadge` and its fixed 5.75rem width, semantic
  colours, observed status precedence and animated progress indicator.
- Share the rounded disclosure-indicator style, with a 28px desktop circle
  and 20px mobile circle. Balance end spacing and reserve desktop gutter space
  for the control while keeping header/body status columns aligned. The full
  native summary remains the activation target.
- Render persisted timestamps as `Fri` followed by bold
  `30 Oct 2026 · 09:16 EAT`. Compute the weekday and date in Kampala. Best slips
  use the original immutable daily publication timestamp; generated builder
  cards use their result's `asOf` on mobile. Date-only records never invent a
  clock. Keep the timestamp in the summary with no duplicate Published line.
- Expose the existing date/result filter component in a compact Blue Signal
  panel on mobile: one horizontal row of semantically coloured result controls
  with counts and bracketed percentages inline, including All. Keep 44px
  targets, floating date labels, focus reveal and tight spacing. Replace the
  duplicate phone performance strip. Reuse desktop numbered pagination and
  its blue current-page treatment on phones, with smaller 32px controls.
- Reuse existing query, cache, pagination, API access, custom-range validation,
  refresh and failure/retry logic. Desktop styles stay outside mobile changes.

## Verification

- 85 targeted Node tests passed for filtering/query caches, public completion
  access, sharing, immutable slip facts, statuses and match-refresh behavior.
- 240 mobile layout/interaction assertions passed at 320/360/390/768px, in
  both themes and all three viewer states. Counts/percentages, floating date
  labels, EAT timestamps, native disclosure and custom-range validation passed.
- Subsequent checks covered the approved number/date/pipe grouping, isolated
  arrow column, 32px pagination, page-two ranges and offscreen status focus.
  Pixel geometry checks use a subpixel tolerance for browser rounding.
- 40 rounded-indicator browser assertions passed at 390/1024/1440px in both
  themes: 20px mobile / 28px desktop circles, centering, visible border/fill,
  native expansion/collapse, chevron rotation and aligned status tracks.
- Desktop comparison before the separately requested arrow refresh matched
  24 baseline states, with an additional eight-state final comparison showing
  no unintended differences. The requested end gutter is scoped to desktop
  slips and keeps header/body status alignment.
- Existing SSR rendering acceptance passed across Best slips/access summaries,
  saved snapshots, generation states, native form limits/cutoff behavior and
  subscriber/account actions. Stale rendering expectations were updated to
  the current probability copy, aggregate access panel and observed statuses.
- Production build, TypeScript, scoped ESLint, Python compilation and whitespace
  checks passed. Reviewed full-size mobile/desktop captures in both themes.

Existing Git stashes and detached worktrees remain preserved. Generated browser
captures, fixture apps and build output remain ignored. Live provider/account
transactions were not exercised; production server services are unchanged.
