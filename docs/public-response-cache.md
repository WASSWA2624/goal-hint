# Public response cache (031)

The three anonymous APIs use a shared MySQL JSON cache around their existing
bounded stored-data readers. No external cache, provider request, refresh job,
browser polling, authentication or subscription is added. HTTP responses retain
their `no-store` headers: the application owns freshness and invalidation.

## Keys and lifetimes

`public-response-v1` hashes the endpoint kind, normalized locale and validated
query, resolved EAT dates, fixture/history selection and pagination. Feed keys
include enabled competition IDs; performance keys also include the verified
evaluation protocol. Ordering of input URL parameters does not affect identity.
Mutable keys include the current EAT reporting day even for historical queries,
because their window, run and correction envelopes can change at midnight.
Increment the contract version when incompatible public serialization changes.

| Content | Maximum age | Additional bounds |
| --- | --- | --- |
| Feed, detail/history envelope and performance | 5 seconds | Next EAT midnight; detail source permission expiry |
| Immutable revision markets, explanations and original source clocks | 6 hours | Earliest retained source permission expiry; permission epoch in key |

Only immutable public revision content gets the longer lifetime. Current revision,
cycle state, history membership, coverage, results and correction badges are
assembled through the short-lived envelope. Nothing extends a lifetime on a hit.
Slow reads that exhaust their lifetime are returned without filling the cache.
Successful known-empty coverage may be cached; invalid requests, unknown fixtures
and transient failures cannot become successful empty cache records.

Search accounting precedes lookup, including hits. The shared 120/minute budget
continues to apply without recording visitor identity or search text. Each cached
body is at most 1 MiB and is schema-validated before reuse. Original `asOf`, data
versions, revision IDs, actual source retrieval/sync times and performance
fingerprints are preserved without retimestamping. Entries with creation times
ahead of a replica's clock, or ages beyond their lifetime, are rejected.

## Transactional invalidation and recovery

`PublicCacheTag` stores generations for `fixture:<uuid>`, `date:<EAT date>`,
`global:progress` and `global:catalog`. Feed and performance ranges subscribe to
every included date; detail subscribes to its fixture. Progress and catalog tags
conservatively invalidate every mutable response, covering coverage/import/run
changes, actual job transitions, refresh outcomes, team aliases and metadata.
Progress invalidation is intentionally broad until hosted workload measurements
justify a narrower projection. Immutable payloads have no mutable subscriptions.

The 031 migration installs triggers that advance generations and append
`PublicCacheInvalidation` rows **inside the source transaction**. Existing
`PredictionChangeEvent` inserts cover publication, closure, voiding, lifecycle,
results and settlement. Their trigger invalidates the fixture's current date and
all original cycle dates, including historical performance cohorts. Fixture
updates invalidate both old and new kickoff dates and the fixture, including
unchanged-score sync timestamps. Cycle, lifecycle, import and job triggers cover
changes that do not emit prediction events. Source rollback rolls back invalidation.

A probe reads its entry and generations in one repeatable-read snapshot. A fill
retains the generations captured **before** loading its response and checks them
again. Every hit also compares the stored stamp against current generations.
Thus an invalidation between a fill's check and commit still makes that row
unservable; an older read cannot establish new-generation authority. Concurrent
in-flight responses retain their original versions for clients to reject regression.
There is no process-local cache that can hide a database outage.

`npm run cache:reconcile -- 100` performs one bounded private maintenance pass;
the optional batch is 1–1,000. It locks pending journal rows with `SKIP LOCKED`,
verifies each generation is already applied, then acknowledges in the same
transaction. It also removes a bounded batch of expired disposable responses.
Repeat until `acknowledged` and `removed` are zero to drain a backlog. Multiple
replicas can consume safely. No timestamp or maximum-ID cursor is used, so a
transaction that commits late remains discoverable. Failed acknowledgment rolls
back, and duplicate passes are harmless. Invalidation works immediately even if
maintenance or notification delivery is offline. Retain generations and journals;
their eventual archival policy remains part of the approved recovery/retention
work. Schedule bounded cleanup before hosted operation to control storage growth.

Cache lookup/fill transactions have a three-second timeout. A cache error falls
back to the existing bounded stored reader; successful reads survive failed fills.
A database failure returns the existing truthful 503 instead of stale apparently
fresh data. Provider failures preserve stored records and their existing delayed,
partial and unavailable states, without visitor-triggered work.

## Migration and hosting qualification

Deploy `20261009183000_public_response_cache` before using the cache. Keep the
separate migration/trigger definer account with its required database-scoped
rights, including `TRIGGER` and cache-table DML. The application role requires:

```sql
GRANT SELECT ON goal_hint.PublicCacheTag TO 'goal_hint_app'@'<approved-host>';
GRANT SELECT, INSERT, UPDATE, DELETE ON goal_hint.PublicResponseCache TO 'goal_hint_app'@'<approved-host>';
GRANT SELECT, UPDATE (acknowledgedAt) ON goal_hint.PublicCacheInvalidation TO 'goal_hint_app'@'<approved-host>';
```

Use the actual approved database/user/host; these are grant templates. Application
credentials cannot forge generations/journal events, alter triggers or run DDL.
MySQL with binary logging also requires an operator-approved trigger creation
configuration, such as `log_bin_trust_function_creators`; do not give the application
`SUPER` or change a remote server setting automatically. The isolated owned test
server explicitly enables this setting and proves migrations with a separate
schema-scoped role. Prisma `db:verify` checks representable schema/migration state;
trigger behavior and grants need the genuine MySQL acceptance suite as well.

On partially failed DDL, inspect actual tables/triggers and repair forward using
the migration account. Do not drop generations or journal history during rollback.
Reverting route wrappers disables caching safely; retain the migration and definer
so older writers still invalidate correctly. Restore disposable bodies empty, or
clear them with approved cache-only maintenance after restoring a database snapshot.

No hosted target or paid infrastructure is provisioned or approved by 031.
OP-01/12/19/32 still require actual hosting, privileges, itemized infrastructure
budgets, maintenance scheduling and workload measurements. With 15/60-second
observation cadences the cache adds at most five seconds; worker/network time and
upstream delays remain unmeasured. This does not establish a production SLA.

Run `npm run test:cache` with `MYSQL_TEST_SERVER_BINARY` pointing to genuine
MySQL 8.4. The suite covers replica hits, publication/locking, old/new dates,
score/status changes, corrections, progress/coverage, permission expiry, midnight,
rollback, missing notifications, duplicate and late-commit recovery, stale fills,
cache/database outage, and absence of forecasting side effects.
