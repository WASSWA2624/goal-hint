# Match search and filters

The feed uses shared labeled native fields and a per-provider Redux draft;
URLs and stored server projections remain authoritative. A persistent search
bar sits in the page body on every screen size. A labelled Advanced filters
button beside it opens the filter fields on phones and tablets; desktop always shows the
search bar and all filter fields, without a collapse toggle.
Search and filter edits share one draft and remain unsubmitted until Enter in
the search bar or the single Apply action submits the complete draft. Both
submission paths normalize NFC/whitespace, validate all fields and reset page
to one. Search text retains spaces while typing, and draft edits make no
requests. There is no automatic mobile application or count preview.

Apply navigates through `feedQueryHref` using the App Router and a transition.
The same parser and stored service handle initial rendering, Apply, reload,
shared URLs and Back. Next discards superseded navigations. Explicit filter
actions always dispatch normal navigation, including a rapid Apply followed by
Clear back to the currently displayed URL. Only an idle retry of a failed read
at the same URL uses `router.refresh()`. The shared form retains a canonical
GET search fallback with the applied query parameters and page reset to one.
Empty "all" options parse as empty lists and are omitted from canonical URLs. Repeated
`league`, `country` and `market` keys from checkbox forms join like comma lists.
Repeated single-value keys, unknown keys (including the removed `sortMarket`)
and other malformed parameters remain invalid.

From date, To date, From time and To time share the filter section with Markets,
Leagues, Countries and Probability. Below 64rem, the body Advanced filters button opens
or collapses this complete section, which starts collapsed. Escape also closes
the section without applying its draft. Clicking outside does not close it.
At desktop widths all fields remain visible. The common range controls are
rendered once, so the initial HTML contains exactly two date and two time
inputs, including when the mobile section is collapsed. Each full label sits
inside its square control, above the native value in narrower layouts and to
its left in wider layouts. The date pair and time pair each occupy one phone row and are
directly editable when expanded. Compact padding preserves readable text and
lets the expanded controls scroll naturally with the page on smaller screens.
There are no visible group headings, date popovers, date steppers, time mode
menus or separate range Apply buttons. The fieldsets retain accessible group
names; focused controls and invalid values retain visible feedback.

Equal date endpoints select one day; different endpoints select an inclusive
range of up to 31 days. Equal time endpoints select one kickoff minute; different
endpoints select an inclusive minute range. Both time inputs empty mean no time
filter. A missing endpoint, reversed range or invalid date/time remains editable
and disables the shared Apply action. Date-only queries retain their EAT
reporting boundaries. Time-filter queries retain the explicitly serialized IANA
zone and the existing local-day/minute behavior, including DST boundaries. New
time selections use the device zone; an applied time selection retains its
stored zone, available from the input title. Desktop quick date links preserve
their existing date-navigation behavior and the seven-day forecast window.

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
picks the market shown on the card (`bestCardFamily`). Default order is kickoff
ascending, then fixture ID. `dir=desc` reverses kickoff order. Probability order
is descending by default (`dir=asc` reverses it), with missing picks last and
kickoff/ID ties. The probability range (`prob`) accepts integer or decimal
percentages in 0–100 and keeps only fixtures whose shown pick's unrounded
percentage lies between both inclusive endpoints. Equal endpoints select an
exact probability; no display-rounding allowance is used. The Picks only/With predictions
control is absent at every screen size; existing shared URL/parser compatibility
is unchanged. See the [stored match feed](match-feed-api.md) for that contract.

Desktop filters place Leagues, Countries, Markets, Odds and Probability
in one row. League, country and market fields retain selected chip links and complete
checklists, searchable for leagues and countries. Each chip's `href` is the
canonical URL with that value toggled and page reset, preserving ordinary link
behavior. Probability uses compact minimum/maximum fields accepting plain
decimal numbers from 0 through 100; the minimum cannot exceed the maximum, and
incomplete or invalid drafts prevent Apply. The filter
row contains no sliders. Odds controls remain disabled with their explanation
until provider odds display is enabled.

Expanded mobile filters use one compact labeled summary button per Markets, Leagues and
Countries field, without scrolling suggestion chips or a duplicate menu. One
selection shows its name; multiple selections show their count. Empty league
and country selections show All leagues and Any. Each summary opens the same
complete checklist, and selected values missing from a refreshed option list
remain removable. At least one market must stay selected. Probability uses the
same directly editable minimum/maximum fields as desktop. Mobile retains the muted Odds unavailable explanation.

One persistent action row sits below the filter options and outside the mobile
collapsible section. Sort by appears first, followed by Clear and Apply filters.
The actions align right on desktop; mobile keeps Sort on the left. When the
mobile fields are collapsed, this row follows the search bar directly. A compact
summary shows the applied date or range,
markets, leagues and countries, plus applied search, time and probability
constraints when present. These chips describe the query that has been
applied, rather than unsent edits. On desktop the summary chips sit at the far
left of the same row as Sort, Clear and Apply on the right. On mobile the
summary stays underneath the action row. Mobile fields expand between search and the action row; search,
sorting, Clear and Apply stay available in both states. Desktop fields always
remain between search and the action row.
On phones and tablets, Advanced filters, Clear and Apply always retain visible backgrounds and solid 1px borders, with square corners.
The applied match count sits with the results below the toolbar and summary and updates
with the displayed projection. It is omitted when no successful projection is available. Draft
edits make no count-preview requests. Apply filters submits the complete
search, date, time and filter draft. Clear resets
search, leagues, countries, time, probability, odds, picks and ordering, selects
match result and kickoff ascending order, and resets page to one. It retains
the applied date/range, status entry and page size. There are no separate per-
filter action rows or duplicate mobile Apply controls. An empty-result message
appears below this action row. The sort menu includes
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
mobile Advanced filters button has a visible label and a chevron pointing down
when collapsed and up when expanded. Its accessible name and title state
Show advanced filters or Hide advanced filters. It sets
`aria-expanded`/`aria-controls` on the complete collapsible filter section and
badges active choices. Search remains visible
when mobile filters close. The feed uses one semantic h1: it is visually hidden on
phones and tablets and visible as the page title on desktop. The subtitle
remains absent.

Acceptance uses owned MySQL storage with synthetic inputs, an isolated production
Next app built from captured SQL projections, and Chrome through the Playwright
skill. Production routes contain no fixture switch.
