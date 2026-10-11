# API-Football adapter

Prompt 007 provides the sole server HTTP boundary for the direct v3 provider at
`https://v3.football.api-sports.io`. The adapter, contracts and pure normalizers
live in `src/server/football`. They implement retrieval and normalization;
polling, catalog persistence, prediction publication and provider qualification
remain with their numbered features.

## Construction and caller bounds

Application callers construct `createPolicyApiFootballAdapter` with the runtime
policy, the canonical account ID, its shared durable quota limiter and a trusted
evidence verifier. This constructor reads the private wrapped credential and
uses the existing `assertOperationAllowed` gates around asynchronous work. An
evidence reference alone never grants permission. Missing or invalid credentials
and revoked operation authority fail without exposing credential contents.

`createApiFootballAdapter` accepts explicit credential, gateway and authorization
dependencies for isolated contract tests. Injected fetch, clock, sleep and random
functions support reproducible tests; production construction uses the guarded
policy and gateway.

Every operation requires `ApiFootballBounds`: priority, absolute UTC deadline,
timeout, maximum dispatched requests, pages, normalized rows and response bytes,
retry attempts/base delay/maximum delay, and structured-cache maximum age. These
values come from the authorized caller and its approved job policy. The adapter
does not invent OP-11 budgets or a freshness policy. A cache age of zero disables
structured caching. Fallback predictions additionally require a nonempty job
`cacheScope`, including when caching is disabled.

```ts
import "server-only";
import type { ReportingDate } from "@/domain/calendar.ts";
import { createPolicyApiFootballAdapter } from "@/server/football/api-football-adapter.ts";
import type { ApiFootballBounds } from "@/server/football/api-football-contract.ts";

export async function retrieveDay(
  dependencies: Parameters<typeof createPolicyApiFootballAdapter>[0],
  date: ReportingDate,
  approvedBounds: ApiFootballBounds,
) {
  const adapter = createPolicyApiFootballAdapter(dependencies);
  return adapter.evidence.fixturesByDate(date, approvedBounds);
}
```

The example accepts already approved limits and verified dependencies; it neither
supplies spending allowances nor authorizes a provider call by itself. Reuse the
constructed adapter within the server process to share its local cache and
in-flight work, while every process shares the durable account limiter.

## Typed operations and endpoint contracts

| Public operation | Direct endpoint and behavior |
| --- | --- |
| `evidence.fixtures(query, bounds)` | `/fixtures`: a single response, with supported fixture, date/range, competition/season, team and round filters. |
| `evidence.fixturesByDate(date, bounds)` | `/fixtures?date=...&timezone=Africa/Kampala`, checked against normalized Kampala reporting dates. |
| `evidence.liveFixtures(bounds)` | Shared `/fixtures?live=all&timezone=Africa/Kampala`; disappearing fixtures do not acquire final statuses. |
| `evidence.unresolvedFixtures(ids, bounds)` | Deduplicated fixture IDs, grouped only within a trusted verified batch limit. |
| `evidence.teams(query, bounds)` | `/teams` by team ID or competition/season. The live runner's spare-quota team-code import calls it by competition/season through the catalog importer ([football catalog](football-catalog.md#team-codes-spare-quota-import)). |
| `evidence.competitions(query, bounds)` | `/leagues`, retaining coverage independently for each reported season. |
| `evidence.statistics(fixtureId, bounds)` | `/fixtures/statistics`, typed supported counts/percentages and explicitly unsupported measurements. |
| `evidence.availability(fixtureId, kind, bounds)` | `/fixtures/lineups` or `/injuries`; absence never proves fitness. |
| `evidence.playerStatistics(query, bounds)` | `/players` by competition/season, using its documented `page` parameter and 20-item pages. |
| `fallback.predictions(fixtureId, bounds)` | `/predictions`, exposing only `purpose: "fallback-only"` data. |
| `odds.prices(query, bounds)` | `/odds` for one documented bookmaker, by Kampala `date` or by `fixture`, with `timezone=Africa/Kampala` and the documented `page` parameter and 10-row pages (prompt 052). |
| `odds.bets(bounds)` | `/odds/bets`: the full bet catalog as one unpaginated page of unique, named entries. |
| `odds.bookmakers(bounds)` | `/odds/bookmakers`: the bookmaker catalog, under the same rules. |

Fixtures have no invented page loop or `page` parameter. Only player statistics
(20 items per page) and odds prices (10 fixtures per page) follow paginated
contracts; `pageSizeOf` in the contract supplies each documented size. A
non-final page must carry exactly that size and no page may exceed it. Page
mismatches, changing total-page counts, duplicate identities and premature empty
pages prevent a complete result. Explicit page, request and row limits stop
traversal.

The official fixture-ID contract permits at most 20 IDs per batch. A trusted
`verifyBatchEvidence` callback must approve the supplied limit and evidence;
otherwise unresolved fixtures use individual `id` queries. A reference or the
published maximum alone does not establish account-specific behavior. Requested
IDs missing from the completed lookup are reported in `missingIds`.

Responses must identify the expected endpoint, have valid result counts and
paging metadata, and echo supplied selectors. Missing selector echoes fail
coverage checks; conflicting echoes fail schema checks. Row identities,
competition/season, team, round, fixture ID and reporting-date filters are checked
where the payload supplies them. Provenance retains request parameters so
fixture-bound statistics, lineups and fallback payloads remain associated with
their request even when the provider row omits a fixture ID. Aggregate player
statistics must include the requested competition/season. Additional reported
entries preserve their own team/competition/season identities rather than
combining unrelated competitions. Odds rows must belong to the requested
fixture or Kampala reporting date (a row without a kickoff cannot), and every
bookmaker in a row must be the requested one. Normalized odds rows have no `id`;
their identity is the fixture, so a fixture repeated across pages is a schema
error.

### Odds normalization (prompt 052)

The `odds` namespace sits outside `evidence` and `fallback`, so bookmaker prices
never reach AI or fallback forecasts. `ODDS_CONTRACT_VERSION`
(`direct-v3-odds-2026-10-10`) names the odds semantics separately from
`API_FOOTBALL_CONTRACT_VERSION`, which stays unchanged so fallback and evaluation
cohorts are not split. Odds callers pass `cacheMaxAgeMs: 0`; prices are never
served from the structured cache.

- Each row keeps the fixture id, the competition id and season, the kickoff
  (validated like fixtures), and every bet of every returned bookmaker. Labels
  stay verbatim; lines are parsed only by the versioned domain mapping.
- `update` is parsed with the strict offset parser. A missing update stays null
  and reports `provider-update-time`. A malformed update, or one later than the
  retrieval, makes the row invalid. A duplicate bookmaker id, or a duplicate bet
  id within one bookmaker, also makes the row invalid.
- Prices must be strings matching `^[1-9]\d{0,4}(\.\d{1,4})?$` and strictly
  greater than one. They are stored in canonical form without trailing
  fractional zeros (`"1.850"` becomes `"1.85"`), so equal prices hash equally.
  Numbers are rejected.
- Bet-level quarantine: a bet with a malformed or numeric price; a non-string,
  padded, control-character, over-long (more than 64 UTF-16 units) or duplicate
  label; or an empty list or more than 1,000 values is dropped. It is listed in the
  bookmaker's `rejectedBets` with `odds-bet-rejected:<bookmakerId>:<betId>`. The
  fixture and the page survive, because one invalid row would otherwise fail the
  whole multi-page import.
- Blank, control-character or over-long names (bookmaker over 128, bet over 256
  UTF-16 units, the stored column limits) become null with
  `odds-bookmaker-name:<id>` or `odds-bet-name:<bookmakerId>:<betId>`. Mappings
  require an exact name, so a null name never yields a price.
- Catalog rows (`/odds/bets`, `/odds/bookmakers`) need a positive id and a clean,
  trimmed name of at most 256 units; anything else is an invalid row.

## Dispatch, observations and results

Every HTTP attempt runs through the shared quota gateway's counted reservation
and single-use launch claim. Retries use new request IDs; uncertainty, timeouts
and failures never refund an attempted reservation. Abort signals bound headers
and streamed body reads. Response bytes are capped before decoding and JSON
parsing. The transport refuses redirects, sends only the private direct-provider
key header and disables the framework HTTP cache.

Retry backoff uses bounded exponential delay with jitter. Provider `Retry-After`
and shared quota retry times take precedence when longer; an attempt that cannot
fit inside the caller deadline stops. Daily/minute headers are normalized into
quota observations. The transport records an early observation as soon as
headers arrive, so a stalled or unreadable body cannot discard a known 429 delay,
authentication failure or lower remaining allowance. The gateway retains these
observations for completion on failure/timeout and rejects late observations.

Results distinguish authorization, authentication, subscription expiry, quota,
transport, body, coverage and schema failures with static structured reasons;
provider diagnostics and credentials are never returned or cached. A successful
HTTP response can still yield incomplete or unavailable structured data.

`ApiFootballResult` supplies `status`, typed `data`, `completeness`, per-page
`provenance`, `requestsDispatched` and a structured `error`. `complete` means the
bounded retrieval and correlation checks completed. It does **not** certify all
field coverage: inspect `missingCoverage` independently, including for complete
results. Empty responses explicitly record that endpoint coverage is not
established. Missing names, scores and supported statistics remain null or
missing; empty injuries never mean all players are healthy. `requestsDispatched`
counts actual HTTP dispatches for this caller, while the quota limiter also
retains counted reservations that could not safely launch.

HTTP failures also retain the original header-retrieval time and known quota
observations, with null page numbers when no valid envelope was obtained. Failed
retry observations precede the eventual successful page; a cache hit retains
only the original successful page, without replaying an earlier job's retry
history. A transport that obtained no response has no invented retrieval time.

## Cache, status and rights boundaries

The process-local structured cache has a bounded LRU capacity. A trusted
`verifyCacheUse` callback must approve the actual normalized data, purpose,
retrieval time and requested age before insertion and reuse. Cache insertion is
deferred until the operation passes completeness and correlation checks; failed
or incomplete retrievals cannot populate it. Reuse preserves the original
retrieval timestamps and reports `fromCache`; freshness is never renewed by a
cache hit. Authority and deadlines are checked before cached results return.
Safe local in-flight duplicates join the existing dispatch within their own
deadline. Cross-process duplicates remain coordinated by the durable limiter.

Fallback cache keys additionally include the job scope, and predictions are
absent from `adapter.evidence`. Reported percentages stay in provider 0–100 units;
advice, goal thresholds and winner fields do not become validated market groups.
Unsupported xG measurements remain reported, unsupported values rather than
verified AI evidence.

Provider kickoff timestamps are kickoff data, not update times. Retrieval time
is retained separately; `providerUpdatedAt` stays null because the reviewed
contracts do not establish a per-record update field. The exception is `/odds`:
each row's own `update` becomes its `source.providerUpdatedAt`, and odds pages do
not add `provider-update-time` unless a row lacks it. Page-level
`providerUpdatedAt` stays null for every endpoint. Explicit statuses cover
scheduled, live, extra-time, shootout, postponed, canceled, abandoned and awarded
fixtures, with unknown codes remaining unknown. Only final `FT`/`AET`/`PEN`
records with a separate valid `score.fulltime` can expose a regulation candidate.
It stays unverified unless a trusted verifier approves the exact fixture,
status and candidate score. Live goals, extra-time and penalty totals never
substitute for regulation evidence; conflicting `FT` totals are rejected.

Logos and player photos are nullable metadata with rights-review status. An exact
URL must pass an explicit rights verifier and be credential-free HTTPS, without
query credentials or fragments, before a URL is exposed. This adapter never
fetches, proxies, optimizes or stores image binaries. URL syntax and public
availability do not establish third-party display rights.

## Evidence and remaining qualification

Contract and normalization tests use explicitly labeled synthetic fixtures and
an injected fetch dependency. They make no live provider calls and do not verify
the current account. Run `npm test` for those checks. Durable quota acceptance
uses the separate isolated genuine-MySQL harness described in the
[quota contract](quota-limiter.md).

Official references reviewed for 007:

- [Direct v3 documentation](https://www.api-football.com/documentation-v3): the interactive reference did not expose readable schemas in this session; endpoint decisions below use the accessible official guides.
- [Official API-Football beginner guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide): endpoint shapes, pagination, status/score fields and coverage.
- [Fixture-ID batch tutorial](https://www.api-football.com/news/post/how-to-get-all-fixtures-data-from-one-league): the 20-ID maximum and coverage caveat.
- [Rate-limit contract](https://www.api-football.com/news/post/how-ratelimit-works): daily/minute headers and rate-limit behavior.
- [Provider terms](https://www.api-football.com/terms): data and third-party media rights require review.

The prompt 052 odds contract (the `/odds`, `/odds/bets` and `/odds/bookmakers`
paths, the 10-row page, the `update` field, string prices and the launch bet
ids) follows the official v3 documentation examples. Those examples were not
re-read in the 052 session, so the counted odds trial in the
[provider trial runbook](football-provider-trial.md#odds-qualification-prompt-052)
must confirm the real envelope before any odds schedule runs.

Prompt [008](../dev-plan/008-football-provider-trial.md) must qualify the actual
account, subscription/reset behavior, endpoint and field coverage, live-status
behavior, AET/PEN regulation-score semantics and permitted data/image use through
bounded accounted observations. Published contracts and synthetic tests do not
resolve those questions. See [implementation decisions](implementation-decisions.md)
and [development progress](development-progress.md) for recorded evidence and
acceptance results.
