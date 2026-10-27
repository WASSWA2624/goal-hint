# Match search and filters

The feed uses labeled native fields and editable drafts; URLs and stored server
projections remain authoritative. At desktop widths (64rem and above), the
Crisp Outline controls put the search field and period selector on the first
row, with no visible page title or Period prefix. Five optional-filter buttons
occupy the next horizontal row, followed by one action row ordered Predictions
only, Sort by, Reset, Apply filters. Compact fields, neutral
borders, compact icons and a single blue Apply action follow the existing themed controls.
The optional sections are Match Date & Time, Leagues, Countries, Markets, and
Limits, in that order. Each opens its own modal dialog; detailed fields and
duplicate default-summary chips do not occupy the desktop section.

Phones and tablets retain the Day Strip layout: full-width search; a day strip
with earlier/later scroll buttons and a Calendar button; then the existing row
with sorting and Advanced filters. Advanced filters opens the existing bottom
sheet. The responsive desktop enhancement replaces the original controls after
hydration; the original form remains the server-rendered and no-JavaScript
fallback. Only one layout's control tree is mounted at a time.

The default date range is the last 30 calendar days through today, resolving
from today minus 29 days to today in the browsing zone. The
relative preset remains current across midnight; explicit date selections stay unchanged.
Desktop search, period, sort, Picks only and optional-filter edits remain
unsubmitted until Enter in the search field or Apply filters submits the complete
draft. The desktop Period dropdown offers Last 30 days, Last 7 days, Last 3 days,
Yesterday, Today, Tomorrow and Custom dates, in that order. Each Last range includes
today. Custom dates opens Match Date & Time immediately. Last 7 days, Last 3 days
and Yesterday use named relative query presets (`when=last-7-days`,
`when=last-3-days`, `when=yesterday`) so their bounds remain relative across midnight.
Existing shared future-date query presets remain supported.
Both submission paths normalize NFC/whitespace, validate all fields and reset page
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

From date, To date, From time and To time share the filter model with Markets,
Leagues, Countries and Probability. Below 64rem these fields retain their modal
bottom sheet (`role="dialog"`) above the tab bar, opened by the Advanced filters button.
The sheet lists, in order: Match dates, Kickoff time, Markets, Leagues,
Countries, Probability and the Odds explanation, with Reset filters and Apply filters
pinned at its foot. Opening it moves focus into the sheet, keeps Tab inside
it and stops the page behind from scrolling. The close button, Escape or a tap
on the backdrop discards unapplied filter edits (typed search text stays) and
returns focus to Advanced filters. Apply and Reset close the sheet. Widening to desktop
closes it. The sheet is a fixed element inside the form, so no ancestor of the
form may be a CSS size container.

The desktop Match Date & Time dialog holds both date and time pairs. Leagues and
Countries each hold their own searchable selection. Markets holds the market
choices; Limits holds probability bounds and current Odds availability. Each
dialog has its own Reset, Cancel and Done controls. Local Reset changes only that dialog's
draft and keeps it open: dates return to Last 30 days and 00:00–23:59; Leagues
returns to all leagues, Countries to all countries, Markets to all supported
families, and Limits returns probability and odds to Any. Resetting one selection
does not reset any of the others. The browsing zone is retained. Search, Picks
only, sorting and the other dialogs' settings are unaffected. Local Reset does
not navigate or fetch a result.

Done validates and retains that section's draft; it does not submit the
whole feed. Cancel, Escape, the close button and backdrop dismissal restore the
section's values from when it opened, including undoing a local Reset. Native
dialog behavior contains focus and restores it to the trigger on close. Count
badges replace an Edited label: Match Date & Time counts active date/time ranges;
Leagues and Countries each count their own selections; Markets counts selected
market families; Limits counts configured numeric bounds, with minimum and maximum
counted separately. Two restricted probability endpoints count as two; non-default
odds endpoints also count when present. Odds fields remain disabled until provider
odds display is enabled. Market defaults show all four supported families on the
Markets control only. Zero counts are hidden.
Accessible summaries describe selection counts as selected and date/time or Limits
counts as filters set.

The common range controls are rendered once, so the initial HTML contains exactly
two date and two time inputs, including when the mobile sheet is closed. Enhanced
desktop dialog fields mount when their section opens, using the options already
supplied with the page; opening a dialog adds no feed request. Mobile labels sit
above 40px native fields with 16px values and the shared 2px corner radius. Dates and
times are paired; the date pair stacks below 361px, and both pairs stack when
their container or larger text needs more room. Match dates and Kickoff time
headings, optional time guidance and the browsing zone are visible. Desktop
uses its compact dialog fields. There are no time mode menus. Focused controls
and invalid values retain visible feedback.

The phone day strip runs to the calendar's own ends (1000-01-01 and
9999-12-31): it starts centred on the
selected day (or the first day of a range) and adds 30 days whenever either
end comes within a screen of view, keeping the visible days in place. Links to
days more than 31 days ahead are `rel="nofollow"`, and an empty day that far from
today answers 404 on a full page load (see [SEO discovery](seo-discovery.md)). It shows
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
name is available from each time input's title. Desktop period choices retain
the browsing zone and resolve their date bounds in that calendar.

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
exact probability; no display-rounding allowance is used. Predictions only is
selected by default where the filter is available: full-access feeds and finished
results. Reset restores that default. An explicit `picks=all` page URL keeps the
checkbox off across reloads, searches, date changes and pagination. Free unfinished
feeds retain their existing subscriber restriction and unrestricted default.
The API query default stays `all`; this page preference does not change anonymous
API reads or offline snapshots. Picks only retains its existing access policy.
See the [stored match feed](match-feed-api.md) for that contract.

Desktop dialogs retain complete league, country and market selections. Both
layouts share the feed's football name matcher: direct matches first, then
spelling-tolerant ones under a "Similar results" heading, and "No matching options"
when neither exists. Selected values remain editable, including missing options.
The unchanged mobile chip links retain the canonical URL with that value toggled
and page reset. Probability uses compact minimum/maximum fields accepting plain
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

On desktop, Picks only, Sort by, Reset and Apply filters share one horizontal
row, in that order. The Sort by control shows its current draft choice and opens
the four-option menu; the main Apply action submits it with the rest of the draft.
The primary Reset restores and applies the complete filter defaults immediately.
On phones the row below the day strip holds the
applied match count, the Sort menu and Advanced filters; the sort label shortens
before the row would wrap. Mobile sorting retains its immediate navigation behavior.
Advanced filters badges the number of applied filters. The applied summary appears on
phones under Showing only when a filter or search is applied. These describe
the applied query, rather than unsent edits. In the sheet, a Changes ready to
apply notice distinguishes valid unsent edits. Phone controls retain visible
backgrounds and solid 1px borders, with the shared 2px corner radius and button targets of
at least 44px. The phone match count updates with the displayed projection,
including live refreshes; desktop shows it with the results. It is omitted when
no successful projection is available. Draft edits make no count-preview
requests. Apply filters submits the complete
search, date, time and filter draft. Reset filters resets
search, leagues, countries, time, probability, odds, picks and ordering, selects
the last 30 days through today, all supported markets and kickoff descending order (Latest first),
and resets page to one. Predictions only returns to the available page default,
rather than always being cleared. The time fields show 00:00–23:59 without restricting kickoff times.
It retains the browsing zone, status entry and page size. The button labels are
Reset filters and Apply filters, each in two rows on mobile; desktop uses Reset
and Apply filters on its single action row.
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
control. Desktop puts search beside the period selector without a visible page
title or selector prefix, with the theme control at the far right of the shell
header; feed pages
omit the shell search so there is one body search bar on every device. The
mobile Advanced filters button has a visible label, `aria-haspopup="dialog"`,
`aria-expanded`/`aria-controls` for the sheet, and an accessible name that
includes the active filter count. The feed uses one semantic h1 that remains
visually hidden at every screen width. The selector retains its accessible name.
Only the brand bar stays sticky. The subtitle remains absent.

Acceptance uses owned MySQL storage with synthetic inputs, an isolated production
Next app built from captured SQL projections, and Chrome through the Playwright
skill. Production routes contain no fixture switch.

For desktop interaction acceptance, open the full-access local feed capture at
`/en/matches?pageSize=30` and run `playwright-cli run-code --filename
scripts/verify-desktop-feed-controls.js`. It checks all five local resets,
Cancel rollback, unrelated draft preservation, no edit-time feed requests,
complete Apply and Back restoration. Its navigation cases use the captured
default and Earliest first queries; arbitrary newly edited queries need a
corresponding stored fixture projection.
