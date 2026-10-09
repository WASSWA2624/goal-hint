# Match search and filters

Prompt 033 adds `SearchInput` and `FilterControl` using shared labeled native
fields. `FeedControls` uses a per-provider Redux draft; URLs and stored server
projections remain authoritative. Draft text retains spaces while typing. Apply
normalizes NFC/whitespace, validates the query, and resets page to one. Typing and
selecting controls make no requests.

Apply navigates through `feedQueryHref` using the App Router and a transition.
The same parser and stored service handle initial rendering, Apply, reload,
shared URLs and Back. Next discards superseded navigations. Reapplying the current
query refreshes its server projection. The native GET form also works without
JavaScript. Its empty all-leagues option parses as null and is omitted from
canonical URLs; duplicate, unknown and other malformed parameters remain invalid.

League options contain at most 1,000 unique visitor-facing id/name/country
entries from the complete selected date cohort, independent of filters/page.
They share the records' RepeatableRead transaction. Overflow fails honestly
instead of silently losing options. Feed cache projection version 2 preserves
existing catalog invalidation and the response-size bound. Legacy DTOs may omit
options and parse to an empty array.

Default order is kickoff then fixture ID. Probability order uses the selected
market only, missing values last, then kickoff/ID ties. Changing market binds
probability order to that market. Reset clears search and league, selects all
statuses, match result and kickoff order, and resets page to one. It preserves
the reporting date/range and page size.

The native disclosure supports keyboard activation, Escape and Close; dismissal
focuses its summary trigger. Shared fields provide labels, descriptions, errors
and visible focus. The applied summary remains visible when the panel is closed.
A single polite status announces loading/counts/failures; cards are not live
regions. Controls remain usable during navigation.

`FeedSurface` retains the last successful projection across filter navigations.
A failed read displays its failure and labels retained cards with their original
dates, filters and market. Initial failures have no fabricated cards. Empty
filters, confirmed-empty, insufficient-prediction and partial-coverage states
remain reader-owned. Pagination/scroll checkpoints and live refresh stay with
034/037. No browser provider/AI calls or polling are added.

Acceptance uses owned MySQL storage with synthetic inputs, an isolated production
Next app built from captured SQL projections, and Chrome through the Playwright
skill. Production routes contain no fixture switch.
