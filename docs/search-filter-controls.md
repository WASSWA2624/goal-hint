# Match search and filters

The feed uses shared labeled native fields and a per-provider Redux draft;
URLs and stored server projections remain authoritative. Filter edits remain
unsubmitted on both desktop and mobile until the single Apply action. There is
no mobile auto-apply debounce. Search text retains spaces while typing; search
submission and filter Apply normalize NFC/whitespace, validate the query, and
reset page to one. Search typing makes no requests.

Apply navigates through `feedQueryHref` using the App Router and a transition.
The same parser and stored service handle initial rendering, Apply, reload,
shared URLs and Back. Next discards superseded navigations. Reapplying the current
query does nothing, unless it must supersede a pending navigation or retry a
failed read, which refreshes its server projection. The desktop Apply count reads
`/api/matches` with `pageSize=1&leagues=0`, on desktops only; this advisory count
never applies the draft. Phones retain their edits until Apply and do not request
that count. The search GET form retains its ordinary URL fallback. Empty "all"
options parse as empty lists and are omitted from canonical URLs. Repeated
`league`, `country` and `market` keys from checkbox forms join like comma lists.
Repeated single-value keys, unknown keys (including the removed `sortMarket`)
and other malformed parameters remain invalid.

Four range inputs stay visible at every viewport size, including when the other
phone filters are collapsed: From date, To date, From time and To time. Each full
label sits inside its square control, to the left of the native input value.
The date pair and time pair each occupy one phone row. There are no visible group
headings, date popovers, date steppers, time mode menus or separate range Apply
buttons. The fieldsets retain accessible group names; focused controls and
invalid values retain visible feedback.

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
available pick among the selected markets, ties in policy order. The same rule
picks the market shown on the card (`bestCardFamily`). Default order is kickoff
ascending, then fixture ID. `dir=desc` reverses kickoff order. Probability order
is descending by default (`dir=asc` reverses it), with missing picks last and
kickoff/ID ties. The probability range (`prob`, whole percents) keeps only
fixtures whose shown pick displays inside it. The Picks only/With predictions
control is absent at every screen size; existing shared URL/parser compatibility
is unchanged. See the [stored match feed](match-feed-api.md) for that contract.

Desktop places Leagues, Countries, Markets, Odds and Probability in one filter
row. League, country and market fields retain selected chip links and complete
checklists, searchable for leagues and countries. Each chip's `href` is the
canonical URL with that value toggled and page reset, preserving ordinary link
behavior. Probability uses compact minimum/maximum number fields; the filter
row contains no sliders. Odds controls remain disabled with their explanation
until provider odds display is enabled.

Mobile filters use one compact labeled summary button per Markets, Leagues and
Countries field, without scrolling suggestion chips or a duplicate menu. One
selection shows its name; multiple selections show their count. Empty league
and country selections show All leagues and Any. Each summary opens the same
complete checklist, and selected values missing from a refreshed option list
remain removable. At least one market must stay selected. Probability uses the
labeled preset field. Mobile retains the muted Odds unavailable explanation.

One action row sits to the left of Sort by in the results toolbar. Phones use
compact Clear and Apply buttons; desktop Apply can show the advisory draft
count. Apply submits the complete date, time and filter draft. Clear resets
search, leagues, countries, time, probability, odds, picks and ordering, selects
match result and kickoff ascending order, and resets page to one. It retains
the applied date/range, status entry and page size. There are no separate per-
filter action rows or duplicate mobile Apply controls. The sort menu includes
both kickoff directions and both probability directions, without a separate
reverse-order button.

Checklist popovers use native buttons and fields, close on an outside pointer
action or Escape, and return focus to their trigger on Escape. Shared fields
provide labels, descriptions, errors and visible focus. A polite query status
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

On phones the filter and search toggles sit in the feed's brand bar beside the
logo. The filter toggle sets `aria-expanded`/`aria-controls` on the collapsed
rows and badges active choices. The search toggle opens a GET search form;
Escape closes it and returns focus to the toggle. When open, the brand-bar
search button becomes Close and the form contains one search icon on its submit
button. The feed retains a visually hidden semantic h1 without a visible page
heading or subtitle above the filters.

Acceptance uses owned MySQL storage with synthetic inputs, an isolated production
Next app built from captured SQL projections, and Chrome through the Playwright
skill. Production routes contain no fixture switch.
