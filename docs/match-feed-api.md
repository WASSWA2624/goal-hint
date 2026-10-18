# Stored match feed

`GET /api/matches` is an anonymous Node route. It calls the same
`createMatchFeedService({ database, competitionIds, clock? }).query(parameters,
{ locale?, routeDate? })` service used by the server-rendered feed and its controls.
`competitionIds` are the configured API-Football competition IDs; the `league`
filter uses the canonical competition ID returned by this API. Missing database
or competition configuration returns 503. There is no fixture-data fallback.

Reads use one repeatable database snapshot. They never import fixtures, call
football/research/AI providers, publish forecasts, settle results or enqueue jobs.
The only public write is the anonymous aggregate search counter described below.
No account, token, authentication cookie, visitor ID or request signature is
required. English is the launch HTTP locale; server callers can supply the shared
locale context without changing the URL contract.

## Parameters and pagination

The established `src/domain/feed-query.ts` contract is reused. Unknown or
duplicate parameters and incompatible combinations are rejected before database
access. All SQL values, limits and offsets are bound parameters.

| Parameter | Contract |
| --- | --- |
| `date` | Exact EAT Gregorian `YYYY-MM-DD`, including historical dates whose UTC bounds fit MySQL DATETIME (earliest EAT date 1000-01-02). |
| `from`, `to` | Both required; inclusive named EAT dates spanning at most 366 days (the default view is the last 30 days). |
| `when` | `last-30-days` (default, today and the preceding 29 calendar days), `today`, `tomorrow`, `next-3-days`, `next-7-days`, `next-30-days`. Mutually exclusive with `date` or `from`/`to`. |
| `q` | At most 120 characters under the shared URL validator; ranked matching of team, competition, country and historical alias names, including typos, abbreviations, prefixes, reordered words, nicknames and descriptive sentences ("Arsenal vs Chelsea"). Exact matches precede similar results; see `search` in the response. Controls are rejected; punctuation never becomes a SQL pattern or expression. |
| `league` | Comma list of canonical competition IDs (matching `competition.id`), at most 50. Absent or empty selects all leagues. |
| `country` | Comma list of stored competition country names (`competition.country`), at most 50. Absent or empty selects all countries. |
| `market` | Comma list of one or more of `match-result`, `double-chance`, `total-goals`, `both-teams-to-score`. Omitted means Any: all supported families, showing the highest-probability available pick. An explicit complete list is omitted from canonical URLs. Duplicates are rejected. |
| `prob` | `MIN-MAX` inclusive percentage bounds, integers or plain decimals in 0–100, MIN ≤ MAX; equal bounds are valid. Signs, exponents, nonfinite values, leading zeros and incomplete decimals are rejected. It applies to the shown pick's unrounded probability (below). Canonical URLs remove unnecessary decimal zeros; `0-100` applies no filter and is omitted. |
| `odds` | Prompt 052, **currently rejected**. `MIN-MAX` decimal prices with exactly two places, 1.01 ≤ MIN ≤ MAX ≤ 1000.00, no leading zeros, applied inclusively to the shown pick's own stored price (below). `1.01-1000.00` (both slider extremes; the top stop reads "20.00+") applies no filter and is omitted from canonical URLs. Accepted only while `publicPolicy.features.providerOdds` is on; it is off until the owner records odds display rights (OP-36), so today any `odds` value is an unknown key (400). |
| `picks` | `all` (default) or `only`, which keeps fixtures that have a shown pick. |
| `status` | `all` (default), `scheduled`, `live`, `finished`, `postponed`, `canceled`, `abandoned`, `awarded`, `unknown`. `finished` includes regulation, extra-time and penalty finals. |
| `sort` | `kickoff` (default) or `probability`. |
| `dir` | `asc` or `desc`. The default is `desc` for kickoff (Latest first) and probability; a default direction is omitted from canonical URLs. |
| `page` | Integer 1–10,000, default 1. |
| `pageSize` | Integer 1–100, default 50. |
| `leagues` | Optional response option, only `0`: the response carries `leagues: []`. Browser page refreshes and live polls use it because they never read filter options. It is removed before query parsing and not charged to the 2 KiB query limit, so it never enters the canonical query, cache key or page links. |

Prompt 050 makes `league`, `country` and `market` lists. Plain checkbox forms that
repeat a list key join exactly like a comma list; every other key must stay
unique, and an empty value cannot be combined with another value. League and
country lists are deduplicated and sorted, and markets are put in policy order
(match result, double chance, total goals, both teams to score). Equivalent
selections therefore share one canonical URL, cache key and pagination marker.
Single-market URLs such as `market=double-chance` keep working. `sortMarket` is no
longer a parameter: old `sortMarket` URLs are rejected with 400 instead of being
reinterpreted. `odds` is also an unknown parameter (400) while provider odds
display is off (`publicPolicy.features.providerOdds`, prompt 052). Ranges and
presets cover up to 30 days and explicit ranges up to 366, but forecasts still exist only inside the
seven-day prediction window; later fixtures carry `availabilityMessage`.

The range resolves to UTC `[startInclusive, endExclusive)` using the shared EAT
calendar. Enabled competitions are included, together with stored historical
closed/void forecasts even if their competition is subsequently disabled. Team,
league and country names and historical team/league aliases are searched across
the entire range before pagination. Search reads distinct identities and aliases
from the indexed date cohort, matches their labels with the shared football name
matcher (`src/domain/football-search.ts`), and binds the matching identities into SQL
with their relevance and the query words each one covers. Counts, filters and
pagination therefore use the same ranked cohort. Search does not load fixture
records into memory to paginate them.

The matcher normalizes case, accents, Unicode compatibility forms, invisible
formatting and fillers, spacing and punctuation, age groups ("U-19", "Under 19"
read `u19`) and ordinal signs ("1º" reads 1). Numbers keep their value in the
request locale: `10,000`, a no-break-space `10 000` and `10000` are one number
(plain-space groups only where the locale groups with spaces), Arabic separators
are read, a decimal stays one word, and an English `1,5` is two numbers, never
fifteen. Words match exactly, as prefixes, by established alias or nickname ("Man
Utd", "PSG", "Red Devils"), through demonyms and local competition words
("English", "Liga", "Pokal"), or with spelling tolerance: one missing, extra,
wrong or swapped letter up to five letters, two up to eight and three from nine
(at most 30% of the word, keeping the first letter beyond one slip), then
abbreviations that keep most of a word in order ("Mchster Untd", "Cty") and
consonant outlines. Club forms and name articles ("AC", "FK", "IS", "La", "da")
never decide a match. Filler in sentences ("show me", "matches today", "vs") is
ignored, a last one- or two-letter word is read as a prefix while typing ("Real
M"), and each team named in a sentence is matched on its own; a stored name that
contains a phrase the query expanded ("PSG U19") is read the same way. Numbers and
Roman numerals never drift to a neighbour, and "United" or "City" alone never
stand for one club.

A query splits into sides at "vs", "versus", "against" or a "v"/"x" between two
words; each side reads its own aliases and nicknames ("US vs Mexico", "Wolves U21"),
a nickname inside a longer name stays literal ("Singida Black Stars"), and one
stored name never answers two sides exactly. A fixture qualifies when its home
team, away team and competition together cover every query word, or when a team
or competition name covers a distinctive word ("Leeds" for "Leeds United", either
team of "Barcelona vs Real Madrid"); a country alone never does. The words of an
expanded alias name its team. A word that merely resembles a generic word
("Reading", "Inter") counts as distinctive when a name in the date cohort contains
it. A sibling club is never a match: "Manchester City" never answers "Manchester
United", even as "Manchester Cty" or "Manchester Unitd", and a competition that
keeps another division number or letter beside the matched one ("Serie C - Girone
A" for "Serie A") is at most a similar result. A
fixture is **exact** when every word is matched directly (exactly, by alias or as
a prefix) and otherwise a **similar result**. The response reports
`search: { exact, similar }` (null without `q`); exact records always come first,
so a record's position says which kind it is, and the list labels the first
similar one "Similar results". No broad fallback is added: a search with no
credible match returns `no-filter-matches`.
The resolver reads at most 50,000 catalog/alias rows and accepts at most 10,000
matching identities per request. Exceeding either bound returns the recoverable
unavailable response instead of silently omitting matches. The existing shared
search rate limit applies before this work.

Each fixture has at most one **shown pick**: in its displayed revision, the
available family among the selected `market` families with the highest stored
unrounded DOUBLE `selectedProbability`, then the highest fresh public odds for
that exact family and selection when probabilities tie, then policy order. The SQL joins
this pick once per fixture; `bestCardFamily` in `src/domain/feed-presentation.ts`
applies the same rule to the same values, so cards show the pick that ordering and
filters used. A family outside the selection never supplies a probability.

When a search is applied, relevance is the primary order: exact fixtures precede
similar ones, then fixtures covering more query words, then the strongest single
name (an exact name or alias precedes a prefix, which precedes a corrected
spelling). Without search, the selected sort remains the primary order. It is also
the stable tie breaker between equal search relevance.
Default order is kickoff descending (Latest first), then canonical fixture ID descending;
`dir=asc` reverses both. Probability order uses the shown pick's unrounded
value, descending by default or ascending with `dir=asc`. Fixtures without a shown
pick come last in both directions, and ties fall back to kickoff ascending, then
fixture ID ascending. `prob` keeps fixtures whose shown pick's unrounded
percentage falls inside both inclusive bounds. Decimal-text scaling converts
each percentage endpoint to a 0–1 fraction before comparing the stored DOUBLE;
there is no display rounding, half-point allowance or arithmetic scaling error
at equality. For example, `60.0049-60.0049` selects an exact 60.0049% forecast,
while a nearby forecast that also displays as 60% is excluded. Fixtures without a shown pick are excluded whenever a non-default `prob`
or `picks=only` is set. `league` and `country` match the stored competition ID and
country. Every fixture appears once, using its applicable cycle.

Once provider odds are public (prompt 052; not yet), `odds` keeps fixtures whose
shown pick has a fresh stored price for exactly that family and selection with
`displayHundredths` between MIN and MAX inclusive. The SQL left-joins
`FixtureOddsPrice` on the fixture, the shown pick's family and selection, and
`stale = FALSE`. The table's primary key makes that join 1:1, so counts and league
options never fan out. Fixtures without a shown pick, without a price, or with
only a stale price drop out. A price on a family that is not shown never
qualifies a fixture. Price breaks exact probability ties between eligible
published picks; it never outweighs a higher probability or changes the feed's
kickoff/probability row ordering. While
the flag is off, the SQL never references the odds tables.

Responses include `page`, `pageSize`, `total`, `totalPages`, `nextPage`,
`previousPage`, and relative `links.next`/`links.previous`; HTTP `Link` carries the
same next/previous destinations. Links preserve filters, sorting and size and
pin relative dates to the resolved range across EAT midnight. At the page cap,
`nextPage` is null. An empty out-of-range page retains the real totals and links
back to the last reachable populated page (or page 1 when no rows exist).

## Public response

`src/domain/match-feed.ts` validates the entire response and its counts.
Prompt 033 adds `leagues`: up to 1,000 unique id/name/country entries for the full
selected date cohort, independent of filters/page. Options share the records'
database snapshot; overflow fails with 503. Omitted legacy options parse to `[]`.
Prompt 050 adds `logoUrl` (an approved HTTPS logo or null) and `fixtures` (the
league's fixture count in the unfiltered date cohort) to each option, and
`competition.logoUrl` to fixture snapshots. The API orders options by name,
country and ID; the browser orders suggestions by fixture count, then name, and
derives country options from the same entries. Older cached pages without these
fields parse with `logoUrl: null` and `fixtures: 0`. Feed cache projection 5
keeps those older responses from being reused.
Prompt 052 adds `prices` to each record (at most 4, default `[]`). It holds one
entry per published family whose pick has a fresh price:
`{ family, selection, price, basis, retrievedAt, providerUpdatedAt }`. `price` is
the stored two-place decimal (`"1.85"`, rounded half-up once when written).
`retrievedAt` is when that exact price was first observed. The schema refuses a
price whose family has no published pick, whose selection is not that pick, a
duplicate family, or any other field (no bookmaker name, id or link). It is read
by the same rule as the `odds` SQL filter, inside the same `REPEATABLE READ`
snapshot. While `publicPolicy.features.providerOdds` is off, `prices` is always
`[]`, even when private odds exist. Prices are observation data: they change
without a fixture-version bump, and the odds cache trigger bumps the fixture and
date generations when they do. Feed cache projection 6 keeps pre-052 responses
from being reused. See [provider-odds.md](provider-odds.md#public-read-path).
Team codes add an optional `code` to `homeTeam` and `awayTeam`: 2–5 capital
letters or digits, or null when the team has none or its stored value is not a
valid code. The read normalizes the stored provider code (trim, ASCII only,
uppercase); the schema refuses any other string. A new code arrives with a
fixture-version bump, like any shared team change. Older responses without the
field still parse, and feed cache projection 7 keeps them from being reused. See
[match card](match-card.md).
Country flags add an optional, nullable `competition.countryFlagUrl` to every
fixture snapshot (feed records, the detail fixture and the client refresh parse
all share it): the approved remote flag of the competition's country, or null for
international competitions and until a date sync observes one. The schema
accepts only credential-free HTTPS URLs without query or fragment, like logos.
It is decoration: a flag change alone does not bump `dataVersion` (see
[football catalog](football-catalog.md#country-flags)); the catalog cache tag
still invalidates cached responses at once. Older responses without the field
still parse, and feed cache projection 8 keeps them from being reused.
Prompt 034 adds opaque `paginationVersion`, computed from the effective query,
competition scope and committed date/catalog generations in the records' snapshot.
Feed cache projection version 3 avoids reusing earlier responses without this
marker. Legacy omitted markers parse to null and use direct page navigation.
Appended pages must have the same marker and total; changes require an atomic
refresh of the loaded prefix. See [pagination consistency](pagination-navigation.md).
`records` contains shared `FixtureSnapshot` values, with the feed metadata
required by `matchFeedRecordSchema`. Maximum query size is 2,048 UTF-8 bytes;
maximum serialized JSON response is 1 MiB. Responses that cannot be safely
constructed within that bound fail with 503 rather than silently truncating.

Each record includes canonical teams/competition, approved remote logo URLs,
kickoff, status, score, actual `syncedAt`, positive decimal-string `dataVersion`,
`cycleId`, cycle state/mode/ordinal/lock time/public void reason, and a nullable
forecast with run ID, revision ID, publication time and per-market source.
Available families contain validated complete probability groups and their
single selected pick; these are the existing shared card values. Every family
is explicitly available or listed in `unavailableMarkets` with a public reason.
The feed omits analysis reasons and uncertainty text; detail delivery belongs to
029. It exposes no provider bodies, evidence/provenance internals, private void
proofs, prompts, worker diagnostics or credentials.

Open cycles display the current complete revision. Closed cycles display only
the immutable lock and remain unavailable when no lock exists. Void cycles
retain their last preview/lock with a sanitized public void reason and Void
outcomes. A new applicable cycle displaces the historical cycle in the feed;
the prior cycle remains in immutable history. Correct/Incorrect badges require
an audited settlement whose input hash still matches the canonical verified
result, cycle and locked selection. A result correction immediately displays
Pending until settlement catches up, and then includes its correction time.
No public read writes a settlement. Live scores and separately verified final
regulation scores carry `scorePeriod`; extra-time/penalty aggregates are not
substituted for regulation.

`syncedAt` is the result-sync cursor's actual last sync, falling back to the
catalog retrieval time. Response `asOf` is observation time, not data freshness.
`dataVersion` is the canonical monotonic fixture cursor, never a timestamp or JS
number. Operational `update`, coverage and window messages are observations at
`asOf`; they can change without a canonical fixture mutation. Future clients
must refresh these observations separately from version-gated forecast/result
replacement. `update.prediction` is updating, delayed, current, unavailable,
outside-window or locked; `update.result` is current, delayed or untracked.

Beyond today plus six days, a fixture with no stored forecast exposes
`availabilityMessage` explaining seven-day availability. Historical locked
forecasts remain accessible without a lookback cutoff.

## Coverage, run progress and empty states

`coverage` includes the known fixture count before user filters, the count of
matching fixtures with a shown pick among the selected families
(`matchingWithMarket`), and one entry per selected date (up to 366; read in three batched queries).
Each date reports the latest exact-date global import's status and observation
time. A newer unfinished/failed daily-selection import is considered even when
it has no catalog receipt. Only `complete` is authoritative; partial, degraded,
failed, pending and unknown dates set `coverage.partial`. Existing stored rows
are retained and marked with their date's partial coverage. An older complete
receipt cannot override a newer failure or partial receipt.

| `state` | Meaning |
| --- | --- |
| `ready` | Matching fixtures exist and at least one has a shown pick among the selected families. |
| `no-fixtures` | No known fixture and every requested date has complete coverage. |
| `no-filter-matches` | Known fixtures exist but none match the filters in available data. Check coverage before treating the range as exhaustive. |
| `insufficient-data` | Matching fixtures exist; none has any selected family available. |
| `data-unavailable` | No known fixture and at least one date lacks authoritative coverage. |
| `page-out-of-range` | Matches exist but the requested page is empty. |

`message` supplies the English public explanation where relevant. States describe
the matching range; a later page may contain only missing predictions even when
the range is `ready`.

`run` describes today's daily run when the query overlaps today's seven-day
forecast window; historical and farther-future queries return null. Before a
run exists it is `not-started` with `total: null`; before a sealed manifest it is
`selecting` with an unknown total. A committed run reports sealed manifest
membership and actual durable job states, not potentially stale DailyRun
counters: `completed` counts succeeded jobs, `failed` counts failed/expired jobs,
`terminal` is their sum, and `published` counts accepted publication receipts.
`phase` is updating, complete or partial; manifest degradation and job failures
are explicit. During updating it supplies “Updating predictions for the next 7
days”. Run progress is separate from fixture import coverage.

## Errors, limits and operations

Every response sends `Cache-Control: no-store, max-age=0`,
`CDN-Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. No cache is
introduced; 031 can wrap this contract later. Errors have this shape:

```json
{"error":{"code":"unavailable","message":"Matches are temporarily unavailable. Try again shortly.","recoverable":true,"retryAfterSeconds":5}}
```

| HTTP | Code | Retry contract |
| --- | --- | --- |
| 400 | `invalid-query` | Fix parameters; recoverable false, retryAfterSeconds null. |
| 429 | `rate-limited` | Recoverable true, Retry-After and retryAfterSeconds 1–60 seconds. |
| 503 | `unavailable` | Recoverable true, Retry-After and retryAfterSeconds 5. Includes configuration, DB, integrity and response-bound failures. |

Nonempty validated searches share an initial aggregate budget of 120 requests
per fixed 60-second window across all replicas. MySQL UTC and a locked permanent
`PublicSearchLimit(scope='matches')` row make reservation atomic. No IP, cookie,
token, search text or visitor trace is stored. Ordinary browsing is outside this
search budget; invalid requests consume none. When shared demand is high, any
visitor may receive Search is busy. This deliberately conservative aggregate
limit is a privacy-preserving initial operating bound, not measured production
capacity. Revisit it with real workload evidence; do not add visitor tracking as
an incidental implementation change. Other rate limiting belongs to the later
security/hosting work.

Apply additive migration `20261009184740_match_feed_api` using migration
credentials. It creates the binary-collated InnoDB counter and its permanent
seed row; do not recreate that row per request. The public application's role
needs SELECT on the existing catalog, cycle, forecast, result, settlement,
selection/import and job tables used by the shared readers, plus SELECT/UPDATE
on PublicSearchLimit. It needs no public INSERT/DELETE or worker write grants.
The integration harness verifies this minimal counter access and fresh schema
deployment. Existing production database/provider/model/rights/hosting gates
still apply. Rollback disables the route and retains additive schema/history;
no worker or schedule is activated by this feature.

## Browser refresh

Prompt 037 adds `forecast.runSequence` from the persisted run ordering (decimal
text, never UUID order). Feed cache projection 4 includes it. Existing fixture
versions, cycle/revision references and stored sync/publication clocks remain
authoritative. See [live client refresh](live-client-refresh.md).
