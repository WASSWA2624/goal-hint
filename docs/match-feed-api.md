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
| `from`, `to` | Both required; inclusive named EAT dates spanning at most seven days. |
| `when` | `today` (default), `tomorrow`, `next-7-days`. Mutually exclusive with `date` or `from`/`to`. |
| `q` | At most 120 characters under the shared URL validator; normalized, trimmed case-insensitive substring matching. Controls are rejected. `%`, `_` and `!` match literally. |
| `league` | One canonical competition ID, matching `competition.id`; absent or empty selects all leagues. |
| `market` | `match-result` (default), `double-chance`, `total-goals`, `both-teams-to-score`. |
| `status` | `all` (default), `scheduled`, `live`, `finished`, `postponed`, `canceled`, `abandoned`, `awarded`, `unknown`. `finished` includes regulation, extra-time and penalty finals. |
| `sort` | `kickoff` (default), or `probability` with an explicit `market`. Optional `sortMarket` must equal that family. |
| `page` | Integer 1–10,000, default 1. |
| `pageSize` | Integer 1–100, default 30. |
| `leagues` | Optional response option, only `0`: the response carries `leagues: []`. Live polls, Load more and the desktop draft count use it because they never read filter options. It is removed before query parsing and not charged to the 2 KiB query limit, so it never enters the canonical query, cache key or page links. |

The range resolves to UTC `[startInclusive, endExclusive)` using the shared EAT
calendar. Enabled competitions are included, together with stored historical
closed/void forecasts even if their competition is subsequently disabled. Team,
league and country names and historical team/league aliases are searched across
the entire range before pagination. Search uses the canonical normalized columns
and alias tables with their existing indexes, bounded by indexed kickoff dates;
leading-wildcard substring search does not promise a prefix-index plan.

Default order is kickoff ascending, then canonical fixture ID ascending.
Probability order uses the selected family's stored unrounded DOUBLE value,
descending, with missing/unavailable values last, then the same kickoff/ID ties.
Changing the selected market never substitutes another family's probability.
Every fixture appears once, using its applicable cycle.

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
matching fixtures with the selected family, and one entry per selected date.
Each date reports the latest exact-date global import's status and observation
time. A newer unfinished/failed daily-selection import is considered even when
it has no catalog receipt. Only `complete` is authoritative; partial, degraded,
failed, pending and unknown dates set `coverage.partial`. Existing stored rows
are retained and marked with their date's partial coverage. An older complete
receipt cannot override a newer failure or partial receipt.

| `state` | Meaning |
| --- | --- |
| `ready` | Matching fixtures and at least one matching selected-family forecast exist. |
| `no-fixtures` | No known fixture and every requested date has complete coverage. |
| `no-filter-matches` | Known fixtures exist but none match the filters in available data. Check coverage before treating the range as exhaustive. |
| `insufficient-data` | Matching fixtures exist; none has the selected family available. |
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
