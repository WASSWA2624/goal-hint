# Provider odds import

Prompt 052 imports API-Football pre-match odds for **one documented bookmaker**,
keeps every bet that bookmaker publishes, and derives market-implied
probabilities for the four launch families. Odds are third-party information
only: no bet slips, bookmaker links, affiliate links or "value" wording.

This runbook covers storage, import semantics and grants. The adapter contract
is in [api-football-adapter.md](api-football-adapter.md), the counted odds trial
in [football-provider-trial.md](football-provider-trial.md), and quota pacing in
[live-operations.md](live-operations.md).

The [probability-qualified engine](prediction-engine.md) also reads permitted
private bookmaker snapshots independently of the public-display flag. It uses
prices only after independently estimated probabilities and football evidence
qualify. New sealed per-fixture quote manifests record bet hashes and original
kickoff; the immutable recommendation keeps the exact quote and observation
receipt. Older receipts remain readable but cannot establish a newly priced
recommendation until a permitted observation supplies a manifest. Public odds
display remains disabled. Acquisition, internal retention/use and public display
retain separate permission checks.

## Current status

- **Imports are off.** `GOAL_HINT_ODDS_IMPORT_ENABLED` defaults to `false`, and
  the runner also requires a plan with spare ordinary quota. The Free plan is
  never eligible. The counted odds trial has not been run; it needs the upgraded
  plan.
- **Display rights are not confirmed (OP-36).** Odds are stored privately.
  `publicPolicy.features.providerOdds` stays `false`, so the public price
  projection stays empty and `odds=` is an unknown feed key.
- **Launch bet ids are provisional.** `launch-odds-v1` pins Match Winner (1),
  Double Chance (12), Goals Over/Under (5) and Both Teams Score (8) from the
  documented examples. A price exists only when the id **and** the exact name
  match both the latest stored `/odds/bets` catalog and the `/odds` row. Any
  mismatch withholds the price; it never guesses. The trial's `odds-bet-catalog`
  finding confirms or replaces these ids.

## Tables

Migration `20261010200505_provider_odds_import` adds five InnoDB `utf8mb4_bin`
tables. Every foreign key is `RESTRICT`/`RESTRICT`. Times are `DATETIME(3)` UTC.
Every reviewed `CHECK` is NULL-safe (`COALESCE(..., FALSE) = TRUE`). Odds never
bump `FootballFixture.dataVersion`, never write `PredictionChangeEvent` and never
touch `FootballImport`.

| Table | Mutation | Holds |
| --- | --- | --- |
| `OddsImportBatch` | Append-only receipt (INSERT, SELECT) | One row per import attempt: kind (`prices`, `bets`, `bookmakers`), scope key such as `date:2026-10-13:bookmaker:8`, policy hash, status (`complete`, `partial`, `failed`), requests dispatched, page provenance **without** quota feedback, per-fixture outcomes with an observation hash, and the catalog names for catalog imports. The body never holds prices; a `CHECK` refuses top-level `values` or `bookmakers`. |
| `OddsBetObservation` | Append-only, insert-if-absent (INSERT, SELECT) | Every `/odds/bets` name ever observed, unique per `(provider, betExternalId, name)`. A renamed bet adds a row. This is the mapping input for prompts 053 and 054. |
| `ProviderOddsSnapshot` | Append-only, content-chained (INSERT, SELECT) | Normalized values (`label`, canonical decimal `odd`) per fixture × bookmaker × bet, with bookmaker and bet names, `retrievedAt`, the row's provider `update` time, `retainUntil` and a sealed body. |
| `FixtureOddsState` | Mutable, one row per fixture | Per-fixture mutex plus `latestBatchId`, `policyHash`, `lastRetrievedAt`, `lastProviderUpdatedAt`, `withdrawnAt` and `publicVersion`. |
| `FixtureOddsPrice` | Mutable public projection | One row per `(fixtureId, marketKey, selection)`, so the feed join is 1:1. Holds `basis` (`bookmaker`; `median` is reserved), bookmaker id, line, `priceDecimal DECIMAL(10,4)`, `displayHundredths`, `impliedProbability DECIMAL(13,12)`, `overround`, method, mapping version, the source `snapshotId` (composite key with the fixture), times and `stale`. |

`marketKey` is limited to the four launch families by
`FixtureOddsPrice_market_check`; total goals must carry line `2.50`. Prompt 053
replaces that check with a `_v2`.

## Import flow

1. The durable `odds.import` job runs one EAT date per 3-hour UTC slot, nearest
   date first. `odds.catalog` refreshes `/odds/bets` and `/odds/bookmakers` once
   per UTC day, ahead of that day's sweeps. Both run on a dedicated worker, at
   the `enrichment` quota priority, and spend only the plan's spare above its
   ordinary floor. A job that is off, or that the quota gate refuses, expires for
   its slot without a provider call. Scheduling, the quota gate, the time budget
   and failure handling are described in
   [live-operations.md](live-operations.md#odds-imports-052).
2. All provider I/O happens **before** any transaction, and the walk ends 180
   seconds into the 300-second job so the writes keep their own budget.
   Validation rechecks authorization, policy, retention, exact selectors, page
   order and each row's retrieval and update times.
3. The receipt is written first: `INSERT IGNORE`, then a sealed re-read must
   reproduce the exact body. The store keeps the verified body for the
   per-fixture writes of that import, so the receipt is read once per import.
4. Each fixture is classified before any write. Unknown fixtures are counted,
   never created. A fixture that has started, is not `scheduled`, or whose odds
   kickoff differs from the catalog kickoff is never priced.
5. Each applicable fixture is applied in its own short `READ COMMITTED`
   transaction that locks only its `FixtureOddsState` row. It never takes the
   global catalog lock. A genuine deadlock or write conflict is retried twice;
   the callback holds no provider I/O. The apply is refused (`invalid-request`)
   unless the receipt recorded exactly this observation: its fixture entry has
   outcome `apply` and the row's observation hash, and one of its pages has the
   row's retrieval time. Every snapshot's `batchId` therefore names a receipt
   that observed those values.

### Append-only chain

For each bet, the store compares the new canonical values **and** the recorded
bookmaker and bet names with the chain head. Unchanged content adds nothing.
Changed content inserts one snapshot whose `previousId` is the old head. A
fixture's changed bets are inserted together (multi-row `INSERT IGNORE`, up to
100 rows per statement) and re-read once, sealed, before the apply commits. The
snapshot id fingerprints the fixture, bookmaker, names, bet, `valuesHash` and
`previousId`, so a replay is idempotent. Values are sorted by label, so a
provider reordering never creates a row.

Observations are never applied out of order. An observation retrieved before
the fixture's `lastRetrievedAt` is skipped. Every applied observation advances
`lastRetrievedAt`, `latestBatchId` and `lastProviderUpdatedAt`, even when no
price changed.

### Public projection

The projection is written only while the odds-rights authority verifies
`football-odds-rights`. Without it, only private snapshots are stored, and the
`expire` sweep that runs on every runner tick (even with imports off) marks every
fresh public row stale. That includes closing prices after kickoff, fixtures that
are no longer `scheduled`, and fixtures no sweep reaches. The sweep makes no
provider call, is bounded per tick (500 fixtures) and raises each changed
fixture's `publicVersion` once, so caches invalidate. Restoring the rights brings
nothing back by itself: only a new pre-match observation publishes again.
`publicPolicy.features.providerOdds` still hides every price from public reads
on its own.

- A family gets rows only when its **whole group** is complete in the current
  observation, from one bookmaker and one bet. A missing selection, a renamed
  bet, a missing line or a quarantined bet publishes nothing for that family,
  and any earlier rows for it go stale. Prices are never borrowed from another
  line, bet, bookmaker or family.
- De-margin method `proportional-v1`: implied_i = coverage × (1/o_i) / Σ(1/o_j),
  with exact BigInt arithmetic rounded half-up to 12 places. Double chance uses
  coverage 2 within its own bet, so its probabilities sum to 2. An overround
  below 1 is still normalized and recorded.
- `priceDecimal` keeps the provider decimal exactly. `displayHundredths` is
  rounded half-up once, at write time. A `CHECK` requires it to equal
  `ROUND(priceDecimal * 100)`. Feed display and the `odds=` filter use that same
  two-place value with inclusive bounds.
- A row is rewritten only when it changed. `publicVersion` rises by one per
  fixture apply that changed any public row.
- A price row's `retrievedAt` and `providerUpdatedAt` come from its source
  snapshot, so they show **when that exact price was first observed**.
  Reconfirmations move `FixtureOddsState.lastRetrievedAt` instead. This keeps an
  unchanged price from invalidating caches every slot.

## Staleness, withdrawal and closing prices

Staleness is decided **at write time**, never at read time, so pagination
versions and cached responses stay consistent.

- **Expiry.** Every runner tick calls `expire(500)`, which needs no provider
  call. A fixture's fresh prices go stale when `lastRetrievedAt` is older than
  12 hours (`freshnessMs`) before `LEAST(now, kickoff)`. Without verified
  display rights, the same call first stales every fresh price (see
  [Public projection](#public-projection)).
- **Closing price.** After kickoff the comparison point stays at kickoff and no
  observation is applied. A price reconfirmed within 12 hours before kickoff is
  therefore frozen as the closing price. A price that was not reconfirmed in that
  window stays stale.
- **Withdrawal.** Only a **complete** date sweep withdraws. Pre-match fixtures
  with odds state on that date that are absent from the sweep get `withdrawnAt`,
  and their prices go stale. A partial or failed sweep never withdraws, and a
  later observation of the fixture wins over an earlier sweep's absence. A
  withdrawn fixture that reappears is fresh again.

## Cache invalidation

The triggers `PublicCache_FixtureOddsState_insert` and
`PublicCache_FixtureOddsState_update` bump the `fixture:<id>` and
`date:<EAT kickoff date>` tags. They fire only when `publicVersion` changes, so a
reconfirmation that moves only `lastRetrievedAt` never invalidates. The insert
trigger is inert because new rows start at version 0. Neither trigger uses
`DELIMITER`.

## Public read path

Everything below is built and tested, but it is **inert** while
`publicPolicy.features.providerOdds` is `false`, which it must stay until the
owner records odds display rights (OP-36). Flipping it is a code change made only
with that recorded decision. Only isolated tests override it, through the
`providerOdds` option of `createMatchFeedService`, `createMatchDetailService`,
`parseMatchFeedQuery` and `parseFeedQuery`. Public routes always parse with the
global flag.

| Surface | While off (today) | Once on |
| --- | --- | --- |
| `odds=MIN-MAX` | An unknown key: 400 on `/api/matches`, `notFound()` on pages, and the browser parser refuses it too. | Two-place bounds, 1.01 ≤ MIN ≤ MAX ≤ 1000.00, inclusive on `displayHundredths`. `1.01-1000.00` (both slider extremes; the top stop reads "20.00+") means no filter and is omitted from canonical URLs. It counts as one panel filter. Reset clears it. |
| Feed SQL (`feedSql`) | Never references the odds tables. | `LEFT JOIN FixtureOddsPrice op` on fixture, shown family, shown selection and `stale = FALSE` (1:1 by the primary key, so no fan-out). The filter is `m.available = TRUE AND op.displayHundredths BETWEEN min AND max`. |
| Feed record `prices` | `[]`. | One entry per published family's pick that has a fresh price, read by the same rule in the same snapshot (`storedFixturePrices`). |
| Detail `odds` | `[]`. | One complete market-implied group per family (`storedFixtureOddsGroups`): every selection fresh and from one snapshot. |
| Cache | Feed projection 6 and detail projection 4 hold `prices: []` and `odds: []`. | The same projections. `odds` bounds are part of the feed key through the canonical query. The odds triggers bump `fixture:` and `date:` tags when a public price changes. |
| Client state | Nothing to merge. | `prices` and `odds` are observation fields adopted at an equal fixture version (`mergeFixtureObservation`, `mergeLiveDetail`). `selectedCardPrice` returns only the shown pick's own price. |

Rules that hold either way:

- A price is never shown or matched for another family, line, selection,
  bookmaker or bet. No price means no price (`—` in a later UI prompt), never a
  substitute.
- Stale and withdrawn prices are excluded by the `stale = FALSE` join, both from
  the filter and from record prices.
- Responses carry no bookmaker name, id, snapshot id or link. `basis` and the
  method are the only provenance exposed.
- Market-implied probabilities exist only in the detail `odds` envelope, labelled
  `market-implied`. They never enter forecasts, AI inputs, fallback inputs or
  `snapshot`.

## Publication-time prediction quotes

`PredictionQuote` (migration `20261025180538_prediction_quotes`) keeps the public
price that stood beside each available family when a revision was published, for
the illustrative individual-prediction returns on `/[locale]/performance`. The
rules:

- **When.** Only inside the revision's own publication transaction, after the
  revision and its extensions and before the cycle pointer moves; the final
  eligibility re-check rolls it back with the revision. No retrospective
  attachment, backfill or reconstruction from snapshot history.
- **Gate.** The live publisher passes `quotes.verify`, which requires
  `publicPolicy.features.providerOdds` **and** a verified owner-recorded
  `football-odds-rights` approval, evaluated before capture and rechecked before commit. Without the
  option (every test harness by default) nothing touches the table.
- **Source.** One non-locking statement (`storedQuoteSource` in
  `src/server/odds/odds-read.ts`) reads the state and fresh public rows, so the
  READ COMMITTED publication sees one commit and adds no lock order against odds
  apply. The price must match the locked family and selection exactly; no other
  family, line or selection is borrowed.
- **Reasons.** No state or row: `no-public-price`. Withdrawn, future or older than
  the odds freshness window (the window `expireStale` uses):
  `price-state-expired`. A non-bookmaker basis: `unsupported-price-basis`. A
  missing snapshot hash/bookmaker identity, stale row, unsupported mapping/line, inconsistent decimal/display arithmetic or clocks:
  `invalid-public-price`. Odds-data faults never fail publication.
- **Provenance.** `snapshotId` is a provenance hash under a CHECK, not a foreign
  key, so captured quotes never block a future reviewed snapshot purge.
- **Immutability.** Rows are append-only (triggers refuse UPDATE and DELETE) and
  sealed (`integrity = SHA2(body)`); later odds changes never rewrite them.

Public historical returns separately require a verified `PerformanceQuoteBinding`; enabling capture alone does not enable those returns.

Captured hundredths outlive the snapshots' `retainUntil`, like the published-slip
archive; the owner must confirm this retention before enabling the flag.

## Retention

Only normalized fields are stored, under the purpose `structured-odds-history`
with `rawPayloadsStored: false`. The owner must confirm that the private-use
reference covers odds. Each snapshot carries `retainUntil` = kickoff + 30 days.
No purge job exists: any purge needs a reviewed privileged role and an owner
decision.

## Identity widths

Bookmaker and bet ids are stored as unsigned 32-bit integers. The normalizer
quarantines a bet whose id does not fit, listing it in `rejectedBets` and
`odds-bet-rejected:<bookmaker>:<bet>`. Provider fixture and league ids may use
any safe integer. Bookmaker names longer than 128 characters and bet names longer
than 256 characters are stored as `null` with missing coverage. A null name
never matches a mapping, so it never yields a price.

## Application grants

The application role needs these grants. They match the isolated integration
harness. Add them to the private `%LOCALAPPDATA%\GoalHint\application-grants.sql`,
using the same account and host as its existing `goal_hint_app` grants.

**Order matters.** MySQL refuses table and column grants on tables that do not
exist yet (`ERROR 1146 ... doesn't exist`), so apply these grants only **after**
`npm run db:deploy` has created the five tables. Apply them straight away: as
soon as the migration is deployed, the runner's `expire()` (every 30-second tick,
even with imports off) and the operations monitoring collector (which sums
`OddsImportBatch.requestsDispatched` inside its single snapshot transaction)
both need SELECT on the odds tables. Without it, the runner logs
`odds-expire-failed` on every tick, and the whole monitoring snapshot falls back
to `available: 0` with every other metric null, which looks like an outage. On
127.0.0.1:3307:

```sql
GRANT SELECT, INSERT ON goal_hint_db.OddsImportBatch TO 'goal_hint_app'@'<existing host>';
GRANT SELECT, INSERT ON goal_hint_db.OddsBetObservation TO 'goal_hint_app'@'<existing host>';
GRANT SELECT, INSERT ON goal_hint_db.ProviderOddsSnapshot TO 'goal_hint_app'@'<existing host>';
GRANT SELECT, INSERT, UPDATE (latestBatchId, policyHash, lastRetrievedAt, lastProviderUpdatedAt, withdrawnAt, publicVersion)
  ON goal_hint_db.FixtureOddsState TO 'goal_hint_app'@'<existing host>';
GRANT SELECT, INSERT, UPDATE (basis, bookmakerExternalId, line, priceDecimal, displayHundredths, impliedProbability, overround,
  method, mappingVersion, snapshotId, basisJson, retrievedAt, providerUpdatedAt, stale)
  ON goal_hint_db.FixtureOddsPrice TO 'goal_hint_app'@'<existing host>';
```

Prediction quotes (`20261025180538_prediction_quotes`) add one append-only grant.
Apply it after `npm run db:deploy` has created the table and **before** the odds
display flag is turned on: once capture is enabled, a missing grant fails the
forecast publication itself.

```sql
GRANT SELECT, INSERT ON goal_hint_db.PredictionQuote TO 'goal_hint_app'@'<existing host>';
```

The application never receives `DELETE` or key-column `UPDATE` on odds tables.
The column-scoped `UPDATE` grants are enough for the store's `SELECT ... FOR
UPDATE` row locks. The cache triggers run with the migration (definer) account's
existing `PublicCacheTag` and `PublicCacheInvalidation` rights.

The full order is:

1. `npm run db:deploy` (creates the five tables);
2. apply the odds grants above from `application-grants.sql` as the
   administrative account;
3. `npm run db:status`, `npm run db:verify` and `npm run db:health`.

Do not start `npm run live` between steps 1 and 2.

## Verification

`npm run test:odds` runs the pure domain tests, the import unit tests
(`tests/odds-import.test.mjs`: policy, validation, classification, envelopes and
the quota gate) and `tests/odds.integration.mjs` on an owned MySQL 8.4 server. Set `MYSQL_TEST_SERVER_BINARY` as described in
[database.md](database.md). The integration test checks the following:

- deploy twice, then verify;
- engines, collations, triggers and the ten `CHECK` names;
- refusal of `UPDATE` and `DELETE` on append-only tables, and of `DELETE` and
  key updates on state and prices;
- catalog name retention;
- private-only imports with receipts and no public rows;
- an identical re-import adds nothing, one price change adds one chained
  snapshot, a rename is recorded, concurrent replicas write once, and
  out-of-order observations are skipped;
- an apply under a receipt that did not record the observation's hash or
  retrieval time is refused, and each snapshot links to the receipt that
  observed it;
- complete-group projection with exact de-margined probabilities;
- triggers fire once per public change;
- a catalog name mismatch withholds the price;
- partial and failed sweeps never withdraw, while a complete sweep does;
- expiry, the closing-price freeze, and `CHECK` and composite-key refusals;
- withdrawn display rights stale every fresh price, closing prices included,
  with one version bump per fixture and no provider call;
- unchanged catalog versions, imports, change events and network.
