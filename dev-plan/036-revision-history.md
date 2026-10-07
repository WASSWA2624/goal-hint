# 036 Read-only revision history

**Feature:** Inspect previous prediction revisions within the canonical match page.

**Depends on:** [019-prediction-history.md](019-prediction-history.md), [029-match-detail-api.md](029-match-detail-api.md), [035-match-detail-page.md](035-match-detail-page.md).

**Source:** [App specification](../app-write-up.md), sections 2, 4, 5, 7–10 and 12.

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing history/detail contracts. Implement an accessible expandable history view within the match detail page. List ordered publications with run date, cycle, source, actual publication time and current/locked/superseded status where applicable. Use persisted run/cycle/revision ordering; never infer chronology from lexical opaque IDs or worker completion order.

Allow a visitor to inspect a complete previous snapshot, including its market probabilities, selected picks, explanations, sources and evidence timestamps. Clearly identify that it is historical and retain the current or locked summary as the primary match content. A partial historical snapshot must continue to show its missing markets as unavailable. Old postponed/void cycles remain distinct, with their reasons and schedule history where already exposed by the API. Do not add extra feed cards or duplicate headline predictions for revisions or old cycles.

This is strictly a read feature: selecting a revision cannot change current/locked references, settlement, results or performance cohorts. If a revision deep link is supported, validate that it belongs to the requested fixture and show a safe not-found response for invalid combinations. Add the minimal canonical-match and revision-noindex metadata needed here, reusing any existing helpers. Prompt 042 will consolidate site-wide SEO; this feature must not depend on it already existing.

Use reusable disclosure controls with visible focus, an accessible expanded state and predictable keyboard navigation. Render or fetch only the public fields, with bounded pagination if a fixture has many revisions. Preserve existing content on a history-load failure and provide an inline retry.

## Acceptance checks

- Inspect older, current, locked, partial and void-cycle revisions without mutating database references or performance counts.
- Verify one feed card per fixture remains unchanged and source/timestamp provenance is accurate.
- Test cross-fixture revision IDs, missing revisions, keyboard disclosure and failed history retrieval.
- Verify public history never exposes internal model prompts, logs or raw private evidence.

## Handoff

Update `docs/development-progress.md` with changed files, checks/results and blockers. Record any history pagination or deep-link decisions in `docs/implementation-decisions.md`.
