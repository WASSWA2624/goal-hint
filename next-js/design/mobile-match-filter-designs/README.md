# Mobile match filter and search previews

Ten independent, interactive mobile concepts for comparing a smaller Matches
search and filter section before choosing a production design. No concept is
selected, and the production Matches screen is unchanged by these previews.

## Review findings

The current phone layout in
[`feed-filters.tsx`](../../src/components/match/feed-filters.tsx) stacks four
rows: search, status and period dropdowns, a day strip with Calendar, and
Sort/Reset/Advanced filters. Each row is at least 44px high, with 6px gaps:
approximately **194px before the active summary, result count, and surrounding
spacing**. This is a minimum inferred from the source styles, rather than a
measurement of every possible screen state.

Dates have three editing entry points: the Period dropdown, the strip's
Calendar editor in [`feed-dates.tsx`](../../src/components/match/feed-dates.tsx),
and date fields inside Advanced filters. Custom dates in the Period dropdown
opens that advanced sheet. The applied summary in
[`feed-controls.tsx`](../../src/components/match/feed-controls.tsx) repeats the
date range again when other filters or search are active. These represent the
same date selection, even though they are separate UI controls.

The existing interaction rules also vary: status, periods, days, and sorting
apply immediately; search submits; advanced fields wait for Apply. The existing
sheet already supports focus containment, Escape/backdrop dismissal, focus
restoration, background scroll locking, and safe-area spacing. A future
implementation should preserve those behaviors and provide clear draft and
applied states.

The production default is Last 30 days with Latest first, all market families,
and unrestricted kickoff time/probability. Predictions only depends on access
and status. These query defaults are separate from the illustrative Today view
used consistently across all ten previews.

The previews use the match cards' compact 12–13px text, quiet borders, flat blue
selection color, restrained spacing, and square edges. Touch controls retain
usable target sizes; the reduction comes from fewer visible rows and one date
owner. Each concept offers presets and custom ranges through its date entry
point rather than repeating date fields in another advanced editor.

## Ten concepts

| No. | Concept         | Arrangement and tradeoff                                                                                                                                  |
| --- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | Compact stack   | Search row, then Date/Status/Filters. Familiar visible controls with a clear two-row hierarchy.                                                           |
| 02  | Search first    | One search row includes date scope and a filter icon; status lives in the scope sheet. Prioritizes search with fewer persistent controls.                 |
| 03  | Status tabs     | All/Live/Upcoming/Finished remain visible above a date, search, and filters row. Makes status changes easy to discover.                                   |
| 04  | Day navigator   | Previous/Today/Next is the single date owner, paired with a search/filter row. Suits frequent single-day browsing.                                        |
| 05  | Week strip      | One week of dates and a Calendar entry, paired with search/filters. Preserves direct date browsing without an additional Period dropdown.                 |
| 06  | Reveal search   | Date, status, filters, and a search icon share one row; search expands when needed. Saves resting space while adding a step to search.                    |
| 07  | Filter rail     | Search above a horizontal Date/Status/League/Market/More rail. Gives refinements direct access, with horizontal scrolling on narrow phones.               |
| 08  | Match header    | A single Today · All scope summary integrates search/filter actions with the result count. A quiet card-aligned entry point for editing the scope.        |
| 09  | Bottom dock     | Date/status scope at the top; a search/filter dock sits above navigation. Moves frequent actions closer to the thumb and requires careful bottom spacing. |
| 10  | Inline expander | Search and a Refine summary stay visible; controls expand inline. Makes the editing context visible while temporarily using more vertical space.          |

As review judgment, **01** is a useful starting point for familiar controls,
**04/05** for date-heavy browsing, and **06/08** for minimum resting chrome.
These are comparison suggestions, not an implementation decision. The user
chooses the concept to implement after reviewing the gallery.

## Comparing the previews

Open `index.html` through the local server below. The gallery supports:

- A focused concept view and an all-ten comparison view.
- Phone widths of 320, 360, 390, and 430px.
- Light and dark appearance.
- A shortlist for recording preferred concepts while comparing them.
- Interactive sample search, dates, scope, and filter editing.

The fixed sample date is **28 October 2026**, with Today as the initial scope
for direct comparison across all ten concepts. Match results and counts are
illustrative local data. Sheet fields edit a local draft; Apply retains the
changes, while Cancel/dismissal discards unapplied sheet edits. No live match
backend, account access, production URL state, or prediction service is used.
The sample interactions explain the proposed layouts; they do not establish a
new production query contract.

Compare the resting layout and an open editor, try both themes, and use the
narrower widths before choosing a sample. Desktop-sized gallery controls are
for reviewing the concepts; the designs inside the phone frames are mobile
only.

## Local preview

Serve the `next-js` root so the gallery can use the application's local font
asset:

```powershell
python -m http.server 8348 --bind 127.0.0.1 --directory "D:\coding\apps\nextjs\goal-hint\next-js"
```

Then open [the mobile design gallery](http://127.0.0.1:8348/design/mobile-match-filter-designs/).
The preview is served independently of Next.js and needs no database or private
configuration.

## Verification

Verified in Chromium through Playwright CLI:

- All ten concepts at 320/360/390/430px in light and dark themes (80 scenarios):
  no page overflow, missing resources, or browser runtime errors.
- Search and reset in every concept; sheet sizing and Escape dismissal at
  320px in both themes. Advanced editors contain no date fields.
- Draft Cancel, Apply, probability/range validation, at least one market,
  Live normalization, date presets, off-strip date summaries, focus restoration,
  backdrop dismissal, and Advanced status reset in 04/05.
- Inline expansion, filter counts and focus; bottom-dock clearance; all ten
  comparison frames; theme/width switching; shortlist persistence; gallery
  overflow at 320px.
- JavaScript syntax, scoped ESLint with zero warnings, and whitespace checks.
- Visual inspection of the gallery, light mobile cards, narrow dark date sheet,
  bottom dock, and inline editor against the existing card styles.

Measured closed filter areas at 390px, excluding the page heading and results
summary:

| Concept            | Top filter area | Bottom dock |
| ------------------ | --------------: | ----------: |
| 01 Compact stack   |            94px |           — |
| 02 Search first    |            45px |           — |
| 03 Status tabs     |            95px |           — |
| 04 Day navigator   |            95px |           — |
| 05 Week strip      |            99px |           — |
| 06 Reveal search   |            44px |           — |
| 07 Filter rail     |           107px |           — |
| 08 Match header    |            45px |           — |
| 09 Bottom dock     |            45px |        57px |
| 10 Inline expander |            94px |           — |

The gallery measures its current state, so expanding controls updates the
displayed height. Sample 09 always shows both areas. Measurements concern the
preview, while the existing 194px minimum above is inferred from production
source. These are browser prototypes with local sample data; no full application
build or production/backend verification was required or performed.
