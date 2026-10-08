# Fixture evidence runbook

The evidence layer collects attributable facts for one canonical fixture and preserves the exact input used by an analysis. It does not generate forecasts, create analysis cycles or runs, or publish explanations.

The licensed research provider and its concrete adapter remain unselected. OP13 and OP14 in [the decision register](implementation-decisions.md) still require approved sources, reuse and archive retention rights, minimum coverage, freshness, and conflict/unknown-timestamp rules. `evidence-research.ts` provides an integration contract for that future adapter; it is not an implementation of a selected research service. The 011 checkbox in [the development tracker](../dev-tracker.md) remains empty while the actual binding and policy choices are pending. All acceptance evidence described here uses synthetic data and permissions.

## Server modules and boundaries

| Module | Main API | Responsibility |
| --- | --- | --- |
| `src/server/evidence/evidence-contract.ts` | `EvidenceContext`, `EvidencePolicy`, `EvidenceAuthority`, `EvidenceWorkflow` | Explicit identities, timestamps, coverage rules, permissions and cancellation context. |
| `src/server/evidence/evidence-input.ts` | `parseEvidenceContext`, `parseEvidencePolicy`, `parseEvidenceSource`, `parseEvidenceSnapshot` | Strict bounded inputs, safe attribution links, immutable values and content hashes. |
| `src/server/evidence/evidence-snapshot.ts` | `buildEvidenceSnapshot`, `assertPreparedEvidenceSnapshot`, `evidenceSourceExclusion` | Eligibility, normalized facts, conflicts, missingness, coverage and prepared-object authorization. |
| `src/server/evidence/evidence-service.ts` | `createEvidenceService(...).collect(request)` | Request replay, fresh source eligibility, shared collection deadline and immutable persistence. |
| `src/server/evidence/evidence-football.ts` | `createFootballEvidenceCollector(...).collect(context, policy, plan, workflow?)` | Existing quota-controlled football observations and supported canonical derivations. |
| `src/server/evidence/evidence-research.ts` | `createResearchEvidenceAdapter(...).collect(context, policy, plan, workflow?)` | Runtime/licensing checks and the existing cost gateway around one supplied provider binding. |
| `src/server/evidence/evidence-network.ts` | `createEvidenceSourceFetcher(...).fetch(url, networkPolicy, { signal }?)` | Bounded, authorized HTTPS source fetching with public-address validation and DNS pinning. |
| `src/server/evidence/evidence-mysql-store.ts` | `createMysqlEvidenceStore(database, { catalog }?).save(...)`, `.find(requestId)` | Immutable request replay, normalized source versions and reproducible archived snapshots. |

These modules are server-only. Permission verifiers are trusted synchronous server code. Retrieved text cannot supply a verifier, alter a workflow, invoke a tool or authorize a request.

## Context and policy

Supply the canonical fixture UUID, exact bigint `fixtureVersion`, API-Football fixture ID, canonical home/away UUIDs and the mapped provider IDs. The catalog exposes all verified provider aliases for each canonical team; a caller may select an alias only when it maps to the stated canonical team. Equal names are not identity evidence.

`kickoffAt`, `analysisAt` and `cutoffAt` use the shared calendar's UTC epoch-millisecond instants. The cutoff must be at or before analysis, and analysis must precede kickoff. Reporting-date selections use the shared Africa/Kampala calendar. A schedule, team or fixture-version change between collection and persistence rejects that prepared context instead of silently moving its evidence to another fixture state.

Both `cycleId` and `runId` must be present in the context. Use explicit `null` when the caller has no reference. When available, pass the caller's actual UUIDs and verify their scope. This feature creates no cycle/run records and invents no production references; later orchestration owns those lifecycles.

Every `EvidencePolicy` requires a version, an evidence reference and explicit bounds. Configure source/claim counts, extract and value lengths, title/publisher lengths and serialized source/snapshot byte limits. Configure football and news freshness separately, including the chosen timestamp basis, maximum age, unknown-timestamp behavior and conflict behavior. There are no inferred operating thresholds or licensed-source permissions.

Minimum coverage counts history, form and statistics for each team, plus configured venue, rest and independent news requirements. Missing news produces the factual label `Limited news coverage`. It does not force fallback when the approved evidence threshold is met; if that threshold requires more news, coverage is insufficient. Missing injuries or lineups remain unavailable facts, and never imply a fully fit squad. Conflicts, rumors, unknown values and unknown timestamps retain explicit flags under the approved policy.

## Collection and deadlines

`createEvidenceService({ authority, store, football, research, clock? })` accepts a strict collection request:

```ts
{
  requestId,        // Explicit lowercase SHA-256 request identity.
  context,
  policy,
  footballPlan,     // FootballEvidencePlan, or explicit null for stored-only collection.
  researchPlan,     // ResearchEvidencePlan, or explicit null when no search is selected.
  cachedSources,    // Original bounded EvidenceSource versions, including original timestamps.
  maxElapsedMs,     // Explicit positive workflow time allowance.
}
```

The service returns `collected` or `reused` with the immutable snapshot, `requestsDispatched`, `requestCountUnknown` and private `collectionIssues`; workflow failures return `denied` with a safe reason. Its request fingerprint includes context, policy, plans, cached sources and elapsed allowance. Identical local requests join the same pending collection, while a conflicting use of that request ID is denied. Durable replay is looked up before provider I/O and receives a fresh eligibility check. Valid replay returns the original archive and timestamps, zero new calls and `collectionIssues: []`; the original paid attempt and any uncertain cost remain in the cost ledger.

Football and research collectors receive the same workflow authorization/deadline boundary. `ResearchEvidencePlan.targetIndependentSources` is an explicit positive acquisition/cache target, separate from `policy.minimum.newsSources`, which governs primary-input eligibility. When a research plan is supplied and eligible cached news is below its target, optional research can run even when the approved primary minimum is zero.

A denied or unconfigured research attempt preserves the structured football snapshot, records a safe private issue such as `{ kind: "research", reason: "unconfigured" }`, and retains its actual dispatch/uncertainty counters. Failed research sources are never added as facts. Coverage still follows the approved policy, so missing news can leave primary inputs sufficient while exposing `Limited news coverage`. If the configured primary threshold requires more news, coverage stays insufficient. An overall workflow timeout still denies the expired collection; it cannot authorize a late snapshot commit.

Football collection uses the existing API-Football evidence endpoints and account quota gateway. It accepts only verified regulation results when deriving recent form and kickoff gaps, and checks historical results against canonical records. Listed home/away assignment is distinct from a known neutral venue or quantified home advantage. Unsupported expected-goals mappings remain unknown. Ready-made provider forecasts are outside this collector's adapter interface.

The football plan explicitly supplies its date range, per-team history/statistics limits, optional injury/lineup requests, total requests, elapsed time, adapter bounds and retained-source permissions. Source timestamps come from the original catalog/provider observation. Cached or newly queried data is not restamped to the analysis cutoff. Evidence observed after cutoff is excluded even if a later retrieval would otherwise provide useful facts.

`EvidenceWorkflow` carries the shared deadline, abort signal and a fresh authorization check. Collection honors both the workflow deadline and its own tighter plan bounds. Bounded operations reject clock regressions and late results. An uncertain dispatch is reported as uncertain and stops further collection rather than implying a free request. The existing football adapter owns its quota feedback; the cost gateway owns research reservation, single-use dispatch, measured usage reconciliation and conservative treatment of uncertain costs.

The research bridge requires a concrete `ResearchProviderBinding`, matching runtime/provider configuration, verified licensing and evidence/freshness approvals, a bounded `ResearchEvidencePlan`, and the existing research cost gateway. Its trusted `verifyBinding` must bind the selected provider, reviewed contract and license to the actual fixture, job, work key, attempt and configured bounds. A caller cannot reuse an otherwise valid provider approval for unrelated paid work. This feature supplies no invented job-ID recipe; the reviewed intent and verifier own that scope.

A missing binding returns `unconfigured` before provider I/O. Each bridge call permits one bounded search attempt; it does not invent a retry or automatically fetch every article URL. A selected provider implementation must account for every billable attempt and separately authorize any source fetches.

## Snapshot preparation and replay

`buildEvidenceSnapshot({ context, policy, sources }, authority)` parses and filters source versions, records exclusions, groups claims into stable facts, preserves conflicting variants, calculates missingness/coverage, and returns a deeply frozen snapshot. Source records include publisher, title, safe URL where applicable, publication/retrieval/update timestamps, extracted claims, evidence references and explicit reuse metadata. Syndication families and equivalent claims do not manufacture independent news coverage.

`evidenceSourceId` hashes the canonical normalized source body, including its original timestamps, binding and reuse metadata. A changed claim or source version produces a new ID. Snapshot `id` and `hash` are the same SHA-256 hash of the canonical snapshot body, including context, policy, facts, source versions, exclusions, missingness and coverage. Exact bigint versions use the canonical `$evidenceInteger` representation during serialization.

Preparation binds the returned snapshot object to the exact authority object that approved it. `parseEvidenceSnapshot` validates an archive and its hash but does not authorize a new write. A cloned or reconstructed snapshot must pass fresh preparation; callers cannot bypass permission checks by copying a previously approved object.

Persist through:

```ts
await store.save(requestId, requestFingerprint, preparedSnapshot, authority);
const archived = await store.find(requestId);
// archived is null, or { requestFingerprint, snapshot }.
```

`requestId` and `requestFingerprint` are caller-supplied lowercase SHA-256 identities. A repeated request with the same fingerprint and snapshot returns the stored result. Rebinding it to different request inputs or facts fails. Separate explicit requests may share an identical snapshot body without duplicating its normalized source versions.

An archived read proves storage consistency, not current eligibility. `store.find` is an internal historical-archive read; any access to retained licensed content requires its separate approved purpose and archive rights. Before returning cached evidence for another collection attempt, recheck current context, policy, freshness, source rights, retention/reuse permissions and cutoff against the original timestamps. The service additionally checks `retainUntil` against its live clock, so an old analysis time cannot revive expired reuse rights. Reuse must not trigger a new provider request or claim a new retrieval time. A changed fixture version, expired permission or newly insufficient coverage requires the caller to reject reuse or collect under a new explicit request.

## MySQL records and privileges

Migration `20261008225550_fixture_evidence` adds three InnoDB tables with binary identity collation:

| Table | Identity and retained content |
| --- | --- |
| `EvidenceSourceVersion` | Content-addressed source ID, original attribution/timestamps/reuse metadata, canonical fixture/team/version binding and bounded normalized JSON. |
| `FixtureEvidenceSnapshot` | Explicit request ID/fingerprint, indexed snapshot content hash, analysis/cutoff/kickoff, nullable caller cycle/run references, policy version, coverage and immutable snapshot JSON. |
| `FixtureEvidenceSnapshotSource` | One request/source link with the same fixture, teams and exact version on both composite foreign keys. |

Use migration credentials to deploy and verify the schema. The application needs **SELECT and INSERT only** on these three evidence tables. Catalog operations retain their separately required privileges; schema administration is not an evidence-collection permission.

```sql
GRANT SELECT, INSERT ON goal_hint.EvidenceSourceVersion TO 'goal_hint_application'@'application-host';
GRANT SELECT, INSERT ON goal_hint.FixtureEvidenceSnapshot TO 'goal_hint_application'@'application-host';
GRANT SELECT, INSERT ON goal_hint.FixtureEvidenceSnapshotSource TO 'goal_hint_application'@'application-host';
```

Replace the example database/user/host with the approved deployment identities. Do not grant evidence-table UPDATE/DELETE to normal collection workers.

Writes use the catalog's existing provider-then-fixture transaction boundary, lock the selected external team mappings, and verify the current fixture/version/team/kickoff context. Source versions, the snapshot and all links commit together. Context, source and reuse approvals are checked again before commit; a revocation rolls back every new record. Provider calls never occur inside this transaction.

Reads validate canonical content hashes, native metadata projections, SQL JSON checksums, the request identity/fingerprint checksum and each exact source link. They preserve the original snapshot after later upstream changes. Storage failure and corrupted metadata return sanitized errors without copied text or connection details.

## Privacy, rights and retention

Store bounded permitted claim summaries or short extracts only under verified rights. The schema has no raw article body, full provider payload, prompt, credential or API-key field. URLs must not carry credentials or sensitive query parameters. Text that resembles instructions remains passive source data and is never executed or concatenated into worker authority.

`reuse.retainUntil` is explicit source metadata. Passing that timestamp does not purge an existing archive. Reuse eligibility and permission to retain an immutable analysis archive are separate rights decisions. Before live use, OP13 must approve both the bounded extracts and the archive retention policy. A required retention change needs an authorized maintenance process and must account for snapshot references; this collector neither silently deletes history nor extends a source's permission by rewriting timestamps.

Do not log full source text, claims, search bodies, provider responses, credentials or prompts. Log safe status/reason values and opaque request/hash identities when operationally necessary. Stored coverage and missingness are evidence for later presentation, not a public explanation generated by this feature.

## Source-fetch security

`validateEvidenceSourceUrl` permits approved HTTPS hostnames and approved nonsensitive query names. The fetcher rejects credentials, fragments, obfuscated authorities, IP-literal URLs, unsafe schemes, unapproved hosts and inappropriate ports. An approved hostname alone does not authorize a network target.

Before each request, resolve all DNS answers and reject the whole set if any address is private, loopback, link-local, in a blocked special-use range or an internal cloud target. The IPv6 policy conservatively allows global-unicast `2000::/3` addresses while excluding its blocked special-use, transition and documentation prefixes. Public IP-literal source URLs are still rejected. Pin the validated address to the socket while keeping the original hostname for TLS certificate verification. Every redirect repeats URL approval, DNS/address checks and permission checks, with explicit request/redirect limits. Redirect loops and escapes fail closed. The implementation uses the official Node [DNS lookup](https://nodejs.org/docs/latest-v24.x/api/dns.html), [HTTP request lookup option](https://nodejs.org/docs/latest-v24.x/api/http.html) and [HTTPS request](https://nodejs.org/api/https.html) contracts; address policy is informed by the IANA [IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry) and [IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry) special-purpose registries.

The fetcher bounds elapsed time, response bytes and text characters, accepts only approved text content types and supported UTF-8/ASCII charsets, requests identity encoding and rejects compressed responses. Safety ceilings cap configured requests at six, redirects at five, response bytes at 2 MiB and decoded text at 2,097,152 JavaScript characters; these ceilings do not approve an operating allowance or source license. Requests use code-owned headers, certificate verification, no proxy credentials and no connection pooling. Resolver/transport injection is trusted server/test code, never source-provided configuration. Aborts and late responses are drained and closed. It returns fetched text only to the trusted extraction boundary; it does not store unrestricted articles or interpret HTML/scripts as worker instructions.

## Local acceptance

Use the pinned Node 24.18.1 installation. Generate the guarded Prisma client before testing, and keep generation separate from running tests:

```powershell
$pinnedNodeDirectory = 'C:\Users\WASSWA WILSON\AppData\Roaming\fnm\node-versions\v24.18.1\installation'
$env:Path = $pinnedNodeDirectory + [IO.Path]::PathSeparator + $env:Path
npm run db:generate
if ($LASTEXITCODE -ne 0) { throw 'Prisma generation failed.' }
npm run db:validate
if ($LASTEXITCODE -ne 0) { throw 'Schema validation failed.' }
npm test
```

The database acceptance target is a fresh owned genuine MySQL process, not an installed service or a production database:

```powershell
$env:MYSQL_TEST_SERVER_BINARY = (Resolve-Path -LiteralPath '.tmp/mysql-tools/mysql-8.4.11-winx64/bin/mysqld.exe').Path
node --conditions=react-server --test tests/evidence.integration.mjs *> '.tmp/evidence-acceptance.log'
$evidenceExitCode = $LASTEXITCODE
Get-Content -LiteralPath '.tmp/evidence-acceptance.log' -Tail 90
if ($evidenceExitCode -ne 0) { throw 'Fixture evidence acceptance failed; inspect the log.' }
```

The observed MySQL 8.4.11 run passed all **20 tests**, with no failures or skips. It covered schema drift and role separation, concurrent request idempotency, source-version deduplication, cutoff exclusions, wrong fixture/team bindings, composite foreign keys, changed schedule/version rejection, permission-revocation rollback, explicit nullable cycle/run references, exact bigint versions, corrupted JSON/native projections, protected archives and unavailable storage. The helper verifies process/datadir ownership and removes only its throwaway server after shutdown.

Offline contracts and synthetic provider/network responses do not prove live credentials, source coverage, pricing, permissions or licensed-provider behavior. Keep 011's completion checkbox empty until the selected adapter and approved rules are implemented and local acceptance passes. Without authorized credentials, record live research integration and coverage as pending separately; local checks do not approve live use.
