# 008 Football provider trial

**Feature:** Produce reproducible evidence of provider suitability and unresolved limitations.

**Depends on:** [005 Regulation-time market domain](005-market-domain.md), [007 API-Football adapter](007-api-football-adapter.md).

**Source:** [App specification](../app-write-up.md), sections 4, 6–8, 11 and 14–15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, implementation decisions and current adapter. Implement a bounded, resumable trial command and evidence report format for the selected direct API-Football Mega plan. The trial is an internal development tool, not a public dashboard. Use the shared adapter/limiter for every request and clearly separate recorded real responses from synthetic contract fixtures.

Resolve the initial candidate competitions and trial request allowance from existing operator decisions before live execution. Sample representative league, cup, low-coverage, postponed, cross-midnight, extra-time and shootout fixtures where real data is available. Record pagination completeness, canonical-ID stability across seasons/competitions, aliases, field coverage, update times, status transitions and whether regulation scores can be independently verified.

Assess fallback per market: complete match-result probabilities, derivable double chance, explicit 2.5-goal complementary probabilities and BTTS probabilities or a documented validated derivation. Verify pre-match availability, freshness, unknown-update-time handling and unsupported groups. Picks without complete usable probabilities must fail the contract. Do not infer all four families from endpoint access.

Record actual account plan limits, quota-header/reset behavior, subscription expiry and the payable total including taxes/payment charges against US$45. Evidence may come from authorized existing account records and official terms; do not purchase, renew, change plans or fabricate checkout confirmation. Verify data/prediction redistribution and remote-logo display rights, credential-free HTTPS URLs and separate media-host restrictions. Missing legal/account evidence remains pending.

Generate a concise report listing each requirement, tested fixture or source, timestamp, result, limitation and follow-up. Feed verified mappings and freshness/coverage decisions back into the register. Permit offline report generation and contract checks without keys, but mark live provider suitability incomplete until real evidence exists. This feature validates data/provider assumptions; AI quality is evaluated in prompt 014.

## Acceptance checks

- The trial resumes safely and all requests/retries consume shared capacity.
- Reports distinguish confirmed, failed and untested requirements, including absent fields and incomplete imports.
- Representative status/score and fallback cases exercise shared validators rather than duplicate rules.
- No unsupported market, permission, budget or account check is reported as passed from synthetic data.

## Handoff

Record commands, report paths, evidence and blockers in `docs/development-progress.md`; update `docs/implementation-decisions.md`. State which findings permit catalog implementation and which still block live operations or launch.
