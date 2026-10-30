# Match search and filters

`scripts/verify-unified-match-filters.js` exercises applied desktop and phone
status/date changes and native GET forms against the SQL-backed rendering
fixture. `scripts/verify-desktop-feed-controls.js` covers draft transactions,
dialog resets and responsive lifecycles. `scripts/verify-mobile-feed-controls.js`
covers Compact stack, its separate date editor, and phone sheet behavior. Run
them through Playwright CLI's
`run-code --filename` after the local rendering fixture's verification passes.

The feed uses labeled native fields and editable drafts; URLs and stored server
projections remain authoritative. At desktop widths (64rem and above), the
approved Compact toolbar puts search, match status, period and sorting on the
first row, with no visible page title or selector prefixes. The second row
contains five optional-filter buttons, Predictions only, a quiet Reset action
and the primary Apply filters action. Square 32px controls, 12px labels,
compact icons, 8px panel padding and 6px gaps match the predicted-match rows.
Controls wrap when enlarged text or longer labels need more room; coarse
pointers retain targets of at least 44px. The existing popup fields keep their
previous sizes and behavior.
The optional sections are Match Date & Time, Leagues, Countries, Markets, and
Limits, in that order. Each opens its own modal dialog; detailed fields and
duplicate default-summary chips do not occupy the desktop section.

On desktop, the complete filter panels on Matches, Best Slips and Slip Builder
stick beneath the app header while results scroll. They share the shell's
header-height offset and remain above the cards, with opaque theme surfaces.
The Best Slips applied summary and Builder criteria summary remain inside their
panels. Phone and tablet filters continue in normal page flow.

Desktop app pages join adjacent filter, summary and result sections without
page-background gutters. Shared section geometry also applies to Performance
and Analytics; inner controls and result-card spacing keep their own tokens.
The app content starts flush with the preceding header/access section, and
Analytics uses the same header-height offset as the public sticky filters.

Below 64rem, the approved Compact stack has two resting rows: full-width search,
then one Date button, the match-status selector, and an icon-only Advanced
filters button. Search uses a labeled submit icon at its leading edge and also
submits on Enter. The date button shows the applied preset or date range and
opens its own editor. Sorting and Reset live inside Advanced filters. The day
strip, second period selector, and repeated Showing summary are absent from the
enhanced mobile layout. Square controls, compact 12–13px text, quiet borders,
and theme colors match the mobile cards; top-level targets remain at least 44px.
The compact panel adds no inline padding and uses 4px gaps between its rows and
controls. The date sheet uses 10px body padding, 10px section gaps, and 4px gaps
between preset buttons, retaining 44px targets.

Responsive enhancements replace the original controls after hydration. The
original native GET form remains the server-rendered and no-JavaScript fallback,
including its named period selector and day links. Desktop keeps its existing
Compact toolbar and dialog behavior. Only the selected responsive control tree
is mounted after hydration.

The Matches page opens with an empty search, All statuses, Today, Highest chance
order, all four markets, and unrestricted leagues, countries, kickoff time,
probability and odds. Predictions only follows the existing access rules below.
Today resolves in the browsing zone and remains current across midnight;
explicit date selections stay unchanged. Stored API defaults remain Last 30 days
and kickoff descending; dated archive routes retain their named dates and
kickoff default.
Desktop search, period, sort, Picks only and optional-filter edits remain
unsubmitted until Enter in the search field or Apply filters submits the complete
draft. The desktop Period dropdown offers Last 30 days, Last 7 days, Last 3 days,
Yesterday, Today, Tomorrow, Next 3 days, Next 7 days, Next 30 days and Custom
dates, in that order. Each Last range includes today. Custom dates opens Match
Date & Time immediately. Last 7 days, Last 3 days
and Yesterday use named relative query presets (`when=last-7-days`,
`when=last-3-days`, `when=yesterday`) so their bounds remain relative across midnight.
Existing shared future-date query presets remain supported.
Both submission paths normalize NFC/whitespace, validate all fields and reset page
to one. Search text retains spaces while typing, and draft edits make no
requests. On mobile, status changes apply immediately; dates wait for Apply dates,
and advanced edits, including sorting, wait for Apply filters. Draft edits make
no count-preview requests.
The initial provider query does not trigger a deferred draft reset, so immediate
typing survives hydration. Real canonical query changes synchronize the draft
before paint.

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
Leagues, Countries and Probability. Below 64rem, dates have one dedicated editor;
Advanced filters contains sorting, kickoff time, markets, leagues, countries,
probability, Predictions only, timezone actions and the Odds explanation. It
contains no duplicate date fields. Reset filters and Apply filters stay pinned
at its foot. Opening either phone sheet moves focus into it, keeps Tab inside,
and stops the page behind from scrolling. The close button, Escape or a tap on
the backdrop discards unapplied edits and restores focus to that sheet's
trigger. Closing Advanced filters retains typed search text. Apply and Reset
close that sheet. Widening to desktop closes an open phone sheet. These sheets
are fixed elements inside the form, so no ancestor of the form may be a CSS size
container.

The desktop Match Date & Time dialog holds both date and time pairs. Leagues and
Countries each hold their own searchable selection. Markets holds the market
choices; Limits holds probability bounds and current Odds availability. Each
dialog has its own Reset, Cancel and Done controls. Local Reset changes only that dialog's
draft and keeps it open: dates return to Today and 00:00–23:59; Leagues
returns to all leagues, Countries to all countries, Markets to all supported
families, and Limits returns probability and odds to Any. Resetting one selection
does not reset any of the others. The browsing zone is retained. Search, Picks
only, sorting and the other dialogs' settings are unaffected. Local Reset does
not navigate or fetch a result.

Done validates and retains that section's draft; it does not submit the
whole feed. Cancel, Escape, the close button and backdrop dismissal restore the
section's values from when it opened, including undoing a local Reset. Native
dialog behavior contains focus and restores it to the trigger on close. Count
badges replace an Edited label: Match Date & Time counts the selected date range
as one, including Today, plus one for an active kickoff-time restriction;
Leagues and Countries each count their own selections; Markets counts selected
market families; Limits counts configured numeric bounds, with minimum and maximum
counted separately. Two restricted probability endpoints count as two; non-default
odds endpoints also count when present. Odds fields remain disabled until provider
odds display is enabled. Market defaults show all four supported families on the
Markets control only. Zero counts are hidden.
Accessible summaries describe selection counts as selected and date/time or Limits
counts as filters set.

The native fallback renders the common range controls once, so the initial HTML
contains exactly two date and two time inputs, including when its mobile sheet
is closed. Enhanced date fields mount in the dedicated phone editor when opened;
enhanced desktop fields mount when their section opens. Both use options already
supplied with the page, and opening an editor adds no feed request. Mobile labels
sit above native fields with 16px values. Dates and times are paired and stack
when their container or enlarged text needs more room. Match dates and Kickoff
time headings, optional time guidance and the browsing zone remain readable.
Desktop uses its compact dialog fields. There are no time mode menus. Focused
controls and invalid values retain visible feedback.

The phone Date button is the single date entry point. Its sheet combines the
nine relative presets with custom From date and To date fields. Selecting a
preset changes only the local date draft and retains its named preset, so a
relative range remains relative across midnight. Editing the endpoints selects
one explicit day or an inclusive range. Apply dates validates and applies the
date selection while retaining the other applied filters; Cancel or dismissal
discards the date draft. Live selects Today, clears kickoff-time restrictions,
and disables the Date button with an accessible explanation. The original day
strip remains in the native fallback; its canonical day
links and distant-day indexing policy remain unchanged (see
[SEO discovery](seo-discovery.md)).

Equal date endpoints select one day; different endpoints select an inclusive
range of up to 366 days. Equal time endpoints select one kickoff minute; different
endpoints select an inclusive minute range. Unrestricted time fields show From
00:00 and To 23:59 in the initial HTML and after reset. Clearing an endpoint
restores its corresponding full-day bound. The full-day pair is unrestricted:
it adds no time constraint, canonical time parameters or active-filter count.
A reversed range or invalid date/time remains editable and disables its editor's
Apply action. Browsing `tz` is independent of optional time bounds: dates select
complete local days, including DST boundaries, and full-day time fields keep
that zone. Reset filters removes time constraints, restores Today
and retains the browsing zone. An unzoned relative entry adopts the device
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
another market's higher price. Matches defaults to probability descending
(Highest chance), with missing picks last and kickoff/ID ties. The API and dated
archive routes retain kickoff descending (Latest first), then fixture ID
descending. `dir=asc` reverses the selected sort. Explicit page choices,
including Last 30 days and kickoff ordering, survive navigation and reloads.
The probability range (`prob`) accepts integer or decimal
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
Native fallback chip links retain the canonical URL with that value toggled
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

On desktop, Sort by sits at the end of the first toolbar row and retains its
accessible label. It shows the current draft choice and opens the four-option
menu; the main Apply action submits it with the rest of the draft. Predictions
only follows the five dialog buttons on the second row, with Reset and Apply
filters aligned at the end. Reset restores and applies the complete filter
defaults immediately.
On phones, the Date and Status controls, search value, and Advanced filters
badge describe the applied scope without an additional Showing block. The icon
button's accessible name includes its applied-filter count. Its mobile badge
also counts non-default sorting and Predictions only choices now held inside
the sheet. Predictions only defaults to selected on full-access feeds; the
existing access/status policy determines its default elsewhere. This local
mobile count does not change the shared query count or desktop badges. Sorting
is edited inside Advanced filters and applies with that sheet's complete draft.
A Changes ready to apply notice distinguishes valid unsent edits. Phone controls retain
visible backgrounds, solid 1px borders, shared subtle corner radii, and top-level targets
of at least 44px. The phone match count updates with the displayed projection,
including live refreshes; desktop shows it with the results. It is omitted when
no successful projection is available. Draft edits make no count-preview
requests. Apply filters submits the complete
search, time and optional-filter draft while retaining the separately applied
dates. Reset filters resets
search, leagues, countries, time, probability, odds, picks and ordering, selects
Today, all supported markets and probability descending order (Highest chance),
and resets page to one. Predictions only returns to the available page default,
rather than always being cleared. The time fields show 00:00–23:59 without restricting kickoff times.
It restores All match statuses and retains the browsing zone and page size. The button labels are
Reset filters and Apply filters in the mobile sheet; desktop uses Reset and
Apply filters at the end of the second toolbar row.
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
control. Desktop puts search beside match status, period and sorting without a
visible page title or selector prefix, with the theme control at the far right of the shell
header; feed pages
omit the shell search so there is one body search bar on every device. The
mobile Advanced filters icon button has `aria-haspopup="dialog"`,
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
