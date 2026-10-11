# Match search and filters

The feed uses shared labeled native fields and a per-provider Redux draft;
URLs and stored server projections remain authoritative. Draft text retains
spaces while typing. Search submission and desktop Apply normalize
NFC/whitespace, validate the query, and reset page to one. Typing makes no
requests. Desktop filter edits wait for Apply; mobile checklist and probability
changes share a 700ms debounce before applying the accumulated draft.

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
and its fixture count in the date cohort. Options list the leagues with the
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

Desktop league, country and market fields retain selected chip links. Each
chip's `href` is the canonical URL with that value toggled and the page reset,
so those links work without JavaScript. Each field also opens the complete
checklist (searchable for leagues and countries). Desktop edits stay drafts
until Apply, whose label shows the draft's live match count.

Mobile filters use one compact labeled summary button per Markets, Leagues and
Countries field, without scrolling suggestion chips or a duplicate menu. One
selection shows its name; multiple selections show their count. Empty league
and country selections show All leagues and Any. Each summary opens the same
complete checklist, and selected values missing from a refreshed option list
remain removable. At least one market must stay selected. The labeled
probability preset and a quiet Reset action share a row and may stack with
enlarged text. Mobile shows a muted Odds unavailable note with the fuller
explanation available to assistive technology; desktop retains its disabled
odds controls and explanation until provider odds display is enabled (prompt
052).

Checklist and date popovers use native buttons and fields, close on an outside
pointer action or Escape, and return focus to their trigger on Escape. Shared
fields provide labels, descriptions, errors and visible focus. A polite query
status announces loading/counts/failures; cards are not live regions. Controls
remain usable during navigation.

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
search form; Escape closes it and returns focus to the toggle. When open, the
brand-bar search button becomes Close and the form contains one search icon,
on its submit button. The static subtitle is hidden on mobile.

Dates remain visible while the other filters are collapsed. One "‹ date ›"
stepper opens the existing From/To picker from its central date button; there
are no separate Day/Range buttons. Equal From and To values select a single
day, and different values select an inclusive range of up to 31 days. Show
dates applies the selection, preserving filters and resetting page to one.
Previous and next links retain ordinary URLs and move by one day or by the
selected range's length. The popover anchors to the complete date row.

The mobile results toolbar contains one match count, one Picks only toggle
(the phone label of With predictions), and one sort menu. Earliest first and
Latest first order kickoff times; Highest chance and Lowest chance order the
shown prediction's probability. Field and direction share one selection. There
is no separate reverse-order button. Desktop retains its existing sort menu and With
predictions control.

Acceptance uses owned MySQL storage with synthetic inputs, an isolated production
Next app built from captured SQL projections, and Chrome through the Playwright
skill. Production routes contain no fixture switch.
