# Client state and public feed contracts

Prompt [017](../dev-plan/017-client-state.md) supplies shared contracts for
028 APIs, 032 feed rendering, 033 filters, 034 pagination/Back and 037 polling.
It does not implement those features or initiate any browser provider calls.

## Ownership and hydration

`src/state/store.ts` exports `makeStore(FeedBootstrap)`. Every mounted
`FeedStateProvider` lazily constructs its own store and captures that store's
initial state for React Redux's hydration `serverState`. There is no store
singleton. Parent rerenders do not replace the store or reinterpret `initial`.
Typed hooks live in `src/state/hooks.ts`; default Redux Toolkit serializability
and immutability checks stay enabled.

Server Components validate URL inputs and read server services. They pass a
serializable `FeedBootstrap` across the client boundary and never read Redux.
The current interim feed passes `data: null`, meaning **unloaded**, rather than
claiming an empty fixture result. A real loaded page can have `records: []` and
is **ready**. Bootstrap page position must equal `query.page`.

The interim page provider is keyed by canonical resolved query and route/page
selection. A changed URL or server-resolved EAT date creates a fresh instance.
When 034 needs a persistent feed across detail navigation, it must place the
provider at the appropriate shared boundary and wire the checkpoint actions.
Subsequent data uses explicit request/reconciliation actions, not replacement
of the provider's `initial` prop. The existing single styling provider remains
at the root.

## Applied URL query

`src/domain/feed-query.ts` owns `FeedQuery`, `feedDefaults`, parsing,
serialization, route generation and canonical list identity. It uses the shared
calendar and market domain. All operations take an explicit EAT `today`; none
read a clock. The pages already use this parser and return 404 for invalid
parameters. Later endpoints should use the same parser with their own public
validation response, rather than accepting a more permissive query.

| Input | Contract |
| --- | --- |
| Date | `/en` defaults to relative `today`; `when=today`, `tomorrow`, or `next-7-days` retains that relative intent. |
| Explicit date | `date=YYYY-MM-DD` is accepted at the feed root; canonical href is `/en/predictions/YYYY-MM-DD`. |
| Range | `from` + `to` at the root, or `to` with the dated route. Inclusive, ordered, maximum seven days, including historical ranges. |
| Search | `q`, maximum 120 UTF-16 code units before normalization; NFC, trimmed, collapsed whitespace, no ASCII control characters. Empty is omitted. |
| League | `league`, canonical identifier text, 1–128 ASCII letters/digits/underscore/hyphen with an alphanumeric first character; default null. No display-name lookup. |
| Status | `all` default; `scheduled`, `live`, `finished`, `postponed`, `canceled`, `abandoned`, `awarded`, `unknown`. Finished groups played finals; provider mapping/query implementation belongs to 028. |
| Market | `match-result` default, `double-chance`, `total-goals`, `both-teams-to-score`. |
| Sort | `kickoff` default, or `probability` requiring an explicit `market`. In state, probability sort carries that market. Optional inbound `sortMarket` must agree; serialization omits this redundant alias. |
| Position | `page` default 1, maximum 10,000; `pageSize` default 30, maximum 100. Canonical positive decimal integers only. |

Unknown parameters, repeated parameters (including arrays supplied by Next),
mixed date modes, partial ranges and incompatible market sorts fail closed.
Serialization validates typed callers too. Defaults are omitted in a stable
parameter order. English remains the only supported locale.

`feedQueryKey` includes locale, resolved start/end dates, normalized search,
league, status, market, sort and page size. It excludes **page position** so one
query can accumulate pages. Relative and explicit dates share a key when their
effective date window matches. Relative intent stays in `FeedQuery` for rollover;
the key is not a substitute for that intent. A Back checkpoint additionally
checks its entry ID and original starting page.

`draftChanged` edits Redux's filter draft without changing the applied query or
loaded list. `queryApplied` accepts the validated query from URL navigation,
resets pagination and invalidates outstanding requests. The future controls
must navigate through `feedQueryHref`; Redux is not an alternate URL authority.
Ordering and missing-probability placement are implemented by the future feed
and API, using the selected market in this contract.

## Fixture handoff and reconciliation

`src/domain/fixture-snapshot.ts` validates a visitor-facing projection, not a
provider payload or a database row. `FixtureSnapshot` contains canonical fixture,
team and competition identities/names, nullable UTC kickoff/sync timestamps,
canonical status and score, nullable cycle ID, and one nullable forecast. A
forecast carries its run ID, revision ID, publication time and complete validated
markets with their source, probabilities, selection, reasons and uncertainty.
It requires a cycle. Scores are display values; they are not independently
verified regulation scores or a settlement decision.

The existing market validator checks source groups and derived double chance;
computed selections cannot be forged, incomplete groups cannot be spliced in,
and unknown fields are rejected. Later public DTO fields must extend this shared
projection explicitly and participate in the same fixture version.

`dataVersion` is the catalog's positive MySQL unsigned BIGINT serialized as
canonical decimal **text**, up to `18446744073709551615`. Comparison uses exact
`BigInt` arithmetic locally; no BigInt enters Redux, actions, JSON or storage.
Cycle, run and revision IDs are opaque equality references, never clocks.

1. Capture `beginFeedRequest(store, { page, mode })` before the public read.
   Its ticket contains a store-local sequence, query generation, canonical
   query key, page and mode. It is transport-neutral; it sends no request.
2. Dispatch `pageReceived({ request: ticket, data: FeedPage })`. All ticket
   fields must match the current request. A query change invalidates earlier
   tickets, including A → B → A and overlapping reads of the same query.
3. Validate the whole bounded page and reject duplicate fixture IDs. If **any**
   record is older than an accepted fixture version, reject the batch and its
   membership atomically with `stale-data`; retry through a current public read.
4. Replace each accepted fixture **whole** only at a strictly greater version.
   Equal versions leave the existing snapshot untouched, even with conflicting
   content. A newer cycle or unavailable forecast replaces the previous cycle
   and forecast together; absent fields cannot retain an older explanation.
5. `replace` sets membership; `append` accepts only the advertised next page and
   deduplicates IDs in response order. `refresh` targets the first loaded page
   and updates entities only, retaining loaded membership and pagination. The
   later feed must explicitly replace/requery when membership needs rebuilding.

`refreshFailed` accepts only public error codes and a current ticket. Network,
unavailable, invalid and stale responses retain all accepted records, IDs,
pagination and scroll. Records never live in local storage. Reconciliation
does not resolve or enqueue predictions, merge independent market revisions,
implement endpoint polling or infer settlement.

## Back and EAT events

State stores ordered loaded IDs, first/last/next page and scroll offset.
`navigationSaved` records a serializable checkpoint under an explicit browser
history entry ID and canonical query: maximum 20 entries, 30-minute lifetime,
bounded nonnegative scroll. It stores membership/position, not copies of fixture
truth. `navigationRestored` applies the URL query, invalidates in-flight work,
and restores only an unexpired matching entry/query/starting page; fixture
records retain their newest accepted versions. Misses start unloaded.
Session-storage wiring, DOM scrolling and real detail-page Back behavior belong
to 034; no persistence or browser history listeners are invented here.

`calendarChanged(reportingDate)` is the explicit EAT event. Duplicate days are
idempotent and backwards/invalid dates fail. Relative applied selections retain
their mode, resolve against the new date, reset page to 1 and invalidate the old
list/request. Absolute historical dates/ranges and their requests stay intact.
Historical filter drafts also stay intact; relative drafts roll and reset their
position. Prompt 037 supplies the EAT clock trigger and coordinates URL changes.

## Anonymous preferences and verification

Only `{ version: 1, density: "comfortable" | "compact" }` uses local storage,
at `goal-hint:preferences:v1`. Initial SSR and hydration always start comfortable.
Stored preferences are validated and applied in an effect, then only preference
changes are written. Unknown/oversized data and unavailable storage are ignored.
Searches, league choices, fixture state and forecasts are never persisted there.

`npm run test:state` exercises URL round trips, strict inputs, version ordering,
atomic snapshots, request races, pagination, failures, Back, rollover and store
isolation. `npm run test:state:rendering` builds an isolated Next production app
with the real provider and verifies four concurrent SSR requests, each with two
providers. `-- --serve` keeps it available for Playwright CLI checks. Synthetic
data stays under `.tmp/`, never in public application routes.

Browser acceptance delays JavaScript, verifies the comfortable server DOM with a
stored compact preference, releases scripts, and checks hydration, sibling
isolation, stable stores after parent rerenders, blocked storage, preference-only
persistence and reload. Artifacts live under ignored `output/playwright/`.
`npm run test:navigation:html` checks the integrated pages and malformed-query
404s on a running production server.

Provider construction and hydration follow the official
[Redux App Router guidance](https://redux.js.org/usage/nextjs) and
[React Redux Provider API](https://react-redux.js.org/api/provider).
