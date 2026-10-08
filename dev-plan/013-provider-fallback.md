# 013 Validated provider fallback

**Feature:** Resolve complete forecast candidates with AI priority and supported API-Football fallback.

**Depends on:** [007 API-Football adapter](007-api-football-adapter.md), [008 Football provider trial](008-football-provider-trial.md), [012 Primary AI predictor](012-ai-predictor.md).

**Source:** [App specification](../app-write-up.md), sections 4–8 and 10–11.

## Prompt

Read `dev-plan/000-index.md`, the source sections, trial evidence and existing probability contracts. Implement the fallback adapter and candidate-resolution service for one eligible refresh. Consume the AI result from prompt 012, attempting API-Football only for missing/invalid families or AI failure, timeout, insufficient evidence or exhausted budget. Use the shared limiter, remaining time allowance and job-scoped structured-response cache; never fetch fallback directly from a public read request.

Require the same fixture/cycle context and regulation-time basis. Enforce the documented source-specific freshness and unknown-update-time policy. Store provider retrieval time separately from its source update/generation time; retrieving an unchanged forecast does not make it newly generated. A pick alone, unsupported field or incomplete probability group stays unavailable.

Match result and derived double chance form one source group: retain valid AI result probabilities together, or use a complete validated provider result distribution and derive double chance. Never mix AI home values with provider draw/away values. Total-goals fallback requires the explicit 2.5 line with complementary probabilities. BTTS needs explicit probabilities or the trial's documented validated derivation. Do not infer values from endpoint availability, convert odds implicitly, average sources or choose whichever source has a larger percentage.

Preserve valid AI groups ahead of conflicting fallback groups using the shared deterministic consistency policy. Omit unsupported/conflicting groups with an auditable reason. Return one complete candidate snapshot: each available family includes selected pick, full probabilities, source, fallback reason, source timestamps and provenance; unavailable families remain explicitly absent/unavailable. If no group is valid, return a retain-previous-or-unavailable instruction for later publication logic. Do not merge old published markets into a new partial snapshot or mutate stored revisions here.

Produce concise fallback explanations that accurately describe the provider basis and expose real source links only. Exact-score output remains disabled unless the recorded optional scope and distribution validation permit it.

## Acceptance checks

- Tests cover valid AI priority, all failure triggers, partial fallback, unsupported markets, stale/unknown provider times and budget exhaustion.
- Source-group and conflict tests prevent mixed distributions and manufactured values.
- Partial candidates drop absent groups; zero valid groups produce the retention signal without fake publication.
- Repeated fallback access within one job reuses permitted data with original provenance.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Record changed files, market-support evidence and scenario-test results in `docs/development-progress.md`. Update `docs/implementation-decisions.md` with unresolved provider/freshness issues; do not report unavailable families as supported.
