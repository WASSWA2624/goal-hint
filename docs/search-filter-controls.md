# Match search and filters

Prompt 033 adds `SearchInput` and `FilterControl` using shared labeled native
fields. `FeedControls` uses a per-provider Redux draft; URLs and stored server
projections remain authoritative. Draft text retains spaces while typing. Apply
normalizes NFC/whitespace, validates the query, and resets page to one. Typing and
selecting controls make no requests.

Apply navigates through `feedQueryHref` using the App Router and a transition.
The same parser and stored service handle initial rendering, Apply, reload,
shared URLs and Back. Next discards superseded navigations. Reapplying the current
query does nothing, unless it must supersede a pending navigation or retry a
failed read, which refreshes its server projection. The desktop Apply count reads
`/api/matches` with `pageSize=1&leagues=0`, on desktops only; phones apply their
selections directly and never request it. The native GET form also works without
JavaScript. Its empty "all" option parses as an empty list and is omitted from
canonical URLs. Since prompt 050, repeated `league`, `country` and `market` keys
from checkbox forms join like comma lists. Repeated single-value keys, unknown
keys (including the removed `sortMarket`) and other malformed parameters remain
invalid.

League options contain at most 1,000 unique visitor-facing id/name/country
entries from the complete selected date cohort, independent of filters/page.
They share the records' RepeatableRead transaction. Overflow fails honestly
instead of silently losing options. Feed cache projection version 2 preserves
existing catalog invalidation and the response-size bound. Legacy DTOs may omit
options and parse to an empty array. Prompt 050 adds each league's approved logo
and its fixture count in the date cohort. Suggestions list the leagues with the
most fixtures first, then by name. Country options are the distinct competition
countries of those leagues, with combined counts.

Prompt 050 filters and orders by each fixture's shown pick: the most likely
available pick among the selected markets, ties in policy order. The same rule
picks the market shown on the card (`bestCardFamily`). Default order is kickoff
ascending, then fixture ID. `dir=desc` reverses kickoff order. Probability order is
descending by default (`dir=asc` reverses it), with missing picks last and
kickoff/ID ties. The probability range (`prob`, whole percents) keeps only
fixtures whose shown pick displays inside it. Presets are Today, Tomorrow, Next
3 days, Next 7 days and Next 30 days; explicit ranges may span up to 31 days.
Forecasts still cover only the seven-day window. Reset clears search, leagues,
countries, the probability range and the picks-only filter, selects match result
and kickoff ascending order, and resets page to one. It keeps the reporting
date/range, the status entry and page size. See the
[stored match feed](match-feed-api.md) for the parameter contract.

Prompt 051 renders league, country and market choices as chip links. Each chip's
`href` is the canonical URL with that value toggled and the page reset, so
filters work without JavaScript. Each row also opens a checklist of every
option (searchable for leagues and countries). Desktop edits stay drafts until
Apply, whose label shows the draft's live match count. Phones apply chip and
select changes directly. At least one market must stay selected. The odds controls are disabled with an explanation
until provider odds display is enabled (prompt 052).

The native disclosure supports keyboard activation, Escape and Close; dismissal
focuses its summary trigger. Shared fields provide labels, descriptions, errors
and visible focus. The applied summary remains visible when the panel is closed.
A single polite status announces loading/counts/failures; cards are not live
regions. Controls remain usable during navigation.

`FeedSurface` retains the last successful projection across filter navigations.
A failed read displays its failure and labels retained cards with their original
dates, filters and market. Initial failures have no fabricated cards. Empty
filters, confirmed-empty, insufficient-prediction and partial-coverage states
remain reader-owned. Prompt 034 supplies [pagination/scroll checkpoints](pagination-navigation.md);
effective query changes cancel pending loads and restart the loaded extent.
Prompt 037 owns live refresh. No browser provider/AI calls or polling are added.

On phones the filter and search toggles sit in the feed's brand bar beside the
logo. The filter toggle sets `aria-expanded`/`aria-controls` on the collapsed
rows and badges the number of active choices. The search toggle opens a GET
search form; Escape closes it and returns focus to the toggle. Dates stay visible
in the panel: a Day/Range toggle (a "Date" group whose two links take their names
from the visible "Day" and "Range") and one "‹ date ›" stepper. Its previous and next
links keep their own URLs and labels. The date between them opens the native
calendar (Day) or the range popover (Range), which still anchors to the whole date
row. The toolbar's "Picks only" chip is the phone label of "With predictions".

Acceptance uses owned MySQL storage with synthetic inputs, an isolated production
Next app built from captured SQL projections, and Chrome through the Playwright
skill. Production routes contain no fixture switch.
