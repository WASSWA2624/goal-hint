# Stored match feed page

Matches is the single browsing destination. Its status filter offers All,
Upcoming (`scheduled`), Live and Completed (`finished`), with the same choices on
phone and desktop. Live selects Today in the active browsing zone, removes
kickoff-time bounds and locks date/time controls until another status is selected.
Status changes retain compatible filters and mirror past/future relative periods
for Upcoming and Completed. Wholly incompatible explicit ranges are repaired.
Matches opens with an empty search, All statuses, Last 30 days, latest kickoff first,
all four markets and no league, country, time, probability or odds constraints.
Reset restores those choices and the Predictions only default allowed by access,
in the detected device zone, with fifty matches per page.

The default performance cards report today in EAT under **Today’s performance**,
independently of the 30-day browsing list. Outcome controls open today's matching
results with the existing cohort filters and restart pagination. Explicit date
selections keep their actual reporting period; legacy yesterday summary links
remain readable. Reset restores today's summary.

The performance title and period align with the card edges and sit closely
above them. Search and title spacing are compact on mobile and desktop, with a
separate gap before the Matches/Predictions results header. That header reuses
the match-card frame tokens and joins the first card without a gap or doubled
divider. Controls retain their shared height and both theme palettes.

The dialog uses From/To date-times rather than a period or time-zone selector.
Dates display as `04-JAN-2026` with 24-hour time and scrolling date/time columns.
New `start`/`end` URL parameters define a continuous device-zone interval;
the final selected minute is included. SQL, caches and pagination use its exact
UTC bounds. Invalid/reversed ranges and nonexistent DST minutes fail inline;
repeated DST endpoint minutes include both occurrences. Legacy date/preset and
daily time-window URLs remain readable. The native GET form's legacy `period`
field remains validated by the page route and redirects to canonical parameters. Direct stale Live links,
including dated archive links, redirect to the current filtered Matches view
before reading records. Other historical archive routes remain available.

Prompt 033 adds [search/filter controls](search-filter-controls.md) through a
persistent client surface. Failed filter navigations retain and label the
previous successful server projection. Prompt 034 adds
[Load more and Back restoration](pagination-navigation.md) while keeping ordinary
pagination links usable without JavaScript.

Explicit filter actions always dispatch normal navigation, so Clear can
supersede a rapid Apply even when returning to the currently displayed URL.
An idle retry of a failed read at the same URL uses `router.refresh()`.

`/en/matches` and `/en/predictions/YYYY-MM-DD` share the same feed service and
`MatchFeedPage`; dated URLs preserve historical links without separate Live or
Results navigation destinations. The Matches page defaults to kickoff
descending; dated archive routes retain their named dates and kickoff/fixture-ID
order. Stored API defaults remain Last 30 days and kickoff descending. The first
page shows up to fifty matches. Validated URL variants retain the
existing selected market, filters, sorting and bounded page-size contract.

`server/matches/public-feed.ts` composes the same database, configured competition
scope and MySQL response cache for pages and `/api/matches`. Server Components
call it directly. `getShellInstant` supplies one request-scoped instant to the
header, browsing date and page read so midnight cannot split a single
render across dates. A serialized `tz` resolves Today and date presets in that
zone. Cache hits preserve their original response/source clocks.
Full-page HTTP caching remains disabled by dynamic request rendering.

Feed cohort queries start with the kickoff-date index. The stored generated
`PredictionSet.feedRecommendation` column supplies compact recommendation fields
for filtering and ordering while the original sealed candidate stays authoritative.
Apply migrations `20261028120000_compact_feed_recommendation` and
`20261028121000_feed_choice_covering_index` before running the updated server
against an existing database. The development launcher applies
migrations to its owned database during startup.
Page hydration batches fixture, cycle, forecast, result, settlement, refresh and
price reads using the same validators as individual reads. Whole-cohort performance
audits advance by kickoff and fixture ID so every batch continues along the date
index, including fixtures with identical kickoff times.

Pages and ordinary list/refresh API reads use `readPublicMatchFeedList`: the
cards, exact filtered totals, sorting and pagination load without waiting for the
full-period settlement audit. `/api/matches/summary` uses the same query and
entitlement boundary and returns only complete counts, their observation clock,
cohort version and viewer projection. The client loads this independently, checks
its request scope and viewer, and offers a separate retry
on failure. Summary loading never marks the list or route as busy. Its separate
90-second audit budget leaves ordinary list transaction budgets unchanged.

`FeedStateProvider` receives the query with `data: null`: cards render from the
server projection props and the store only holds the filter draft, so hydration
does not validate the page's records a second time.
Initial server rendering supplies the cards without reading Redux or starting browser
requests. Search/filter controls now use the shared persistent surface; the
pagination uses the same surface and a bounded metadata-only checkpoint. Prompt 037 owns live refresh and
open-tab midnight rollover. An unzoned relative entry adopts the device zone
after hydration using one canonical replacement navigation; polling pauses
while its actual local-day fixture window loads. Named dates and applied zones
remain stable. Search visits continue to consume the shared
aggregate limiter before cache lookup.

## Navigation and presentation

Search and dialog controls use the shared 40px fine-pointer or 44px
coarse-pointer height at every viewport. One body search row opens Advanced
Filters on both mobile and desktop. The shared draft holds every filter;
Enter in search and the footer's Apply Filters submit the validated draft and
restart pagination. Predictions
only defaults on for full-access pages and finished results; free unfinished feeds
keep their existing subscriber restriction. Explicit `picks=all` preserves an
unchecked page choice, while Reset restores the available page default. API reads
and offline snapshots retain their unrestricted default. Four native From date,
To date, From time and To time inputs render once inside the filter dialog,
which starts closed at every viewport. Equal date endpoints select a day and equal
time endpoints select a kickoff minute. Different date
endpoints select an inclusive range of up to 366 days; time ranges retain inclusive
minute bounds and their explicit timezone. Incomplete or invalid ranges remain
editable and disable Apply. Date steppers, date popovers and time mode menus are
absent. Historical queries retain the MySQL-supported years 1000–9999. Direct
invalid or incompatible dates/queries return the existing 404 shell.

The page uses the shared light or dark shell, controls, feedback and match cards.
Light mode uses the Porcelain Blue page background with white cards and
header/navigation chrome; dark mode uses navy surfaces with light text. Phone
match/slip frames and Aligned ledger row edges remain square. Other controls use the shared
`theme.radius` scale.
Matches reuse Clean ledger cards below 64rem and the same Aligned ledger rows as
betting slips and the slip builder at desktop widths. `MatchCardList` provides
one `useDesktopLayout` subscription through `MatchCardLayoutContext`; individual
cards do not add their own media subscription. Server HTML and initial hydration
retain the original card fallback, then the list selects its shared desktop
renderer. Each fixture has one active presentation, without hidden duplicate
mobile and desktop records. The old decorative table heading and alternating
row stripes are removed. Every feed logo
is lazy with reserved dimensions and initials fallbacks; an eager logo would be
hoisted as a third-party image preload competing with the page's own font, CSS
and scripts.
`MatchCard` is memoized: a poll that changes nothing a card shows, and header or
filter state changes, re-render no cards. A pending navigation dims the list in
place (`aria-busy`) instead of inserting a loading line above it. Native images keep the exact approved remote URL without an optimizer
or proxy. Names, kickoff, prediction, probability and styled-components CSS exist
before hydration. Canonical slugs reuse the detail service's extracted helper.
Prompt 035 supplies the real [match-detail destination](match-detail-page.md).
Its acceptance repeats filtered multi-page Back restoration through the actual
route factory with genuine stored detail projections. Earlier isolated shell
destinations remain confined to their original rendering tests.

Open cycles display the supplied current prediction. Closed cycles display only
the supplied locked forecast, or the explicit missing locked selection for that
market. Historical scores and correctness remain separate. Publication and last
sync use their original UTC instants, displayed in the device's timezone after
hydration with a stable EAT server fallback. Match kickoff and detail
timestamps follow the same display rule. Browsing dates with `tz` select actual
local-day UTC boundaries, including fixtures from adjacent EAT reporting days
and daylight-saving changes. Blank time fields retain that browsing zone;
optional time bounds narrow its daily minutes. Unzoned explicit dates retain
their EAT boundaries. Provider receipts, prediction windows, run identities and
the daily forecast schedule retain their operational EAT calendar. Today and
the next six browsing dates form the seven-day browsing preset; rollover follows
the selected zone's midnight without shifting a named historical date. Stored
delays remain visible. The page never
substitutes a sample forecast or selects
a current preview for an empty lock.

### Compact header and filters

`FeedHeader` retains the phone brand bar and one visually hidden page heading.
Desktop uses the shell header. Both viewports render the same `FeedFilters`:
one search row and its Advanced filters button, with transparent surroundings
and shared spacing above and below. There is no separate gray filter panel.

One branded **Advanced Filters** dialog owns status/result, combined From/To
date-times in the device zone, sorting, Predictions only, markets, leagues,
countries, probability bounds and the existing unavailable-odds explanation.
Each field renders once; desktop and mobile share the same draft and validation.
Leagues and countries reuse one searchable multi-select with bundled country flags.
Markets uses a collapsible checkbox section at the bottom. Period and editable
zone fields are removed. Dates use the shared formatted editor and scroll picker.
Live selects Today and disables incompatible date/time fields. Invalid or
incomplete drafts remain editable and disable Apply.

The shared `AdvancedFilterDialog` wraps `CriteriaDialog` with the existing brand
mark, theme surfaces, modal focus handling and exactly two footer actions:
**Reset Filters** on the left and **Apply Filters** on the right. The body
scrolls independently of the header and footer. Reset edits only the draft;
Apply commits the complete validated query and closes the dialog. Escape,
backdrop dismissal and the close button restore the opening draft and opener
focus. Reset restores the configured Matches defaults in the device zone,
including fifty records per page. Payment, subscriber and audit search screens reuse
this dialog chrome around their existing fields and cancellation behavior.
Without JavaScript the same dialog fields remain inline for native GET search.

The results have one square, themed header: **Predictions** with a label such
as `WED 28-Oct-2026 - 00:56 EAT` on desktop, or **Matches** with
`28-10-2026 00:56 EAT` on mobile, plus the visible range. Both headers share
the Performance header's title size, medium weight, metadata styling and padding. The timestamp is the latest stored prediction publication among
the displayed records, including gated forecasts; its tooltip states that scope.
It is omitted when no visible prediction has a publication, independently of
kickoff and feed-read time. Desktop shows `Showing 1–50 of 600 matches`; mobile
shows `1–50 of 600`, with the timestamp beside the title and natural wrapping on narrow screens. Counts follow
filtering, accumulated pagination, retained projections and live refresh. Match
rows retain their kickoff dates; redundant kickoff-day dividers are removed.

Phones and tablets keep the shared Clean ledger presentation: kickoff and
competition metadata, mirrored teams around VS/the supplied score, then one
inline row of market, pick, exact available odds and estimated probability.
Desktop uses the reusable `DesktopMatchRow` and its shared row styles, also
used by `DesktopSlipRow`. Its nine cells show date, time, country, league,
teams/score/clock, prediction, odds, probability and match/outcome status.
Names retain full-value tooltips; the centre score/VS links to the same canonical
analysis page. There is no separate decorative column header or striping.

The feed continues to project its real `FixtureSnapshot` through `MatchCard`;
it does not manufacture slip selections or forecasts. Eligible-market ranking,
exact-pick pricing, public locked probability, access messaging and missing-pick
reasons remain unchanged. Slip adapters separately preserve their original
stored selections while sharing presentation. Offline cards continue to omit
predictions, external media, live claims and analysis navigation.

All cards/rows and logo fallbacks follow the selected theme, with square edges,
themed borders and no card shadow. Match progress and Win, Loss, Pending or Void
outcomes stay distinct and use their existing semantic colors. Missing
predictions retain an explicit no-prediction reason in accessible text. Filters,
exact/similar search grouping, continuous numbering, pagination, retained results,
live refresh and match-detail Back navigation retain the existing data path.

The distinct bottom navigation bar is 42px tall before the device safe-area
inset. It follows the selected title-bar mode, white in light mode and navy in
dark mode, and uses a single theme-accent
current-page indicator. Theme preference is stored locally; absent a saved
choice, the browser's preferred colour scheme is used after hydration. No
account, analytics or external service is needed to switch themes.

## Coverage, progress and errors

| Stored/read condition | Page behavior |
| --- | --- |
| Complete imports and no known fixtures | No fixtures confirmed. |
| Missing, pending, failed, partial or degraded coverage | No page-level banner; stored fixtures still list and each affected card notes partial coverage. Empty unknown dates say Fixture data unavailable. |
| Matching fixtures without the selected family | No page-level notice; the fixture cards remain visible and each row states why it has no pick. |
| Stored fixtures with no filter matches | No matches for these filters, below the action row. |
| Direct page beyond the matching list | Match page unavailable; no invented cards. Previous page links return to a populated page when available. |
| Temporary database/configuration/read failure | Matches temporarily unavailable with an ordinary retry link; no fixture count or fictional run. |
| Aggregate search budget exhausted | Search temporarily busy with retry. |
| Any selected date beyond today plus six | The seven-day prediction availability message, including when no fixture data exists. |

Run progress uses actual stored completed/total counts. Not-started and selecting
states have unknown totals and show no fabricated denominator. Failed/expired jobs
and partial manifests are explicit. A separate Status as of timestamp is the
cached projection's observation time, never a replacement for publication/sync.

## Acceptance and operations

```text
npm run test:feed-page
npm run test:feed-page:rendering
npm run test:feed-page:rendering -- --serve
```

The rendering script requires genuine isolated MySQL, captures visitor-facing
projections from the real cache/service/loader, then builds a separate production
Next app under ignored `.tmp/`. It checks 36 labeled scenarios. The four extra
run-phase presentation variants are explicitly synthetic; they do not establish
real provider coverage or production run completion. Fixtures are test-only and
cannot be selected by production URL parameters. Logs and initial HTML remain
in that isolated directory; browser artifacts belong under `output/playwright/`.

These control and presentation changes add no schema, migration, worker,
schedule or paid provider operation.
Existing database, competition, rights, provider/model, budget and hosting gates
remain effective. An unavailable production configuration produces the error
surface. Tests qualify implementation behavior using synthetic stored fixtures,
not live forecast quality or hosted availability. Rollback restores the earlier
page composition while retaining all stored history and the shared read APIs.
