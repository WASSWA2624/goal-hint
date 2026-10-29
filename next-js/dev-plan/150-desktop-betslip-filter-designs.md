# 150 — Desktop BetSlip filter designs

## Scope

Create ten interactive desktop designs for the BetSlip date and result filter
section. Use the existing Matches filters as a visual reference, while adapting
the controls to slips. The user will choose one design before production
implementation begins.

## Deliverable

- Keep the editable, self-contained review at
  `design/desktop-betslip-filter-designs/desktop-betslip-filter-designs.html` and
  document the concepts and local preview in its README.
- Present these concepts in order: Compact selectors, Outcome tabs, Visible date
  presets, Day navigator, Result summary tiles, Range-first form, Sentence bar,
  Collapsible filter section, Combined popover, and Left filter rail.
- Follow the shared Goal Hint desktop typography, compact controls, square
  edges, theme colors, and slip-list geometry.
- Include a results summary and Reset action in every concept. Preserve the
  same filtering capabilities across the layouts.
- Provide light/dark appearance, host carousel integration, standalone
  navigation fallback, and an optional Show all comparison view.
- Keep the production BetSlip page, shared runtime components, queries, server
  data access, and mobile interface unchanged.

## Shared behavior

- Use one local illustrative slip dataset and shared date/result state across
  all ten concepts.
- Default to Today and All results. Reset restores both defaults.
- Offer Today, Yesterday, Tomorrow, Last 3 days, Last 7 days, Last 30 days,
  Next 7 days, Next 30 days, All dates, and an inclusive custom date range.
- Offer All, Won, Lost, and Pending; combine the chosen result with the chosen
  period.
- Fix the review clock at 2026-10-29 in East Africa Time (UTC+3). Filter by slip
  publication date. Last N includes today; Next N begins tomorrow. All dates
  removes the date restriction.
- Validate custom ranges and show useful empty states. Keep controls and
  selected states accessible with keyboard focus and readable text labels.
- Label sample data clearly. Do not introduce live requests, account changes,
  saved-slip mutations, or new production outcome rules.

## Local review

Open the HTML source directly, or run the following from the repository root:

```powershell
python -m http.server 8358 --bind 127.0.0.1 --directory "next-js/design/desktop-betslip-filter-designs"
```

Review at `http://127.0.0.1:8358/desktop-betslip-filter-designs.html`.

## Verification

- Source JavaScript syntax, fragment structure, and size checks passed.
- Independent Chromium checks passed 284 functional assertions across all ten
  concepts with no failures or runtime exceptions. This includes the full
  preset/result matrix, combined filters, custom-range boundaries, validation,
  Reset, Cancel, Escape, and empty results.
- All 100 layout cases passed: ten concepts, light/dark appearance, and
  1440/1024/768/390/320px browser widths. Controls remained contained without
  overlaps or clipped labels, and no duplicate IDs were found.
- Conversation-wrapper navigation reached all ten concepts, preserved shared
  filters, and applied custom dates without duplicate standalone controls.
  All ten desktop review stages measured 860px.
- Visually reviewed all ten desktop concepts, the expanded section, and the
  dark popup. Verified date-only Reset preserves result; inline date edits
  survive result changes; Custom retains effective preset bounds; dialog
  Escape restores trigger focus. Standalone Show all exposes ten concepts.
- Pagination boundary focus passed after reload. The independent browser console
  reported no errors or warnings.
- Store generated wrappers, screenshots, and verification scripts only in
  ignored `output/`. Commit the editable HTML, README, and this plan.

No production integration or build result is claimed by this design-only plan.
Await concept selection before implementing the working BetSlip filters.
