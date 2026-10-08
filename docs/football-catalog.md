# Canonical football catalog

Prompt [009](../dev-plan/009-canonical-football-catalog.md) adds reusable private catalog persistence. It stores canonical competition/team identities, seasons and fixtures from the existing [007 adapter](../src/server/football/api-football-adapter.ts). The [008 report](reports/provider-trial-008.md) still marks live provider qualification incomplete. Local schema and synthetic acceptance checks do not approve competitions, provider field semantics, source retention, publication or media rights.

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

## Migration and local checks

The incremental migration is [`20261008214325_canonical_football_catalog`](../prisma/migrations/20261008214325_canonical_football_catalog/migration.sql). It adds only catalog tables; existing quota state remains unchanged. The reviewed SQL includes InnoDB, binary collations, restrictive foreign keys, uniqueness/search indexes and checks for distinct home/away teams, valid paired score/date fields, positive versions and nonnegative counts. Prisma cannot represent these CHECK constraints in its schema snapshot, so review the SQL as well as the generated Prisma diff.

Use the repository's pinned Node/npm versions. `npm run db:validate` and `npm run db:generate` operate offline. `npm run db:deploy` requires the separately approved migration account and target policy; application credentials are not substituted. Run `npm run check` for the local lint/type/unit/build checks and `npm run test:catalog` for durable concurrency, rollback, coverage and version acceptance against an owned throwaway MySQL server. Local fixtures are synthetic and do not satisfy the outstanding live-trial evidence gates.
