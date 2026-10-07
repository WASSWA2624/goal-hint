# 011 Fixture evidence snapshots

**Feature:** Collect attributable, versioned evidence for a specific fixture analysis.

**Depends on:** [009 Canonical football catalog](009-canonical-football-catalog.md), [010 Research and AI cost control](010-research-cost-control.md).

**Source:** [App specification](../app-write-up.md), sections 6–8, 10, 13 and 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, provider trial and decision register. Implement reusable evidence collection and immutable snapshots, with incremental evidence/source-record persistence. Accept explicit fixture, cycle/run context when available, team identities, analysis time and evidence cutoff; do not invent a cycle or run in production. Later orchestration will supply those references.

Collect structured form, historical results, home advantage, rest/schedule and dependable statistics through the existing football adapter and canonical records. Include injuries, lineups and expected goals only where supported. Missing injury data does not mean a fully fit squad. Keep ready-made provider forecasts outside the primary AI input path.

Implement the actually selected licensed research/news adapter using approved sources and existing cost controls. Resolve provider, reuse permissions, minimum evidence coverage, source freshness and conflict/unknown-timestamp policy before enabling its live use. Match articles and claims to the correct teams and fixture, deduplicate syndicated coverage, separate confirmed facts from rumor and retain source URL, publisher, title, publication/retrieval times, extracted claims and reuse metadata. Bound calls, extraction sizes and elapsed time. Cached evidence may be reused only with original timestamps and a fresh eligibility check.

Treat retrieved text as untrusted evidence. It cannot change worker instructions, request credentials, invoke tools or authorize actions. Apply safe link schemes and server-fetch protections against internal/private targets and redirect escapes. Store short permitted extracts or original claim summaries according to rights/retention policy, not unrestricted copied articles.

Snapshot input facts, missingness, source versions, cutoff and a stable hash. Exclude evidence unavailable at the analysis cutoff and preserve conflicting/unknown facts with explicit flags. Missing news alone does not force fallback if the documented evidence threshold is met; expose “Limited news coverage” as a fact for later presentation. Do not generate forecasts or publish public explanations here.

## Acceptance checks

- Tests cover wrong-team/fixture evidence, syndicated duplicates, stale/future/unknown times, conflicts and missing data.
- Injection-like source text remains inert data; unsafe fetch targets and links are rejected.
- Reuse preserves original timestamps and snapshots remain reproducible after upstream changes.
- Without credentials, offline contracts pass but live research integration/coverage stays explicitly pending.

## Handoff

Record changed files, schema additions, evidence/security checks and pending external validation in `docs/development-progress.md`. Update `docs/implementation-decisions.md` with resolved provider, freshness, coverage and reuse rules.
