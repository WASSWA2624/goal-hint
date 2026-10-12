# Stored match feed page

Prompt 033 adds [search/filter controls](search-filter-controls.md) through a
persistent client surface. Failed filter navigations retain and label the
previous successful server projection. Prompt 034 adds
[Load more and Back restoration](pagination-navigation.md) while keeping ordinary
pagination links usable without JavaScript.

Prompt 032 connects `/en` and `/en/predictions/YYYY-MM-DD` to the existing feed
service. Today and Results share `FeedShell` and `MatchFeedPage`; Results retains
the yesterday/finished default. The first page contains at most the existing
30-card default in kickoff/fixture-ID order. Validated URL variants retain the
existing selected market, filters, sorting and bounded page-size contract.

`server/matches/public-feed.ts` composes the same database, configured competition
scope and MySQL response cache for pages and `/api/matches`. Server Components
call it directly. `getShellInstant` supplies one request-scoped instant to the
header, reporting date and page read so an EAT midnight cannot split a single
render across dates. Cache hits preserve their original response/source clocks.
Full-page HTTP caching remains disabled by dynamic request rendering.

`FeedStateProvider` receives the query with `data: null`: cards render from the
server projection props and the store only holds the filter draft, so hydration
does not validate the page's records a second time.
Initial server rendering supplies the cards without reading Redux or starting browser
requests. Search/filter controls now use the shared persistent surface; the
pagination uses the same surface and a bounded metadata-only checkpoint. Prompt 037 owns live refresh and
open-tab midnight rollover. Search visits continue to consume the shared
aggregate limiter before cache lookup.

## Navigation and presentation

Desktop quick date presets use ordinary links with prefetch disabled and retain
their existing date-navigation behavior. Four native From date, To date, From
time and To time inputs stay visible on every device; one Apply action submits
the complete filter draft and resets page position to one. Equal date endpoints
select a day and equal time endpoints select a kickoff minute. Different date
endpoints select an inclusive range of up to 31 days; time ranges retain inclusive
minute bounds and their explicit timezone. Incomplete or invalid ranges remain
editable and disable Apply. Date steppers, date popovers and time mode menus are
absent. Historical queries retain the MySQL-supported years 1000–9999. Direct
invalid or incompatible dates/queries return the existing 404 shell.

The page uses the shared light shell, square controls, feedback and match cards.
Cards form one column below 64rem and an aligned table above it. Every feed logo
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
timestamps follow the same display rule. Date-only feed selections, reporting
cohorts, prediction windows and schedules remain in EAT; an explicit time filter
retains the existing local-day/minute window behavior in its serialized IANA
zone. Displaying an instant in a different local calendar day does not change
the reporting boundaries. Stored delays remain visible. The page never
substitutes a sample forecast or selects
a current preview for an empty lock.

### Compact header and filters

Below 64rem, feed pages hide the shell header, so `FeedHeader` opens with the
branded bar. It uses the same navy-to-teal `theme.header.background` and brand
edge as the desktop header, has a 3rem (48px) minimum height, and runs past the
feed's 8px gutters and top padding to the screen edge. The inverse logo links
home as "Goal Hint home" and can shrink on narrow screens with enlarged text.
The 32px translucent filter and search buttons sit at the end of the row and
fill with inverse teal while open. Feed sections use 6px gaps. There is no
visible feed page heading or subtitle; a visually hidden h1 preserves the
semantic page heading. An open search form has one search icon on its submit
button, while the brand-bar toggle becomes Close.

The date and time input pairs remain visible when the other phone filters are
collapsed. Full From date, To date, From time and To time labels sit inside their
square controls, to the left of each native value. Each pair occupies one phone
row. There are no visible Date range/Time range group headings, nested date/time
panels or per-range Apply buttons. Accessible fieldset names, input labels,
focus rings and invalid feedback remain present. Invalid or incomplete edits
are retained; a single Apply action remains disabled until the complete draft
is valid.

Expanded mobile filters use one labeled summary dropdown each for Markets,
Leagues and Countries. A single selection displays its name, multiple selections
display a count, and the checklists retain all choices, with search for leagues
and countries. Country options and selected country summaries use bundled local
SVG flags with readable names if a flag is unavailable. Probability presets and
the muted Odds unavailable explanation remain compact. Mobile filter edits
remain drafts until Apply; no timer applies them automatically.

The results toolbar places the shared Clear and Apply actions to the left of
Sort by. Phones use compact Clear/Apply labels, with the current loaded match
count on its own row above. The sort menu contains both kickoff directions and
both probability directions. Picks only/With predictions and a separate
reverse-order button are absent on every device. Clear retains the applied
date/range, status and page size while clearing the other filters and ordering.

Desktop retains the shell logo and search, quick date presets and table layout.
The same always-visible inline date/time controls precede one row of Leagues,
Countries, Markets, Odds and Probability fields. Probability uses compact
minimum/maximum number inputs; the row contains no sliders. One Apply action
submits all filter edits, and its desktop label can show the advisory draft
count. The independent sort menu remains in the results toolbar.

## Coverage, progress and errors

| Stored/read condition | Page behavior |
| --- | --- |
| Complete imports and no known fixtures | No fixtures confirmed. |
| Missing, pending, failed, partial or degraded coverage | No page-level banner; stored fixtures still list and each affected card notes partial coverage. Empty unknown dates say Fixture data unavailable. |
| Matching fixtures without the selected family | No page-level notice; the fixture cards remain visible and each row states why it has no pick. |
| Stored fixtures with no filter matches | No matches for these filters. |
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
