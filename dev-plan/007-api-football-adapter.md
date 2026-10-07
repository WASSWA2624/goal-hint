# 007 API-Football adapter

**Feature:** Normalize API-Football data through one protected server adapter.

**Depends on:** [004 East Africa calendar](004-eat-calendar.md), [005 Regulation-time market domain](005-market-domain.md), [006 Shared API-Football quota limiter](006-api-quota-limiter.md).

**Source:** [App specification](../app-write-up.md), sections 5–7 and 10–11.

## Prompt

Read `dev-plan/000-index.md`, the source sections, policy register and existing limiter. Implement the sole server-side API-Football transport and normalization boundary. Consult current official contracts for the selected direct API; retain provenance for observed behavior and do not assume endpoint access proves field coverage.

Route every dispatched request through prompt 006, including retries and diagnostics. Validate credentials privately, enforce bounded timeouts, cap retry backoff with jitter, honor rate-limit delays and distinguish authentication, expiry, transport, response-body, coverage and schema errors. Cache only permitted structured responses with original retrieval/provider-update timestamps; deduplicate fresh/in-flight requests where safe. Never fetch provider images through this transport.

Expose typed operations for paginated fixtures, date queries in `Africa/Kampala`, shared all-live fixtures, unresolved-ID batches up to the verified provider limit, teams/competitions, supported statistics and availability, and fallback prediction payloads. Follow each endpoint's actual pagination contract rather than a universal invented scheme. Return completeness and missing-coverage metadata alongside data.

Normalize stable external identities, home/away teams, competition/season, kickoff, status, verified regulation score when available, source timestamps and quota observations. Unknown values remain unknown. Map extra-time, shootout, postponed, canceled, abandoned and awarded statuses explicitly. A disappeared live fixture is not proof of full time; an extra-time final score is not automatically a regulation score.

Treat third-party logos as approved credential-free HTTPS URL strings only, with metadata for rights review. No downloading, optimization proxy, binary storage or persistent image cache. Expose prediction payloads only to fallback consumers; keep them separate from the primary AI evidence path. Do not implement polling, catalog persistence or publication here.

## Acceptance checks

- Contract tests cover successful pagination, incomplete responses, body-level errors, malformed fields, missing update times and rate-limit/expiry behavior.
- Status/score mapping tests prevent live or extra-time totals from becoming unverified regulation results.
- All outbound paths require a limiter reservation and preserve retrieval/update times independently.
- Tests can use explicitly labeled fixtures; optional live probes require configured credentials and remain bounded/accounted.

## Handoff

Record changed files, official contract references, normalization decisions and local/live check results in `docs/development-progress.md`. Update `docs/implementation-decisions.md` with unverified mappings and coverage questions for prompt 008.
