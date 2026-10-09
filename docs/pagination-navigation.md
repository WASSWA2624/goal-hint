# Pagination and Back restoration

Prompt 034 enhances ordinary feed pagination with explicit Load more. The initial
HTML contains approximately 30 cards and crawlable Previous/Next page links.
Every page URL preserves validated filters, selected-market order and page size,
and pins the resolved reporting date/range so following a link across midnight
does not silently switch cohorts. Direct later-page visits are independent of
earlier browsing. JavaScript-disabled visitors follow the same ordinary links.

With JavaScript, Load more calls only `GET /api/matches`, appends a contiguous
page, and retains the URL's starting page/history entry. It never scroll-loads
automatically. A synchronous request lock, disabled controls, cancellation and
a 30-second operation deadline prevent duplicate or obsolete loads. All response
schemas, positions, reporting bounds and page sizes are checked before commit.
Failures retain loaded cards and expose a focused Retry control and one polite
status announcement. A successful append focuses the first new article without
changing the current scroll position. Remote logos retain reserved dimensions;
only the original first two cards may use eager logos.

## Consistency

The API adds an opaque `paginationVersion`. It hashes the canonical effective
query, competition scope and committed source generations for the selected
dates plus the catalog. Generations and source rows are read in one RepeatableRead
snapshot; source mutations and generation increments already commit atomically
through the 031 triggers. Progress-only acknowledgments do not reorder a cohort.
The marker is conservative: an unrelated catalog change can also invalidate it.
It exposes no raw generations, internal rows or provider payloads. Feed cache
projection version 3 prevents earlier cache entries from omitting this marker.

Offset pages are appended only while the marker and totals match. Overlapping
fixtures under an allegedly unchanged marker are also rejected: de-duplication
alone could conceal a skipped fixture. A change retains every loaded card and
asks for an explicit Refresh match list. Refresh re-reads the loaded prefix and
replaces its ordered membership atomically, with all pages from one cohort.
If it changes again during the reads, the previous list remains and retry is
available. Whole fixture snapshots never move to an older `dataVersion`; equal
versions retain the accepted whole snapshot. No independent market merge occurs.

At most ten pages remain appended at once (normally 300 cards; at most 1,000 for
the allowed page-size limit). Ordinary Next page navigation continues beyond
that bound. Legacy responses without a marker use direct page links.

## Restoration

The browser history entry receives a random local entry marker while preserving
all Next.js-owned history fields. Before leaving the feed, a tab-scoped
`sessionStorage` checkpoint saves only its entry/canonical query, starting and
last loaded pages, scroll position, focused fixture identifier, opaque cohort
marker and save time. No fixture records, predictions or scores are stored.
The checkpoint never goes into a URL, cookie or server request.

Records are scoped to the canonical query, route intent, starting page and
navigation entry: at most 20, at most 65,536 UTF-16 code units, and a 30-minute
lifetime. Malformed, oversized, duplicate, expired, future-dated and mismatched
records are ignored. Storage failures leave ordinary direct navigation usable.

On Back or reload, necessary pages are fetched from stored-data APIs before the
position is restored. Consistency/version checks apply to the whole prefix.
Only after committing the DOM does the browser restore the original analysis
link focus and scroll. Missing fixtures fall back to the result region; shorter
lists naturally clamp scroll. Failed restoration retains the initial stored
page and allows retry of the complete saved extent, without replacing the
checkpoint with that incomplete result. A changed cohort is reported as a
refreshed current list. Query changes reset appended pages and cancel pending
requests. There is no polling or prediction/provider work.

The isolated production acceptance app supplies real MySQL-captured pages and an
isolated canonical analysis destination. Prompt 035 must repeat navigation
acceptance through the real detail page once it exists.
