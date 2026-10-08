# 017 Client state

**Feature:** Request-safe client state and version-aware server-to-client handoff.

**Depends on:** [004-eat-calendar.md](004-eat-calendar.md), [005-market-domain.md](005-market-domain.md), [009-canonical-football-catalog.md](009-canonical-football-catalog.md), [016-locale-navigation.md](016-locale-navigation.md)

**Source:** [app-write-up.md](../app-write-up.md) §§2, 9, 11–13, 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, repository instructions and existing code. Implement this client-state feature only. Reuse existing shared types and calendar utilities instead of duplicating domain logic.

Create the Redux Toolkit store per provider/request instance; never use a server-global store. Server Components must continue reading server services without accessing Redux. Redux owns shared mutable UI state such as filter drafts and view preferences. Applied date/range, search, league, status and market belong in validated URL parameters; define reusable parsing/serialization and defaults for later feed and API work. Keep the selected market attached to probability sorting and reject incompatible combinations. Store only appropriate anonymous preferences locally, with a stable initial render.

Define a typed, explicit handoff for server-rendered fixture data and subsequent browser updates. Accept only monotonic fixture-data versions and preserve a coherent cycle/run/revision snapshot so late responses cannot replace a newer score, status, cycle, probability, source or explanation. Do not compare opaque identifiers lexically. Separate per-fixture versions from request/query identity: an older query result must not overwrite the current filters or list membership. Support retaining previously loaded records alongside a refresh failure.

Prepare serializable state for loaded pagination position and scroll restoration on Back, scoped to the canonical query. Implement the state/reconciliation contracts and focused tests now; concrete feed behavior and endpoint polling are later features. Do not invent RTK Query endpoints that are not implemented, add provider requests to browser state, or use local storage as forecast truth. Reset or roll EAT-dependent date state through an explicit calendar event without silently changing a historical date selection.

## Acceptance checks

- Prove store isolation across two rendered requests/providers and hydration consistency.
- Test query round trips, malformed parameters, back-navigation state and market-specific sort validation.
- Test out-of-order responses, equal versions, cycle changes and query changes; older data cannot roll back any part of an accepted snapshot.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Record changed files, checks and blockers in `docs/development-progress.md`; document URL and reconciliation contracts in `docs/implementation-decisions.md` for subsequent API/UI prompts.
