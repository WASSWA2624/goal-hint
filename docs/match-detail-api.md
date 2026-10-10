# Match detail API

`GET /api/matches/{fixtureId}` is an anonymous, stored-data-only Node route.
`createMatchDetailService({ database, clock? }).query(fixtureId, searchParams?)`
provides the same response for [server-rendered detail pages](match-detail-page.md).
API and page use `readPublicMatchDetail` with the shared 031 response cache.
IDs are canonical UUIDs.
The route validates inputs before initializing the database. No visitor account,
cookie, provider request, AI invocation, settlement write or refresh job is used.

## Selection and history query

| Parameter | Contract |
| --- | --- |
| `revision` | Optional immutable revision UUID owned by this fixture. |
| `cycle` | Optional cycle UUID owned by this fixture. Uses that cycle's display rules. Mutually exclusive with `revision`. |
| `limit` | Entries per history collection, default 10, maximum 20. |
| `revisionAnchor` | Inclusive upper fixture revision sequence; zero pins empty history. Omission captures the latest sequence in the read transaction. |
| `revisionBefore` | Exclusive upper revision sequence; requires `revisionAnchor`, and cannot exceed it. |
| `cycleAnchor` | Inclusive upper cycle ordinal; zero pins empty history. Omission captures the latest ordinal. |
| `cycleBefore` | Exclusive upper cycle ordinal; requires `cycleAnchor`, and cannot exceed it. |

Unknown or duplicate parameters, malformed UUIDs, noncanonical integers, invalid
bounds and query strings above 2,048 UTF-8 bytes return 400. Sequences fit MySQL
unsigned INT. A syntactically valid unknown fixture, revision or cycle returns
404. A cross-fixture reference receives the same 404 without disclosing ownership.

Both history collections sort newest first by their unique fixture revision
sequence or cycle ordinal. Each returns `anchor`, `entries` and `next`. Follow
`next` unchanged: it preserves the selection, page limit, both anchors and the
other collection's cursor. New publications and cycles cannot shift membership
under those anchors. There are no offsets or unbounded totals. The revision
history next URL also appears in the standard HTTP `Link: ...; rel="next"`
header. Cycle pagination uses its JSON link.

Anchors pin collection membership, not a past database transaction. Current
fixture metadata, cycle states, applicable revision, permissions and audited
outcomes reflect each response's `asOf`. Revisions remain immutable. To retain a
chosen snapshot while following history, supply its `revision` UUID; pagination
without an explicit selection continues to show the currently applicable one.

## Public response

The strict schema is `src/domain/match-detail.ts`. Responses are capped at 1 MiB.
All timestamps are UTC epoch milliseconds; versions and run sequences that may
exceed JavaScript's safe integer range are decimal strings.

- `fixture` reuses the feed's complete safe record: canonical fixture ID and
  monotonic `dataVersion`, teams, competition, kickoff, status, coherent live or
  verified regulation score, score period, sync time, exact-date coverage,
  applicable cycle, current/locked/void forecast and operational update metadata.
  Its `forecast` always belongs to the currently applicable cycle, regardless of
  a requested historical selection.
- `route` contains `fixtureId`, a bounded team-name `slug`, and the English
  page path `/en/matches/{fixtureId}/{slug}`. Slugs normalize accents and unsafe
  characters, with `home`/`away` fallbacks. Names may change the decorative slug;
  the UUID remains the route identity. Prompt 035 implements the page and permanent
  redirects for changed slugs; prompt 036 owns its history browsing controls.
- `currentRevisionId` is the applicable display revision, or null. `selection`
  records `applicable`, `revision` or `cycle`. `selectedCycle` retains the chosen
  cycle's identity and lifecycle timestamps even when it has no forecast.
- `snapshot` is the selected immutable revision, or null. It includes cycle/run/
  revision references, fixture and cycle revision counters, the fixture version
  at generation, evidence cutoff, generation completion and publication times.
  `historical` means the revision differs from `currentRevisionId`.
  `applicability` is `current`, `locked`, `void` or `historical`.
- `history.revisions.entries` contains bounded public revision identities and
  clocks, persisted `runDate`, distinct available-market `sources` and the public
  `cycle` projection (036). These support ordered publication labels without
  fetching every full snapshot. There are no candidate payloads. `history.cycles.entries` contains public
  cycle states, current/locked references, schedule/lifecycle clocks and safe
  void reasons. Entries can be selected using their IDs.

Open cycles display their current pointer; closed cycles display only their
locked pointer. Closing without an eligible lock yields a valid null snapshot,
even if an ineligible current preview remains stored. Void cycles display their
lock, otherwise their current or last recorded preview, and retain the public
void reason. An explicitly selected earlier unlocked revision is marked
historical and has no outcomes. Known unpublished fixtures also return 200 with
a null snapshot and explicit unavailable families.

## Forecasts, analysis and outcomes

Each available snapshot market preserves the complete validated regulation-time
probability group, deterministic selected pick and unrounded selected probability.
`alternatives` lists the other selections and their original probabilities;
alternatives have no outcome badges. Unavailable families are explicit. Double
chance remains derived from the same source-owned match-result group.

Per-market `source` exposes only AI/API-Football origin, provisional status,
approved attribution IDs and a whitelisted fallback trigger. Private denial
details, model identities, invocation pins and proof references are omitted.
`timestamps` preserves generation, retrieval and provider update clocks separately.
Unknown generation/update times remain null; publication time never substitutes
for a missing source clock. Mixed-family origin and every probability belong to
the same selected revision.

`snapshot.analysis` is revision-level. When permitted, it contains the resolver's
two to four original supported reasons, one uncertainty, limited-news status and
source attribution with independent publication/retrieval/update times. The
legacy per-market `reasons` and `uncertainty` slots remain empty; consumers use
this revision-level analysis and the per-family source metadata together.

Only cited AI evidence with stored summary permission and retention valid at
`asOf` is attributed. Provider fallback attribution comes from the validated
publication provenance. Links pass the existing offline safe-HTTPS rules; no DNS
lookup or URL fetch occurs. The public projection never includes raw claims,
article bodies, provider payloads, prompts, internal reasoning or worker logs.
Up to 500 cited AI sources (four reasons plus one uncertainty, each bounded at
100 citations) and one provider attribution fit the public source-count bound;
the serialized response limit still applies.

If an AI source has expired, or a retained explanation cites a URL that is not
permitted, the analysis becomes `withheld`, with empty reasons and null
uncertainty. The resolver retains URLs rather than claim references, so this
conservative filter withholds the whole explanation instead of guessing which
sentence remains permitted. Original probabilities and clocks stay available;
no replacement reasons are invented. Independent permitted attribution remains.

`snapshot.outcomes` is separate from scores and alternatives. Each outcome binds
the selected family/pick to its cycle and revision. Correct/incorrect requires
the immutable locked revision and a sealed settlement whose input hash still
matches the canonical verified result. A correction makes stale outcomes pending
until private settlement catches up. Public reason codes are `verified-result`,
`awaiting-result`, `result-correction` and `void-cycle`, with original public
explanations and separate `settledAt`, `correctedAt` and `voidedAt` clocks. Void
previews retain their cycle reason/time without fabricating a locked selection.

## Errors and operating policy

Feed and detail reuse one safe JSON error serializer and no-store/nosniff headers:
400 `invalid-query`, 404 `not-found`, 429 `rate-limited`, 503 `unavailable`.
Only 429/503 are recoverable, with the existing remaining-window/five-second
Retry-After policy. Driver, integrity, configuration and internal diagnostics
never appear in public responses or masquerade as unpublished fixtures.

The existing aggregate 120-searches/minute policy applies to feed searches.
ID/revision detail reads do not perform search or consume its persistent counter;
they are bounded by query size, history limits, response size and a 30-second
repeatable-read transaction. No visitor identity or authentication cookie is
introduced. No new table, migration, runtime write grant, cache, worker or
scheduler is required. Existing database and upstream provider/model/rights gates
remain effective. Local synthetic acceptance does not establish live rights,
forecast quality, production capacity or deployment readiness.

## Browser refresh and shared progress

`run` uses the feed's shared daily-run DTO and `storedFeedRun` in the detail read
transaction for fixtures in the forward window; historical fixtures outside it
return null. Counts are manifest/job totals, independent of this fixture or
filters. Applicable snapshots must agree with their card forecast's run, revision,
publication and complete market groups. Detail cache projection 3 includes the
run/provenance contract. Current browser refresh omits history query parameters;
selected historical snapshots remain separate. See [live client refresh](live-client-refresh.md).
