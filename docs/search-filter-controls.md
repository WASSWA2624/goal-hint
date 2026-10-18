# Match search and filters

The feed uses shared labeled native fields and a per-provider Redux draft;
URLs and stored server projections remain authoritative. A persistent search
bar sits in the page body on every screen size. Phones and tablets use the
Day Strip layout: full-width search; a day strip with earlier/later scroll
buttons and a Calendar button; then one row with the match count, the Sort
menu and an Advanced filters button. Advanced filters opens a bottom sheet holding every other
filter. Desktop always shows the search bar and all filter fields, without a
sheet or day strip. The default date range is the last 30 calendar days through
today, resolving from today minus 29 days to today in the browsing zone. The
relative preset remains current across midnight; explicit date selections stay unchanged.
Search and filter edits share one draft and remain unsubmitted until Enter in
the search bar or the single Apply action submits the complete draft. Both
submission paths normalize NFC/whitespace, validate all fields and reset page
to one. Search text retains spaces while typing, and draft edits make no
requests. There is no automatic mobile application or count preview.

Apply navigates through `feedQueryHref` using the App Router and a transition.
The same parser and stored service handle initial rendering, Apply, reload,
shared URLs and Back. Next discards superseded navigations. Explicit filter
actions always dispatch normal navigation, including a rapid Apply followed by
Reset back to the currently displayed URL. Only an idle retry of a failed read
at the same URL uses `router.refresh()`. The shared form retains a canonical
GET search fallback with the applied query parameters and page reset to one.
Empty "all" options parse as empty lists and are omitted from canonical URLs. Repeated
`league`, `country` and `market` keys from checkbox forms join like comma lists.
Repeated single-value keys, unknown keys (including the removed `sortMarket`)
and other malformed parameters remain invalid.

From date, To date, From time and To time share the filter fields with Markets,
Leagues, Countries and Probability. Below 64rem these fields live in a modal
bottom sheet (`role="dialog"`) above the tab bar, opened by the Advanced filters button.
The sheet lists, in order: Match dates, Kickoff time, Markets, Leagues,
Countries, Probability and the Odds explanation, with Reset filters and Apply filters
pinned at its foot. Opening it moves focus into the sheet, keeps Tab inside
it and stops the page behind from scrolling. The close button, Escape or a tap
on the backdrop discards unapplied filter edits (typed search text stays) and
returns focus to Advanced filters. Apply and Reset close the sheet. Widening to desktop
closes it. The sheet is a fixed element inside the form, so no ancestor of the
form may be a CSS size container.
At desktop widths all fields remain visible. The common range controls are
rendered once, so the initial HTML contains exactly two date and two time
inputs, including when the mobile sheet is closed. Mobile labels sit
above square 40px native fields with 16px values. Dates and
times are paired; the date pair stacks below 361px, and both pairs stack when
their container or larger text needs more room. Match dates and Kickoff time
headings, optional time guidance and the browsing zone are visible. Desktop
keeps its compact fields. There are no time mode menus or separate range Apply
buttons. Focused controls and invalid values retain visible feedback.

The phone day strip has no first or last day: it starts centred on the
selected day (or the first day of a range) and adds 30 days whenever either
end comes within a screen of view, keeping the visible days in place. It shows
three, five or seven whole days, depending on width, so the selected day sits
exactly in the middle; it scrolls by touch, and the earlier/later buttons
scroll it by a page of days without selecting anything. Tapping a day applies
it at once, highlights it immediately and centres it. Today reads Today, and
the first of each month shows its month name. Day links are canonical URLs
(`when=today`/`when=tomorrow` presets, otherwise a dated route) that keep the
applied filters. The Calendar button opens a month calendar in a bottom sheet:
the first tap picks a day, a later tap within a year ends a range, and Apply
dates applies one day or the range, keeping the other applied filters. While a
multi-day range is applied, no day is highlighted and the Calendar button is
filled and shows the range. The strip is absent for live matches.

Equal date endpoints select one day; different endpoints select an inclusive
range of up to 366 days (the last-30-days view is only the default). Equal time endpoints select one kickoff minute; different
endpoints select an inclusive minute range. Unrestricted time fields show From
00:00 and To 23:59 in the initial HTML and after reset. Clearing an endpoint
restores its corresponding full-day bound. The full-day pair is unrestricted:
it adds no time constraint, canonical time parameters or active-filter count.
A reversed range or invalid date/time remains editable and disables the shared
Apply action. Browsing `tz` is independent of optional time bounds: dates select
complete local days, including DST boundaries, and full-day time fields keep
that zone. Reset filters removes time constraints, restores the last 30 days
through today and retains the browsing zone. An unzoned relative entry adopts the device
zone after hydration; explicit named dates and shared applied zones remain
stable. Unzoned explicit dates retain their EAT boundaries. New time selections
use the applied browsing zone, or the device zone when none is applied; its IANA
name is available from each time input's title. Desktop quick date links retain
the applied zone and resolve Today and the next six dates in that calendar.

League options contain at most 1,000 unique visitor-facing id/name/country
entries from the complete selected date cohort, independent of filters/page.
They share the records' RepeatableRead transaction. Overflow fails honestly
instead of silently losing options. Feed cache projection version 2 preserves
existing catalog invalidation and the response-size bound. Legacy DTOs may omit
options and parse to an empty array. Each league retains its approved logo and
fixture count. Options list the leagues with the most fixtures first, then by
name. Country options are the distinct competition countries of those leagues,
with combined counts. Country flags load from the bundled local SVG assets in
country options, selected chips and a single-country mobile summary. Unmapped
or failed flags leave the readable country name in place.

The feed filters and orders by each fixture's shown pick: the most likely
available pick among the selected markets, with exact probability ties broken
by fresh odds for the same published family/selection, then policy order. The same rule
picks the market shown on the card (`bestCardFamily`). Markets defaults to Any,
which includes every supported family. Probability and Odds default to Any,
applying no bounds. Odds, when available, belong to the shown pick rather than
another market's higher price. Default order is kickoff descending (Latest first), then fixture ID descending.
`dir=asc` selects Earliest first. Probability order
is descending by default (`dir=asc` reverses it), with missing picks last and
kickoff/ID ties. The probability range (`prob`) accepts integer or decimal
percentages in 0–100 and keeps only fixtures whose shown pick's unrounded
percentage lies between both inclusive endpoints. Equal endpoints select an
exact probability; no display-rounding allowance is used. The Picks only/With predictions
control is absent at every screen size; existing shared URL/parser compatibility
is unchanged. See the [stored match feed](match-feed-api.md) for that contract.

Desktop filters place Leagues, Countries, Markets, Odds and Probability
in one row. League, country and market fields retain selected chip links and complete
checklists, searchable for leagues and countries with the same football name matcher
as the feed search: direct matches first, then spelling-tolerant ones under a
"Similar results" heading, and "No matching options" when neither exists. Each chip's `href` is the
canonical URL with that value toggled and page reset, preserving ordinary link
behavior. Probability uses compact minimum/maximum fields accepting plain
decimal numbers from 0 through 100; the minimum cannot exceed the maximum, and
blank endpoints mean Any; incomplete numeric or invalid drafts prevent Apply filters. The filter
row contains no sliders. Odds controls remain disabled with their explanation
until provider odds display is enabled.

In the mobile sheet, Markets are four toggle buttons (`aria-pressed`) in each
market's card colour; the last selected market cannot be turned off. Leagues
and Countries each use one labeled summary button whose complete, searchable
checklist opens in place inside the sheet. One selection shows its name;
multiple selections show their count. Empty league and country selections show
Any. When every market is selected, its summary also shows Any. Selected values missing from a refreshed option
list remain removable. Probability uses the same directly editable
minimum/maximum fields as desktop. Mobile retains the muted Odds unavailable
explanation.

On desktop, Sort, Reset and Apply sit right-aligned below the filter fields,
with a compact summary of the applied date or range, markets, leagues and
countries (plus search, time and probability constraints when present) at the
far left of the same row. On phones the row below the day strip holds the
applied match count, the Sort menu and Advanced filters; the sort label shortens
before the row would wrap. Sorting retains its immediate navigation behavior.
Advanced filters badges the number of applied filters. The applied summary appears on
phones under Showing only when a filter or search is applied. These describe
the applied query, rather than unsent edits. In the sheet, a Changes ready to
apply notice distinguishes valid unsent edits. Phone controls retain visible
backgrounds and solid 1px borders, with square corners and button targets of
at least 44px. The phone match count updates with the displayed projection,
including live refreshes; desktop shows it with the results. It is omitted when
no successful projection is available. Draft edits make no count-preview
requests. Apply filters submits the complete
search, date, time and filter draft. Reset filters resets
search, leagues, countries, time, probability, odds, picks and ordering, selects
the last 30 days through today, all supported markets and kickoff descending order (Latest first),
and resets page to one. The time fields show 00:00–23:59 without restricting kickoff times.
It retains the browsing zone, status entry and page size. The button labels are
Reset filters and Apply filters, each in two rows on mobile and one row on desktop.
Advanced filters uses the same two-line label treatment on mobile, with both words visible.
An empty-result message appears with the results. The sort menu includes
both kickoff directions and both probability directions, without a separate
reverse-order button.

Checklist popovers use native buttons and fields, close on an outside click
or Escape, and return focus to their trigger on Escape. Dismissing a checklist
does not collapse the surrounding filter section or apply its draft. Shared
fields provide labels, descriptions, errors
and visible focus. A polite query status
announces loading/counts/failures; cards are not live regions. Controls remain
usable during navigation.

`FeedSurface` retains the last successful projection across filter navigations.
A failed read displays its failure and labels retained cards with their original
dates, filters and market. Initial failures have no fabricated cards. Empty
filters, confirmed-empty, insufficient-prediction and partial-coverage states
remain reader-owned. [Pagination/scroll checkpoints](pagination-navigation.md)
retain loaded extent and Back restoration; effective query changes cancel
pending loads and restart that extent. [Live refresh](live-client-refresh.md)
retains its existing refresh behavior. No browser provider/AI calls or polling
are added by the controls.

On phones and tablets the feed's brand bar contains the home logo and theme
control. Desktop retains the page title and quick date presets, with the theme
control at the far right of the shell header; feed pages
omit the shell search so there is one body search bar on every device. The
mobile Advanced filters button has a visible label, `aria-haspopup="dialog"`,
`aria-expanded`/`aria-controls` for the sheet, and an accessible name that
includes the active filter count. The feed uses one semantic h1: it stays visually
hidden on phones and tablets to conserve space and visible on desktop. Only the
brand bar stays sticky. The subtitle
remains absent.

Acceptance uses owned MySQL storage with synthetic inputs, an isolated production
Next app built from captured SQL projections, and Chrome through the Playwright
skill. Production routes contain no fixture switch.
