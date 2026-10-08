# 009 Canonical football catalog

**Feature:** Persist reusable competition, team and fixture identities with trustworthy import coverage.

**Depends on:** [003 MySQL and Prisma runtime](003-mysql-prisma.md), [007 API-Football adapter](007-api-football-adapter.md), [008 Football provider trial](008-football-provider-trial.md).

**Source:** [App specification](../app-write-up.md), sections 2, 5–6 and 9–11.

## Prompt

Read `dev-plan/000-index.md`, the source sections, trial evidence and current schema. Implement catalog persistence using validated provider contracts. Add incremental Prisma migrations for competitions, seasons, canonical teams, provider mappings and fixtures, with the fields and indexes needed for date/kickoff, competition, country, team and alias searches. Store UTC instants and the derived EAT fixture date consistently.

Enforce database uniqueness for provider/external-team and provider/external-fixture identities. Use transactional upserts so repeated and concurrent imports across seasons or competitions reuse one canonical team. Never merge by name alone. Verify alternate IDs through attributable mapping evidence and hold ambiguous identities for private resolution rather than guessing. Maintain reusable aliases and normalized case-insensitive search values for later whole-range search.

Persist home/away relationships, competition/season, scheduled kickoff, normalized status, verified regulation score fields where appropriate, approved remote-logo URL strings, observation times and a monotonic fixture-data version. Increment that version atomically for material visitor-facing changes; do not compare opaque IDs lexically. Introduce audit/import coverage records needed to distinguish complete empty responses, incomplete imports and explicitly degraded known subsets.

Provide a reusable import service using the sole provider adapter. Missing values remain unknown and do not erase reliable fields without a documented update rule. Changed team/logo data updates shared records. Provider disappearance does not establish full time, deletion or cancellation. Preserve previous records during outages. Keep raw data retention within documented permissions.

Expose a transaction boundary for subsequent cycle/schedule services; do not implement daily selection, cycle lifecycle, polling, predictions or public endpoints here. Once those services exist, schedule/status mutations must flow through their coordinated path rather than bypass it. No visitor request initiates an import.

## Acceptance checks

- Concurrent/repeated imports across multiple competitions and seasons produce one canonical team per verified provider identity.
- Ambiguous mappings remain unresolved; aliases can be searched case-insensitively without unsafe name merging.
- Missing/partial imports preserve known data and record coverage; only complete imports establish an empty date.
- Material updates produce monotonic versions and no binary provider images are stored or fetched.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Record migrations, changed files, concurrency/import tests and pending mappings in `docs/development-progress.md`. Update `docs/implementation-decisions.md` with trial-backed schema decisions and genuine coverage blockers.
