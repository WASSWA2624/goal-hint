# Canonical football catalog

Prompt [009](../../prompts/dev-plan/009-canonical-football-catalog.md) adds reusable private catalog persistence. It stores canonical competition/team identities, seasons and fixtures from the existing [007 adapter](../src/server/football/api-football-adapter.ts). The [008 report](reports/provider-trial-008.md) still marks live provider qualification incomplete. Local schema and synthetic acceptance checks do not approve competitions, provider field semantics, source retention, publication or media rights.

## Worker integration

Use [`createFootballCatalogImporter`](../src/server/football/catalog-service.ts) from an authenticated private worker. Construct its adapter with the existing runtime policy and durable shared quota gateway; this service does not create another HTTP client or quota counter. Visitor reads never invoke imports.

```ts
import "server-only";
import { createFootballCatalogImporter } from "./catalog-service.ts";
import { createFootballCatalogStore } from "./catalog-mysql-store.ts";

const store = createFootballCatalogStore(database, {
  coordinateFixtureMutation,
});
const importer = createFootballCatalogImporter({
  adapter: protectedApiFootballAdapter,
  store,
  authority: verifiedCatalogAuthority,
});
const result = await importer.import(authorizedCatalogRequest);
```

These supplied objects must come from the application's approved worker wiring; the example does not supply credentials, a live request allowance or a permission verifier. The importer has no automatic polling, daily selection, forecast generation or public endpoint.

Authenticated local operations can reuse `runtime.catalog.import(request)` after awaiting `createLiveRuntime(policy)`. This uses the live runner's verified owner approvals, shared durable quota gateway and lifecycle coordination. Close the runtime afterward. A fresh catalog observation does not reopen a finalized daily selection or retry a terminal prediction outcome.

[`CatalogImportRequest`](../src/server/football/catalog-contract.ts) requires a UUID `id`, an exact `selection`, explicit adapter `bounds`, and a `retentionEvidenceRef`. Supported selections are `fixtures` with the adapter's fixture filters, `teams` by team ID or competition/season, and `competitions` by optional competition/season. Fixtures retain the provider's season and round. Bounds include priority, absolute deadline, timeout, maximum requests/pages/rows/response bytes, retry limits and cache age. Pages and retries stay inside the existing gateway's accounting. Cached observations retain their original source times.

Reuse an import ID only for the identical immutable request. The importer returns its durable receipt without fetching again after that request is recorded. Calls within one importer also share the in-flight promise. A different request under an existing ID is rejected. Storage independently checks both the request fingerprint and the validated observation fingerprint; direct persistence accepts only the original immutable batch returned by [`validateCatalogBatch`](../src/server/football/catalog-input.ts). A new observation after a completed failed/partial import needs a new import ID. This catalog receipt is not a replacement for a future durable worker lease or an authorization to repeat uncertain network work.

The importer checks authorization and retention before provider I/O, after retrieval and during persistence. The adapter remains responsible for authorization at its dispatch boundary. Private operators must provision suitable database privileges and runtime/source evidence before enabling live work; no provider request is made by migration generation or local catalog tests.

The persistence guard also requires the same trusted authority instance that
validated the batch. Revalidating a serialized observation creates a new batch
under the current authority; a cloned batch or another validator cannot bypass
that proof boundary.

## Permission and evidence boundaries

[`CatalogAuthority`](../src/server/football/catalog-contract.ts) is a required trusted dependency. It must verify actual records and the exact requested scope, rather than treating a supplied reference string or `verified` label as proof.

| Hook | Responsibility |
| --- | --- |
| `authorize(request)` | Validate the caller/workload identity and approve this selection, request bounds and operation; throw if authority is absent or revoked. |
| `verifyRetention(permission)` | Confirm permission for structured catalog and audit history under the supplied evidence reference. `rawPayloadsStored` is always false. |
| `verifyObservation(request, result)` | Establish that the normalized result is attributable to this approved adapter operation. |
| `verifyLogo(url)` | Confirm current permission for this credential-free remote URL. |
| `verifyRegulationScore(candidate)` and `regulationEvidenceRef(candidate)` | Independently establish the exact fixture, provider status, source field and regulation period, and return its attributable evidence reference. |
| `authorizeMapping(mapping)` | Authorize private identity-resolution work; mapping evidence alone is not caller authorization. |
| `verifyMapping(mapping)` | Verify that the alternate provider ID refers to the candidate canonical identity. |
| `verifyKnownSubset(permission)` | Approve an explicitly listed degraded fixture subset and its evidence. |

Normalized provenance contains the provider/endpoint, exact query, contract version, original retrieval/update times, cache flag and pagination metadata. Catalog retention excludes raw HTTP bodies, credential headers, account details, quota feedback and arbitrary provider error diagnostics. Import records retain bounded structured outcomes and known coverage gaps. Audit history contains normalized changes and affected shared identities, rather than raw payload snapshots. Choose retention periods from actual source permissions before production; this feature invents no period or automatic deletion policy.

The trial's representative competition/season samples, actual account plan/limits/reset/expiry/payable total, freshness rules, regulation-score semantics, public data/prediction reuse and remote media permissions remain unverified. Direct Mega's advertised price and published terms are not substitutes for the actual account or a publication license. See the [trial runbook](football-provider-trial.md) and [decision register](implementation-decisions.md) for the pending evidence gates.

## Identity, aliases and search

Canonical IDs are UUIDs independent of provider numbers. The database uniquely maps `(provider, externalId)` to each team and competition, and uniquely identifies fixtures by that same pair. A stable provider mutex serializes catalog writes inside an InnoDB transaction, so imports across competitions/seasons reuse an existing mapping. Names and countries never establish identity.

Call `store.registerTeamMapping(mapping, authority, retentionEvidenceRef)` for an alternate team ID. The candidate ID must already map to a canonical team, and attributable mapping evidence must be verified. Unverified mappings, unknown candidates and IDs already bound to a different team produce private pending `FootballIdentityReview` records. They do not merge canonical rows or move fixtures by name. Verified alternate IDs can bind to the existing candidate; conflicting existing mappings require private resolution outside an automatic merge.

Future observation times are rejected. Older or weaker duplicate proposals
preserve a previously attributable resolution and its proof rather than erasing
it. New conflicting candidate IDs still create separate pending reviews.

Aliases preserve provider-observed names, normalized search values, observation times and source endpoints. Search normalization applies Unicode NFKC, trims/collapses whitespace and lowercases; accents and meaningful punctuation remain. New catalog tables use `utf8mb4_bin`, so database collation does not silently equate unrelated identity keys. Names/countries/aliases have indexes for later application searches. `store.searchTeams(query, { limit })` searches current and alias names case-insensitively through those normalized values, with a limit of 1–100. It returns stored catalog records and performs no provider calls.

## Observation and update rules

- Store UTC instants as MySQL `DATETIME(3)`. MySQL-compatible instant inputs require years 1000–9999. Derive the fixture's `eatDate` through [004's Africa/Kampala calendar](../src/domain/calendar.ts); a fixed three-hour SQL calculation would mishandle historical offsets. The database enforces paired kickoff/date nullness.
- The current 007 adapter rejects kickoff instants before 1970. The catalog's broader storage/calendar contract does not extend that provider support. The historical-offset database check uses an explicitly synthetic normalized future-contract observation; actual historical coverage still requires provider evidence.
- New missing values remain null. Later absent names, country, code, national flag, competition type, season metadata, round, kickoff and elapsed values preserve their last known fields. Unknown season coverage flags do not erase known flags. Absent provider update timestamps preserve the last known timestamp.
- Apply mutable observations only when retrieval time does not move backward and a supplied provider update timestamp does not precede the stored one. Store cache times as supplied, without advancing them to receipt time. Previously unknown update times remain explicitly unknown.
- An incoming normalized `unknown` status preserves an existing known status/provider status. A valid newer explicit provider status may change the state, including postponement, cancellation or corrections. Missing fixtures never imply full time, cancellation, deletion or an empty catalog.
- Persist regulation scores only after independent verification plus an attributable evidence reference. The regulation period includes stoppage time and excludes extra-time/shootout totals. Missing or unverified scores preserve a previously verified score only while its status/provider-status context is unchanged; a changed context clears that old score until new proof is available. Paired scores and evidence/timestamp are enforced in SQL.
- Store approved HTTPS logo URL strings only. The importer does not fetch, proxy, cache or store provider image bytes. It rejects credential-bearing/query/fragment URLs. A denied existing URL can be removed on a fresh shared-record update even when the incoming logo is missing. Downstream public display still needs current rights approval; a stored URL is not a perpetual permission grant.
- Competition country flags (`FootballCompetition.countryFlagUrl`) follow the same rules as logos; see [Country flags](#country-flags) for the one difference (no fixture version bump).

## Country flags

Cards show the competition's country beside its flag. The flag URL comes from
two provider fields, both run through the logo path (structural check in the
normalizer, the catalog authority's `verifyLogo`, then `permittedLogo` in the
store):

- `/fixtures` rows: `league.flag`. This is the regular date sync, so flags fill
  in without extra requests. The official v3 examples show
  `https://media.api-sports.io/flags/<code>.svg`, and `null` for international
  ("World") competitions. The repository's synthetic fixtures omit the key.
- `/leagues` (the `competitions` catalog import): `country.flag`, or a
  league-level `flag` when the country object has none.

The flag is decoration that was never validated before this change, so an
absent, `null` or malformed value (not a string) counts as "no flag" and never
rejects a row; it is recorded as missing coverage `competition-country-flag`. An
unsafe or unapproved URL is dropped (`competition-country-flag-rights-review`).
The live authority approves `https://media(-N).api-sports.io/flags/<xx>.svg` and
`/flags/<xx>-<sub>.svg` (for example `gb-eng`) besides the logo paths, under the
same owner-recorded public-rights reference.

Storage: `FootballCompetition.countryFlagUrl VARCHAR(2048) NULL` (migration
[`20261011075627_competition_country_flag`](../prisma/migrations/20261011075627_competition_country_flag/migration.sql)).
A later import with no flag (null, absent or unapproved) keeps the stored one,
exactly like a logo; a stored flag the verifier no longer approves is removed on
the next fresh update. The flag belongs to the country, so a row that changes the
competition's country keeps no old flag: it stores the row's own flag, or none
until a later row brings one.

**No version bump.** Unlike name, country, type and logo, a flag change alone is
not a shared-identity change: it bumps no fixture `dataVersion` and writes no
fixture audit. Otherwise the first date sync after the column ships would mark
every competition of a worldwide date as changed and version every stored
fixture of those competitions (history included) inside one catalog
transaction. When a flag changes together with a versioned field, the
shared-identity audit records it beside that field. Public reads still show a new
flag at once: every `FootballCompetition` update advances the `global:catalog`
cache tag (trigger from the public response cache), and feed and detail
responses are only cached for 5 seconds. A page left open keeps the record it has
until that fixture's next version bump or a reload.

## Coverage and empty dates

Each `FootballImport` stores the exact selection, immutable fingerprints, source/receipt times, request count, received/imported/rejected counts, normalized reasons, missing IDs/coverage and durable fixture/change ID outcomes. Its unsigned monotonic `sequence` provides a tie-breaker when observations have identical millisecond timestamps; opaque UUID order has no chronological meaning.

| Import status | Meaning |
| --- | --- |
| `complete` | Validated complete retrieval for the exact recorded scope; unsupported enrichment fields can still be explicitly unknown. |
| `partial` | Some structured rows were accepted, but retrieval, identity, source or row validation was incomplete. |
| `failed` | No usable rows established the requested coverage; existing records remain. |
| `degraded` | A partial response has an explicitly approved, listed known fixture subset; it does not establish complete coverage. |

`store.dateCoverage(selection)` reads the latest exact-scope import, last complete import and known matching fixtures in one repeatable-read transaction. It orders observations by source time and then import sequence. A competition/team/round filter's receipt cannot certify a broader date or another filter. The result is `unknown` without a receipt; `complete-empty` requires the latest receipt to be complete and empty **and** no previously known fixture to match that scope. `providerReturnedEmpty` separately records the response's observation without deleting existing fixtures. A newer failed/partial/degraded receipt remains visible alongside the previous complete receipt and known records.

## Versions, audit and coordination

Fixture `dataVersion` is an unsigned monotonic integer, initially 1. Material relationship, round, schedule, normalized/provider status, elapsed and verified score changes increment it atomically. Shared team/competition/alias changes also increment versions for existing fixtures that reference the changed identity. Unchanged repeated observations update source metadata without incrementing the version. The unique `(fixtureId, dataVersion)` audit key records a material version once; version overflow rejects the transaction. Import data, entity changes, fixture versions and audits commit together or all roll back. Shared-change audits retain normalized old/new attributes and attributable alias additions; they also accompany fixture-owned changes in the same version. The coordinator receives shared attributes from before the import.

`createFootballCatalogStore` accepts `coordinateFixtureMutation`. The callback receives the current transaction, prior fixture snapshot, proposed fields and an `apply()` function. It must invoke and await `apply()` exactly once; failure or omission rolls back the catalog transaction. Keep all callback work transactional. Provider I/O, messages and other external effects do not belong in a database retry callback. The built-in store retries genuine database conflicts only when no coordinator is configured; callbacks supplied by later services are not automatically replayed. The default transaction timeout is 30 seconds and can be explicitly set up to 120 seconds.

`store.withFixtureTransaction(fixtureId, callback)` exposes the same provider-then-fixture lock order to subsequent cycle/schedule services. Once those services are implemented, configure the shared coordinator in every importer and route schedule/status changes through that path. Direct Prisma fixture writes would bypass version/audit/coordinator invariants and must not become an alternative mutation entry point. This feature adds the boundary without implementing cycle lifecycle, schedule polling, forecasts, daily manifests or settlement jobs.

## Team codes (spare-quota import)

Phone match cards show team names abbreviated: the provider code (for example
`MUN`) when the team has one, else a derived abbreviation
([match card](match-card.md)). The
live pipeline imports teams through `/fixtures`, which carries no code, so
`FootballTeam.code` stays null until a `teams` import by competition/season
(`/teams?league&season`) observes the league. That endpoint returns every team of
the league-season with a 3-letter code, often null for small clubs, youth and
women's sides.

[`src/server/teams/`](../src/server/teams/) adds a low-priority enrichment job
that runs those imports from spare quota only:

- **Selection** (`team-code-mysql-store.ts`, `team-code-service.ts`). Each sweep
  reads the competition-seasons with a fixture kicking off from 3 hours ago to
  8 days ahead whose home or away team has `code IS NULL`. It orders them by that
  earliest kickoff (then league id and season) and skips every competition-season
  checked recently. Leagues that stay codeless after their check remain
  candidates, so the read pages through that order (keyset pages of 200, at most
  five per sweep) until it has the sweep's due seasons; checked leagues therefore
  never crowd unchecked ones out of a bounded read. A season that comes round
  again on a later page (a catalog write moved its earliest codeless kickoff
  between the reads) is considered once per sweep. Up to four are imported per
  sweep, one at a time, through the ordinary `createFootballCatalogImporter` with
  a new UUID each.
- **Writes.** The job writes no codes itself. The catalog store keeps an existing
  code when the provider sends null, creates league teams that have no fixture
  yet, and bumps `dataVersion` (with a shared-identity audit) on every fixture
  that renders a changed team. The feed, the detail read and the public cache
  therefore pick up a new code like any other catalog change.
- **Checked-at markers.** No migration was needed. The import's own append-only
  `FootballImport` receipt (kind `teams`, scope key
  `teamCodeScopeKey({ competitionId, season })`, indexed with `observedAt`) is
  the per-competition-season marker. A complete, partial or degraded receipt
  settles the league for 30 days whether or not codes arrived, so a codeless
  league is not requested again for a month. A failed receipt (provider or quota
  trouble) backs it off for one day. A failed receipt also ends the sweep, and
  the next slot continues. The marker read takes the latest receipt of each
  status per league (a grouped read, at most a few rows per league), so no
  number of other receipts can hide a league's settled answer.
- **Bounds.** `teamCodeBounds` (in `live-plan.ts`): `enrichment` priority, one
  page plus one retry (2 requests), at most 1,000 rows and 4 MB, never cached. Each
  league's provider window ends 60 seconds after it starts. A league starts only
  while 3 minutes of the attempt and slot remain.

The job, its quota gate and the runner wiring are in
[live operations](live-operations.md#team-codes). Synthetic coverage:
`npm run test:team-codes` (unit tests plus `tests/team-codes.integration.mjs` on an
owned MySQL under the application role's catalog grants).

## Migration and local checks

The incremental migration is [`20261008214325_canonical_football_catalog`](../prisma/migrations/20261008214325_canonical_football_catalog/migration.sql), extended additively by [`20261011075627_competition_country_flag`](../prisma/migrations/20261011075627_competition_country_flag/migration.sql) (one nullable column). It adds only catalog tables; existing quota state remains unchanged. The reviewed SQL includes InnoDB, binary collations, restrictive foreign keys, uniqueness/search indexes and checks for distinct home/away teams, valid paired score/date fields, positive versions and nonnegative counts. Prisma cannot represent these CHECK constraints in its schema snapshot, so review the SQL as well as the generated Prisma diff.

Use the repository's pinned Node/npm versions. `npm run db:validate` and `npm run db:generate` operate offline. `npm run db:deploy` requires the separately approved migration account and target policy; application credentials are not substituted. Run `npm run check` for the local lint/type/unit/build checks and `npm run test:catalog` for durable concurrency, rollback, coverage and version acceptance against an owned throwaway MySQL server. Local fixtures are synthetic and do not satisfy the outstanding live-trial evidence gates.
