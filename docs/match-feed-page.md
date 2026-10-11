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

Today, Tomorrow and Next 7 days use ordinary links with prefetch disabled. Previous
day and Next day link to explicit EAT dates adjacent to the selected range. Every
date change preserves the applied filters and resets page position to one.
Historical navigation stops at the MySQL-supported years 1000–9999. Direct
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
sync use their original UTC instants formatted in EAT. Stored delays remain
visible. The page never substitutes a sample forecast or selects a current preview
for an empty lock.

### Phone header

Below 64rem, feed pages hide the shell header, so `FeedHeader` opens with the
branded bar. It uses the same navy-to-teal `theme.header.background` and brand
edge as the desktop header, has a 3rem (48px) minimum height, and runs past the
feed's 8px gutters and top padding to the screen edge. The inverse logo links
home as "Goal Hint home" and can shrink on narrow screens with enlarged text.
The 32px translucent filter and search buttons sit at the end of the row and
fill with inverse teal while open. The 18px title follows on the light page;
the static subtitle is hidden on mobile. Feed sections use 6px gaps. An open
search form has one search icon on its submit button, while the brand-bar
toggle becomes Close.

One compact "‹ date ›" stepper remains visible while the filter panel is
collapsed. Its central 12px date button opens the shared From/To picker; there
are no Day/Range buttons. Equal start and end dates select a single day, and
different values select a range of up to 31 days. Apply dates validates and
applies the selection. Previous and next links preserve the other filters and
move by the selected day or range length. The date row and labels grow
naturally when text is enlarged.

Expanded mobile filters replace scrolling suggestion chips and separate
all-options buttons with one labeled summary dropdown each for Markets,
Leagues and Countries. A single selection displays its name, multiple
selections display a count, and the existing checklists retain all choices,
with search for leagues and countries. Probability presets and a quiet Reset
action share a row. Odds unavailable appears as a muted explanation instead of
a disabled select.

The mobile results toolbar places Picks only and the sort dropdown in one
full-width row of two equally sized columns. Both controls fill their columns
and retain 12px text. The match count from the current loaded projection sits
on its own row below, aligned right. The sort menu contains both kickoff
directions and both probability directions, with no separate reverse button.
Controls grow naturally with enlarged text while retaining the two-column row.
Desktop retains the shell logo and search, visible subtitle, date range and
quick presets, draft filters with Apply, and its existing results toolbar and
table layout.

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

No schema, migration, worker, schedule, paid operation or deployment is added.
Existing database, competition, rights, provider/model, budget and hosting gates
remain effective. An unavailable production configuration produces the error
surface. Tests qualify implementation behavior using synthetic stored fixtures,
not live forecast quality or hosted availability. Rollback restores the earlier
page composition while retaining all stored history and the shared read APIs.
