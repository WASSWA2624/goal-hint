# 029 Match detail API

**Feature:** Public match detail and read-only revision retrieval.

**Depends on:** [011-fixture-evidence.md](011-fixture-evidence.md), [019-prediction-history.md](019-prediction-history.md), [027-market-settlement.md](027-market-settlement.md), [028-match-feed-api.md](028-match-feed-api.md)

**Source:** [app-write-up.md](../app-write-up.md) §§2, 4–8, 10–13, 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, repository instructions and public query conventions. Implement `GET /api/matches/:id` with an explicit read-only revision-selection/history contract and a reusable server query service. Reuse existing repositories and safe public serializers.

Resolve canonical fixture identity and return teams, competition, kickoff, status, score, current applicable cycle and a coherent current or locked snapshot. Include complete available probability groups, deterministic selected picks, alternatives, per-family source/fallback reason, publication/generation/evidence/provider times, two to four supported reasons, one uncertainty and approved source links. Missing source update times stay unknown. Return applicable outcomes, void/correction reasons and their timestamps separately from scores. Known fixtures without a forecast remain valid detail responses; unknown fixture IDs return 404.

Expose earlier immutable revisions and old void cycles through bounded, stable history pagination or selection. Validate that a requested revision belongs to the fixture; reject cross-fixture references. A historical read must never move a current/locked pointer, change settlement or schedule a refresh. Preserve the last prediction/reason for void cycles even without a locked set. Mark snapshot identity and historical status explicitly so clients cannot mistake old alternatives for the settled forecast.

Include monotonic fixture-data versions and cycle/run/revision references for client reconciliation. Return canonical route identity/slug data for later page routing without making slug changes alter fixture identity. Keep current probabilities, source and explanation from one revision, including mixed-family provenance. Filter evidence to permitted original summaries/attribution and safe HTTPS links; never expose model prompts, internal reasoning, private logs or raw provider responses.

All reads remain anonymous, bounded and stored-data only. Reuse error handling/rate-limit policy without introducing authentication cookies. Leave cache installation and full detail-page rendering to their own prompts.

## Acceptance checks

- Cover open, locked, unavailable, void, corrected and historical revision responses, including unknown IDs and cross-fixture revision requests.
- Prove history reads have no writes or outbound provider/AI calls and reveal only approved visitor-facing fields.
- Verify one consistent revision per snapshot and stable paginated history under new publication.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Record changed files, detail/history/security checks and blockers in `docs/development-progress.md`; document DTO and revision-query contracts in `docs/implementation-decisions.md`.
