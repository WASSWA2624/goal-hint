# Best Slips (25 October 2026)

`/en` is Best Slips; `/en/matches` preserves the match feed and `/en/slips` keeps
the editable builder. Old feed-query bookmarks redirect to Matches. Public
previews use the selected responsive slip layout and show the rank, match count,
total odds and average match probability to every visitor. Guests and members
without a valid subscription start on yesterday's publication; subscribers
start on today's. Public viewers see only slips whose original selections all
have verified completed results and whose fixtures are canonically completed.
This applies regardless of publication day: yesterday's unfinished slips remain
restricted, while today's fully completed results can be public. Both the
initial read and final entitlement recheck enforce this completion rule.

Desktop Best slips use Aligned ledger: a collapsed compact header, 3px gaps,
hyphenated EAT dates/times, country before league, fixed metadata/status tracks,
and strictly aligned score/VS and crest columns. Current score, provider clock
and selection outcome are sidecar observations matched to the original forecast,
never replacements for snapshot names, picks, prices or probabilities. Only
released slips carry these observations. Missing evidence stays Unknown
or Saved result; it does not invent elapsed minutes or a final score. The existing
desktop match-details batch updates entitled observations every 20 seconds while
visible and online, without rebuilding the slips. Cohort/statistics refresh
every 60 seconds on entitled watched desktop lists; public history and mobile
page refresh remain at 20 seconds. Public history never starts subscriber-only
observation polling.

The daily Kampala cohort targets 4.50–5.50 combined odds and up to 100 distinct
slips; source-owned `bestSlipsRules` configures the range/count. Daily slips do
not share fixtures. The bounded compatible-batch search maximizes the feasible
slip count, then compares slip ranks. Individual ranking prioritizes calibrated
joint probability, then fewer matches for equal estimates, then higher odds.
The selection-count tie-break never overrides a higher estimated joint chance.
Matches sort by individual probability. The editable custom builder retains its
optional match-reuse control. Scarce cohorts produce fewer valid slips. Coverage
and search limits remain disclosed when reached.

Public and entitled summaries share total odds, arithmetic average match
probability and selection count. The whole-slip estimate remains in the API for
compatibility and ranking, while the UI displays the average only. Average match
probability remains a description of the individual forecasts, not a joint
probability estimate.

Each available slip initially shows only its summary. Clicking the summary or
pressing Enter/Space expands the matches; repeating the action collapses them.
One access message above the public list explains that every match must be
completed and offers **Sign up** and **Sign in** to visitors, or **Subscribe**
to signed-in members without access. Unfinished slips are absent from the
public list, including their aggregate headers.
Native expansion works before hydration.

Shared slip headers place the actual publication date/time after the slip
number, followed by Top ranked, with no separate date/status row above the card.
Saved history uses its recorded save time. Date-only metadata never invents a
publication time. Desktop publication dates include the actual short weekday,
ordinal day, full month and year, for example Fri, 30th October, 2026, followed
by the supplied 24-hour EAT time. Thin separators distinguish the number/date
and summary fields; mobile keeps its compact date format.
Desktop uses Average probability; its fixed-width, square
status badge is followed by Share and the far-right disclosure arrow.
Header statuses follow the same original-cycle observations as the selection
rows: Not started requires recorded scheduled/void-cancelled legs; In progress
means an original leg has started while the slip remains unsettled. Won/Lost
retain adjudicated outcomes, including an early loss. Cancelled requires every
original leg to be cancelled and void; mixed void outcomes remain Void. Pending
is the honest fallback when recorded progress is unknown. These labels never
change stored settlement outcomes. Completed history and
performance use these same headers without repeating their date or status.
Headers retain their existing theme colors. A plain ordinal precedes each match
date and restarts at 1 inside each slip. Dates and time elements retain their
original values; normal match-feed rows receive no slip-local numbering.
In progress uses the blue theme accent and a steadily visible dot with a smooth
breathing halo, making it distinct from a red Lost badge without changing its
status meaning. Only the separate halo changes opacity and scale; the dot's
opacity and size stay constant. Each two-second easing phase reverses direction
for a smooth four-second cycle without resetting to its smallest size.
Reduced-motion preferences keep the glow steady.
On desktop, Best slips, builder results and completed-slip history use Subtle
dividers: a slim single-row header and one line per selection, initially
collapsed. Short team-name pairs are centred in their column; long names use
ellipsis with hover/focus full-text tooltips. Date/time, league/logo,
country/flag, market/pick, odds and probability remain visible. The vs link opens
the original fixture's analysis. Phone presentation retains its own selected
layout and disclosure behavior. The shared `SlipCard` in
`src/components/slips/slip-card.tsx` owns the responsive presentation for Best
Slips, builder results, saved history, performance results and public shared
links. Aggregate-only previews use `SlipCardSummary` from the same module.
Pages supply their source data and actions without redefining the card.

Compact selection rows and prediction columns use shared outcome definitions:
`1`/`X`/`2`, `1X`/`X2`/`12`, `O`/`U` with the actual line, and `Yes`/`No`
for boolean markets. Full descriptions accompany the codes, and a touch-accessible
Prediction key explains the core outcomes. Stored keys and settlement rules
retain their original meanings.

The stored-cohort reader and price freshness/rights gates are reused. A qualified
server-side joint model must provide calibration and correlation evidence and a
current validity window; mathematical marginal bounds are also checked. No mean,
product-of-marginals or invented estimate is used as a fallback. With unresolved
model qualification and public odds rights (OP-15/17/36), the production binding
shows unavailable. Synthetic tests exercise generation and transport separately.
Custom builds reuse the same ranking contract (`jointSlipRanking` in
`src/domain/joint-slip-model.ts`) when a verified request-time model is bound; none
is bound today, so custom ranking stays average-based (`docs/slip-builder.md`).

The page and `/api/best-slips` recheck entitlement after reading the slips. Responses
are private/no-store. Public responses omit unfinished slips entirely; completed
snapshots retain their original identities and selections for stable cards and
sharing. Shared caches never contain a viewer response. The page refreshes while visible and after a background tab returns.
Automatic refresh waits during a pending navigation or an unfinished refresh,
so it cannot replace a user's page change.

## Desktop date and result filters

The desktop filter section has one toolbar with All/Won/Lost/Pending/Void/Cancelled
toggles, followed by a date-preset select, Custom range, and Reset. Result toggles show their
whole-date-range counts before result filtering or pagination. Pending groups
Not started, In progress and unknown Pending slips; Void excludes Cancelled so
the five categories add up to All. Unavailable counts use a dash rather than
inventing zeros. Each result category also shows its percentage of that full
date-range total, rounded to at most one decimal place. A known empty range
shows 0%; unavailable percentages use a dash. All retains only its total count.
Counts and percentages are included in accessible button names.
Reset stays on the same row as a
separate outlined icon action. The applied-filter summary and displayed slip
range share one row below it. There is no separate desktop Overall Performance
panel or repeated date; mobile retains its compact performance strip.
The section uses the shared Matches palette and square controls, with no outer
padding, border or background. Status controls start at the slips' left edge;
Reset aligns with their right edge. Result selection uses neutral, green, red,
or amber, with matching resting
tints. Filled selected states and `aria-pressed` distinguish the choices.
Fine-pointer toggles are 28px high inside compact group frames; coarse pointers
retain 44px targets. Phones and tablets keep their original daily presentation.

Dates select the slip's publication day in EAT. The select offers:
Last 7 days, Last 3 days, Yesterday, Today, Tomorrow, Next 3 days,
and Next 7 days. The Custom range button immediately follows the select.
Custom dates cover longer periods; the Last/Next
30 days API values remain supported for existing callers. The custom-range popup retains its
existing controls; its current dates remain editable in the summary row.
The native date select keeps its full preset labels and supports keyboard
navigation. A slim divider and spacing distinguish it from the status toggles;
the select and Custom date button have a subtle 4px radius. Native option text
matches the control's desktop size. Compact widths, toggle gaps and padding
accommodate larger range totals without a long date-button strip.
Only desktop Best Slips uses a 4px page-top and inter-section gap, including
between an access prompt and the first slip. Its prompt also has compact local
padding and internal gaps; shared page, builder and mobile spacing is preserved.
Past periods include today; future periods start tomorrow. Custom bounds are
inclusive and limited to 366 days. Reset restores Today and All slips for
subscribers, or Yesterday and All slips for visitors and expired members. Dates
and outcomes combine; editing or canceling dates preserves the result choice.
Future periods honestly remain empty until a publication exists.

Desktop refinements read `/api/best-slips` with `period`, `status`, `page`, and,
for custom dates, `from`/`to`. Default daily server rendering follows entitlement.
Filters and page controls use local state; switching layouts resets to the
viewer's daily default. Complete loaded All cohorts filter instantly by result,
retaining their date-range counts and percentages. The complete daily source
remains available for local filtering, while each displayed page has up to
50 slips, including the initial All view. Other accepted queries can be
reused from a 12-entry transient memory cache, scoped to the current server seed
and observed access. Every requested view still rechecks the private endpoint.
Partially loaded ranges keep their actual previous rows visible with Updating
slips in the summary. Applied labels/counts/pages describe those visible rows
until the new response arrives. Failed background reads preserve usable results
with an inline Retry; an unseen range without usable data uses normal loading
or error feedback. Initial/unseen-range loading uses the shared four-header
slip skeleton with a gentle shimmer and a steady reduced-motion presentation;
the first pending Builder result uses the same loading component. Automatic
page refresh waits for both initial and background
filter reads. Superseded responses are aborted and ignored.
Known access revocation, including an observation-endpoint 403, immediately
excludes protected cached views and the old entitled seed before the server page
refresh completes. Midnight/query mismatches cannot enter the view cache.

Best Slips and Slip Builder use the same shared `NumberedPagination` as Matches,
with first/last jumps, numbered pages and the existing scrollable number rail.
The paginator appears only when more than 50 slips are available. Builder pages
slice the generated cohort locally and preserve absolute slip numbering; a new
build restarts page 1. Best Slips uses the same 50-slip size in its API and local
projection, preserving selected dates/status across page changes. Pagination
works on both desktop and mobile; date/result controls remain desktop-only.

Explicit ranges have exact result counts and 50 slips per page. The API retains
the All dates option for compatibility, although it is no longer in the date
button row. All dates scans at most 31 publications per request and uses an
original-day/rank cursor to
continue without dropping remaining slips from a publication. Its summary
states the dates examined and the number shown rather than claiming an
all-history total. A scan with no matching outcomes still offers continuation
when older publications remain. Date/result changes reset pagination.

Outcome filtering uses the original recorded forecast cycles, including a loss
before every other selection settles. Void and Cancelled have their own filters
and remain visible under All slips.
Statistics cover the whole selected explicit date range, independent of the
result filter and current page. All dates omits partial-period statistics.
Free reads filter fully completed slips before statistics, result filtering and
pagination, so their totals describe the public cohort. An early Lost outcome
or an invalidated/void original cycle does not establish fixture completion.
Public saved history, performance cards and shared tokens enforce the same
rule. Entitlement is rechecked after every API read; a tier change re-reads the
correct cohort rather than filtering a partially paginated member response.
Implicit defaults are re-read once if entitlement changes during SSR/API reads;
explicit periods retain the selected dates and use the final access gate.
No database migration is required.

Local test mode exposes sign-in, plans, automatic registration trials, payment reports and code
activation. Every fixture's predictions/odds remain gated; valid unlocked periods
are honored until expiry. Nothing was deployed or activated on a production host.

The private daily publisher stores immutable dated slip snapshots, and public
visitors read the committed publication. An existing daily publication retains
its original cohort and count; the higher capacity applies to newly generated
publications. Custom saved slips retain their original selections, probabilities,
prices and save timestamp. See `docs/daily-slip-publications.md`.

`tests/best-slips.test.mjs` verifies diversification, scarcity, whole-slip ranking
and model qualification. Completion-access and browse tests verify whole-slip
eligibility, public pagination/statistics and fresh entitlement checks across
guest, expired and subscribed viewers.
