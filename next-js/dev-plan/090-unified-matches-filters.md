# Unified Matches filters and prediction totals

## Scope

- Use one Matches destination with All, Upcoming, Live and Completed filters.
- Keep existing historical links working through the shared feed.
- Expose Last 30/7/3 days, Yesterday, Today, Tomorrow, Next 3/7/30 days and Custom.
- Coordinate status and dates. Live uses Today without kickoff-time restrictions;
  incompatible Upcoming/Completed dates become a compatible period.
- Keep other valid filters and use the same choices on phones and desktops.
- Show the number of predicted matches and desktop outcome percentages.

## Implementation

- Share status/date transitions in browser-safe domain helpers. Keep low-level
  historical API reads available and normalize direct main-page URLs before reads.
- Remove Live and Results from shared navigation. Legacy navigation helpers open
  filtered Matches; dated match archives retain their existing URL contracts.
- Reuse status and period options in desktop controls and compact phone selectors.
  Live locks date/time controls until another status is selected.
- Count Won, Lost, Pending and Void forecasts as Predicted; exclude fixtures with
  no prediction or a filtered-out pick. Desktop percentages use this denominator.

## Verification

- 104 focused query, state, navigation, summary and filter tests passed, including
  a repeat against an isolated snapshot of the intended source changes.
- Seven genuine MySQL acceptance tests passed without skips. Status counts and
  ordered fixture IDs match canonical stored rows; future ranges and the full-
  access prediction-only defaults are captured from actual stored reads.
- All 46 SQL-backed rendering cases passed, plus 11 real-route redirects and
  five malformed-query guards. Historical Live links select Today; native future
  periods replace old dates; Custom retains dated archive ranges.
- The desktop browser checks passed all five dialogs, independent resets,
  cancellation, retained drafts, sort application, Back restoration, responsive
  sheet lifecycles, status/date synchronization and reset-to-All behavior.
- Applied browser checks passed all four statuses and all three future presets
  on desktop and phone. Native forms with JavaScript disabled passed future
  period selection, Live/Today synchronization and historical Custom submission.
- Layout checks passed at 320, 390, 768, 1024, 1440 and 1920 pixels. Shared summary
  checks passed those widths in light and dark themes: Predicted remains visible,
  correct percentages appear only in the desktop summary layout, and Live/Results
  are absent from navigation.
- ESLint, TypeScript checking and optimized production builds passed. An isolated
  application snapshot also passed full lint, the focused tests and the production
  build, keeping unrelated shared-checkout edits out of validation and this commit.
- Windows MySQL bootstrap exceeded the original 90-second migration budget before
  assertions ran. The expanded acceptance now allows a bounded 180-second schema
  bootstrap inside its 360-second test deadline; the final run passed in 177 seconds.
- The low-level historical API, subscriber access and provider policy gates remain
  unchanged. No provider requests or real account mutations were used for checks.
