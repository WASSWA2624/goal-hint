# Stored match feed page

Prompt 033 adds [search/filter controls](search-filter-controls.md) through a
persistent client surface. Failed filter navigations retain and label the
previous successful server projection. Prompt 034 adds
[Load more and Back restoration](pagination-navigation.md) while keeping ordinary
pagination links usable without JavaScript.

Explicit filter actions always dispatch normal navigation, so Clear can
supersede a rapid Apply even when returning to the currently displayed URL.
An idle retry of a failed read at the same URL uses `router.refresh()`.

Prompt 032 connects `/en` and `/en/predictions/YYYY-MM-DD` to the existing feed
service. Today and Results share `FeedShell` and `MatchFeedPage`; Results retains
the yesterday/finished default. The first page contains at most the existing
30-card default in kickoff/fixture-ID order. Validated URL variants retain the
existing selected market, filters, sorting and bounded page-size contract.

`server/matches/public-feed.ts` composes the same database, configured competition
scope and MySQL response cache for pages and `/api/matches`. Server Components
call it directly. `getShellInstant` supplies one request-scoped instant to the
header, browsing date and page read so midnight cannot split a single
render across dates. A serialized `tz` resolves Today and date presets in that
zone. Cache hits preserve their original response/source clocks.
Full-page HTTP caching remains disabled by dynamic request rendering.

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

Desktop quick date presets use ordinary links with prefetch disabled and retain
their existing date-navigation behavior. The body search bar is shared across
every screen size. Phones and tablets use an Advanced filters button to reveal the fields;
desktop always shows all fields and omits that toggle. Search edits the same Redux draft as the
filter fields; Enter in search and Apply both submit the complete validated
draft and reset page position to one. Four native From date, To date, From time
and To time inputs share the filter section, which starts collapsed below
64rem and remains expanded on desktop. Equal date endpoints select a day and equal
time endpoints select a kickoff minute. Different date
endpoints select an inclusive range of up to 366 days; time ranges retain inclusive
minute bounds and their explicit timezone. Incomplete or invalid ranges remain
editable and disable Apply. Date steppers, date popovers and time mode menus are
absent. Historical queries retain the MySQL-supported years 1000–9999. Direct
invalid or incompatible dates/queries return the existing 404 shell.

The page uses the shared light or dark shell, controls, feedback and match cards
with the subtle 2px `theme.border.radius` token. Connected table and row edges remain square.
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

Below 64rem, feed pages hide the shell header, so `FeedHeader` opens with the
branded bar. It uses the same navy-to-teal `theme.header.background` and brand
edge as the desktop header, has a 3rem (48px) minimum height, and runs past the
feed's 8px gutters and top padding to the screen edge. The inverse logo links
home as "Goal Hint home" and can shrink on narrow screens with enlarged text.
The theme button sits at the end of the row and switches between the approved
R03 Light and R04 Dark palettes. Feed sections use 6px gaps. There is no
visible feed page heading or subtitle on phones or tablets. One responsive h1
preserves the semantic page heading and becomes visible on desktop. The search
bar and labelled Advanced filters button sit below the header in the page body and remain
visible whether filters are open or collapsed.

On phones and tablets the body Advanced filters button opens or collapses one section
containing the date/time pairs together with Markets, Leagues, Countries and
Probability. The section starts collapsed below 64rem; desktop always shows
all fields. Escape closes the mobile section without applying its draft;
clicking outside leaves it open. A down or up chevron indicates the collapsed
or expanded state, and the button's accessible name and title say Show advanced
filters or Hide advanced filters. Checklist popovers retain their own
outside-click and Escape dismissal. The common range controls render once:
initial HTML contains exactly two date and two time inputs while collapsed.
Full From date, To date, From time and To time labels sit inside their subtly rounded
controls, above each native value in narrower layouts and to its left in wider layouts.
Each pair occupies one phone row and is directly editable when expanded.
Compact padding preserves readable text and lets the expanded controls scroll
naturally with the page on smaller screens. There are no visible Date range/Time
range group headings, nested date/time panels or per-range Apply buttons.
Accessible fieldset names, input labels, focus rings and invalid feedback remain
present. Invalid or incomplete edits are retained; a single Apply action remains
disabled until the complete draft is valid.

Expanded mobile filters use one labeled summary dropdown each for Markets,
Leagues and Countries. A single selection displays its name, multiple selections
display a count, and the checklists retain all choices, with search for leagues
and countries. Country options and selected country summaries use bundled local
SVG flags with readable names if a flag is unavailable. Probability uses compact
directly editable minimum/maximum fields, accepting decimal percentages from
0 through 100 with minimum no greater than maximum; equal bounds are valid.
The muted Odds unavailable explanation remains compact. Mobile filter edits
remain drafts until Apply; no timer applies them automatically.

On phones and tablets, Advanced filters, Clear and Apply always retain visible backgrounds and solid 1px borders, with the shared 2px corner radius.
One persistent action row below the filter options stays outside the mobile
collapsible section and places Sort by first, followed by Clear and Apply
filters. The action group aligns right on desktop, while mobile keeps Sort on
the left. When the mobile fields are collapsed, the row follows search directly. A compact
summary shows the applied date or range, markets, leagues
and countries, with search, time and probability constraints when present.
The summary uses the applied query and does not change while its draft is
edited. On desktop its chips sit at the far left of the same row as the actions
on the right; mobile places the summary underneath the actions. Filter fields sit between search
and the action row, always visible on desktop and toggleable on mobile. The applied
query's total match count sits with the results below the toolbar and summary, updates with
the displayed projection and is omitted when no successful projection is available. Editing a draft
does not request an advisory count or change that label. Empty-result messages
appear below the action row. The sort menu
contains both kickoff directions and
both probability directions. Picks only/With predictions and a separate
reverse-order button are absent on every device. Clear retains the applied
date/range, status and page size while clearing the other filters and ordering.

Desktop retains the visible page title, shell logo, quick date presets and table
layout, with its theme control at the far right of the shell header. Feed pages
omit the shell search and use the same body search bar,
persistent actions and applied summary as compact screens. All filter fields
remain visible on desktop, without a Filters toggle. Inline date/time controls
precede one row of Leagues, Countries,
Markets, Odds and Probability fields. Probability uses compact minimum/maximum
decimal percentage inputs; the row contains no sliders. One Apply action
submits all search and filter edits. The sort menu remains independent and
applies ordering immediately from the applied query. Sort, Clear and Apply
align to the right below the fields, with the applied summary chips at the far
left of that same row.

Mobile cards use the approved flat-dividers presentation: tiny Market, Pick,
Prob. and Result captions above compact values, with exact available
odds beneath the prediction. White or dark surfaces, fine borders and subtly rounded
edges separate cards from the darker page canvas. Textual Win, Loss and Pending
labels carry green, red and amber semantic tones. Desktop retains its table
composition and adds the aligned Result column. Missing predictions use dashes
on mobile and Unavailable on desktop, with the complete reason kept accessible.

The distinct bottom navigation bar is 42px tall before the device safe-area
inset. It uses the dark title-bar surface in both themes and a single teal
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
