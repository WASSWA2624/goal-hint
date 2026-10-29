# Desktop BetSlip filter designs

Ten interactive desktop concepts explore date and result filtering on the
BetSlip page. They follow the existing Goal Hint desktop styling: compact
controls, square edges, Manrope typography, blue selection accents, and the
shared slip presentation.

The user selected **01 · Compact selectors** for desktop implementation, tracked
in [plan 152](../../dev-plan/152-compact-desktop-betslip-filters.md). This gallery
remains a reference with illustrative local data; it does not read production
slips or control the working page.

## Concepts

| No. | Concept | Structure and tradeoff |
| --- | --- | --- |
| 01 | Compact selectors — selected | A date selector and result buttons share one small toolbar. Uses little space; date options open on demand. |
| 02 | Outcome tabs | All, Won, Lost, and Pending remain visible as tabs. Makes result changes quick; uses another row. |
| 03 | Visible date presets | Grouped date buttons expose the available periods. Easy to discover; needs more vertical space. |
| 04 | Day navigator | Yesterday, Today, and Tomorrow are direct actions, with other periods in a selector. Suits daily browsing; longer ranges take another interaction. |
| 05 | Result summary tiles | Clickable result counts sit above date controls. Makes outcomes prominent; occupies more room than tabs. |
| 06 | Range-first form | From and To inputs stay visible alongside presets and results. Suits custom ranges; has a more explicit form layout. |
| 07 | Sentence bar | Inline selectors complete a short sentence describing the filter. Reads naturally; labels are less aligned than a conventional form. |
| 08 | Collapsible filter section | A compact applied summary expands into date and result controls. Keeps slips prominent; editing requires opening the section. |
| 09 | Combined popover | One filter trigger opens date and result choices together. Saves page space; choices appear on demand. |
| 10 | Left filter rail | Persistent date and result groups sit beside the slips. Helps repeated browsing; reduces the width available to slips. |

Every concept provides the same dates, result choices, results summary, and
Reset action. The differences concern arrangement and interaction, rather than
additional filters.

## Shared preview behavior

- Defaults are **Today** and **All results**. Reset restores those defaults.
- Dates are Today, Yesterday, Tomorrow, Last 3 days, Last 7 days, Last 30 days,
  Next 7 days, Next 30 days, All dates, and Custom range.
- Results are All, Won, Lost, and Pending. Date and result selections combine.
- All concepts use one local sample dataset and shared filter state so a
  chosen date and result can be compared across layouts.
- The review clock is fixed to **29 October 2026, East Africa Time (UTC+3)**.
  Dates refer to the slip's publication date, rather than the time of a match
  inside it.
- Last N days includes today. Next N days starts tomorrow. Custom From/To
  boundaries are inclusive, and All dates removes the date restriction.
- Light and dark appearances are available. The gallery supports host carousel
  navigation and its own standalone navigation fallback. An optional Show all
  view helps compare the concepts together.
- Filters apply immediately, except edits to custom date fields, which use
  Apply range, and the combined popup, which uses Apply filters. Cancel or
  Escape discards popup edits. Date-only Reset preserves the result choice.
- Result counts follow the selected dates and remain visible when another
  result is chosen. Four sample slips appear per page with working pagination.

Displayed slips, outcomes, counts, and dates are illustrative review data.
The preview makes no requests for live slips and does not change accounts,
saved slips, production filters, or backend behavior. A later implementation
will need to connect the selected design to the available slip publications.

## Open the preview

Open `desktop-betslip-filter-designs.html` directly in a browser, or serve the
directory from the repository root:

```powershell
python -m http.server 8358 --bind 127.0.0.1 --directory "next-js/design/desktop-betslip-filter-designs"
```

Then open
[the desktop BetSlip filter gallery](http://127.0.0.1:8358/desktop-betslip-filter-designs.html).

The HTML file is the editable source and includes the standalone controls; no
production application server or generated wrapper is required.

## Verification

- JavaScript syntax, fragment structure, and size checks passed.
- Independent Chromium functional checks passed 284 assertions across all ten
  concepts, including every date preset, all results, combined filters,
  inclusive custom ranges, invalid ranges, Cancel, Escape, Reset, and empty
  results. No runtime exceptions occurred.
- Range-first date edits survive a result change; choosing Custom initializes
  from the displayed preset range. All dates clears its displayed bounds.
  Reset in a date-only popup preserves the chosen result. Combined popup
  Cancel preserves applied filters, while Apply commits both choices.
- All 100 layout combinations passed: ten concepts, both appearances, and
  1440/1024/768/390/320px browser widths. No page overflow, overlapping controls,
  clipped button labels, or duplicate IDs were found. Narrow checks verify
  containment; these are desktop design proposals.
- The generated conversation wrapper passed navigation through all ten
  concepts, shared filter preservation, and custom-range application without
  duplicate standalone controls. All ten desktop stages measured 860px.
- Screenshots of all ten desktop concepts, the expanded filter section, and
  the dark popup were visually reviewed. Dialog Escape returns focus to its
  trigger. Native modal behavior keeps underlying page controls inactive;
  exhaustive keyboard accessibility has not been audited.
- Standalone Show all and shared state across concept changes passed. Generated
  wrappers, screenshots, and verification scripts remain in ignored `output/`.
- Pagination boundary navigation retains keyboard focus on the enabled opposite
  control. The independent browser console reported no errors or warnings.

Production integration and a production application build are outside this
isolated design preview.
