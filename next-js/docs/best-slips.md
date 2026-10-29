# Best Slips (25 October 2026)

`/en` is Best Slips; `/en/matches` preserves the match feed and `/en/slips` keeps
the editable builder. Old feed-query bookmarks redirect to Matches. Public
previews use the selected responsive slip layout and show the rank, match count,
total odds and average match probability to every visitor. Match identities, selections and individual
prices/probabilities require entitlement. Both the initial DTO and the final
entitlement recheck use that allowlist.

Desktop Best slips use Aligned ledger: a collapsed compact header, 3px gaps,
hyphenated EAT dates/times, country before league, fixed metadata/status tracks,
and strictly aligned score/VS and crest columns. Current score, provider clock
and selection outcome are sidecar observations matched to the original forecast,
never replacements for snapshot names, picks, prices or probabilities. Only
released entitled slips carry these observations. Missing evidence stays Unknown
or Saved result; it does not invent elapsed minutes or a final score. The existing
desktop match-details batch updates observations every 20 seconds while visible
and online, without rebuilding the slips. Cohort/statistics refresh every 60
seconds on watched desktop lists; mobile and aggregate-only page refresh remain
at 20 seconds. Mobile slips retain their existing presentation and spacing.

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

Each daily slip initially shows only its summary. Clicking anywhere on the
summary or pressing Enter/Space expands the matches; repeating the action
collapses them. Locked previews use the same disclosure, with subscription
links in the expanded content. Signed-out visitors see **Log in to access**,
which opens login and retains a return to Best Slips. The login page also offers
sign-up. Signed-in members without access see **Subscribe**; entitled members
see the actual matches. There is no repeated subscriber-only explanatory text.
Native expansion works before hydration.
On desktop, Best slips, builder results and completed-slip history use Subtle
dividers: a slim single-row header and one line per selection, initially
collapsed. Short team-name pairs are centred in their column; long names use
ellipsis with hover/focus full-text tooltips. Date/time, league/logo,
country/flag, market/pick, odds and probability remain visible. The vs link opens
the original fixture's analysis. Phone presentation retains its own selected
layout and disclosure behavior.

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
are private/no-store. Public DTOs omit even the internal slip ID, because it
encodes fixture and selection identifiers. Shared caches never contain a viewer
response. The page refreshes while visible and after a background tab returns.
Automatic refresh waits during a pending navigation or an unfinished refresh,
so it cannot replace a user's page change.

## Desktop date and result filters

The selected Compact selectors design adds one toolbar above the desktop slip
list: Slip date, All slips/Won/Lost/Pending, and Reset. It uses the shared Matches
filter palette, 32px square controls, and the existing custom-range dialog.
Phones and tablets keep their original daily presentation.

Dates select the slip's publication day in EAT. Today, Yesterday, Tomorrow,
Last 3/7/30 days, Next 7/30 days, All dates, and Custom range are available.
Past periods include today; future periods start tomorrow. Custom bounds are
inclusive and limited to 366 days. Reset restores Today and All slips. Dates
and outcomes combine; editing or canceling dates preserves the result choice.
Future periods honestly remain empty until a publication exists.

Desktop refinements read `/api/best-slips` with `period`, `status`, `page`, and,
for custom dates, `from`/`to`. Default daily server rendering remains unchanged.
Filters and page controls use local state; switching to mobile shows the daily
server result. Superseded requests are aborted and ignored. Read failures show
retry feedback instead of stale slips or an empty-result claim.

Explicit ranges have exact result counts and 20 slips per page. All dates scans
at most 31 publications per request and uses an original-day/rank cursor to
continue without dropping remaining slips from a publication. Its summary
states the dates examined and the number shown rather than claiming an
all-history total. A scan with no matching outcomes still offers continuation
when older publications remain. Date/result changes reset pagination.

Outcome filtering uses the original recorded forecast cycles, including a loss
before every other selection settles. Void remains visible under All slips.
Statistics cover the whole selected explicit date range, independent of the
result filter and current page. All dates omits partial-period statistics.
Public rows include only approved aggregates, the publication date, outcome,
and an opaque publication-row hash; the internal built-slip identity and
active selections remain gated. Entitlement is rechecked after every API read.
No database migration is required.

Local test mode exposes sign-in, plans, automatic registration trials, payment reports and code
activation. Every fixture's predictions/odds remain gated; valid unlocked periods
are honored until expiry. Nothing was deployed or activated on a production host.

The private daily publisher stores immutable dated slip snapshots, and public
visitors read the committed publication. An existing daily publication retains
its original cohort and count; the higher capacity applies to newly generated
publications. Custom saved slips retain their original selections, probabilities,
prices and save timestamp. See `docs/daily-slip-publications.md`.

`tests/best-slips.test.mjs` verifies diversification, scarcity, whole-slip ranking,
model qualification and both access gates. `scripts/verify-paywall-rendering.py`
checks raw HTML, React flight responses and APIs across viewer states, including
hidden per-match probabilities and the explicitly public mean in compact summaries.
