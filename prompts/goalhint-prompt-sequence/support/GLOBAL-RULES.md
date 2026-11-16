# Global rules for every GoalHint prompt

This is shared context, not an additional implementation task. Read it before each
numbered prompt and keep it available to the coding agent.

## Source boundaries — original wording

Improve the **existing GoalHint Next.js application**, not a replacement application. Implement the following phases in order: audit → data contracts → imports and workers → odds → predictions → publication → interface → testing and rollout.

GoalHint is a **prediction and analysis platform**, not a staking platform. Maximize evidence-supported prediction coverage and prioritize estimated win probability over odds. Do not promise perfect predictions, guaranteed profits, or data the provider does not supply.

Preserve the existing stack, routes, authentication, subscription controls, unrelated features, and established visual design. Inspect the repository before choosing infrastructure or changing schemas. Reuse and repair existing components and workers instead of creating competing implementations. Do not disable paid access as part of this work.

**Implementation defaults:** Operational intervals, retry settings, and layout measurements below are proposed implementation defaults, not claims about existing behavior. Make them named configuration values with these defaults. Provider limits and actual account permissions take precedence. Document any necessary deviation with evidence; do not silently omit requirements.

## Shared architecture — original wording

All four logical workers must share the same provider client, request scheduler, cache, quota accounting, and durable job infrastructure.

These are four **logical responsibilities**, not a requirement for four separate servers. Reuse the existing queue/runtime where appropriate.

## Verification — original wording

Implement automated tests plus manual responsive checks covering at least:

Run tests with mocked/replayed provider responses before spending production quota. Measure proposed daily/minute request demand using actual fixture volumes and the configured plan. Report infeasible freshness targets instead of silently exhausting quota.

These references support provider mechanics and modeling methods. The application design, scheduling defaults, validation policy, and acceptance criteria above are implementation requirements—not provider guarantees. Recheck the current documentation and account access during implementation.

## Execution protocol for this split

Run `001` through `061` in ascending order. Complete only the current prompt's
focused task and its related checks. Dependency lists identify important earlier
handoffs; they are not an instruction to skip the intervening prompts. Continue
through the complete implementation sequence after the audit.

Inspect the real repository and reuse its existing abstractions. Names of files,
functions, services, configuration keys and migrations must come from that
inspection; none are assumed by this package. Implementation work must produce
actual code/configuration and focused tests where applicable, not just a proposal.
Audit, inventory, measurement and reporting tasks produce their specified evidence
artifacts. Do not introduce a second implementation of an existing responsibility.

Use named configuration values for the source defaults. Provider access and
verified limits take precedence; record the evidence for any necessary deviation.
Do not silently substitute different schedules, batch sizes, probability logic,
market definitions, ranking rules or UI measurements.

Each task includes original source excerpts plus task-specific organization and
acceptance checks. References to original Section 2, Section 6 or another section
mean the bundled [original prompt](source/goalhint-improvement-prompt.md), not a
new section number in the split files. R1–R11 refer to
[REFERENCES.md](REFERENCES.md). Resolve actual discrepancies with source evidence;
do not silently repair, invent or expand requirements.

Data-contract work, particularly the market registry, appears before the odds and
model consumers that depend on it. The four worker responsibilities are scaffolded
before every downstream consumer is complete: keep unfinished production paths
behind the existing/new appropriate feature gates, test explicit interfaces, and
wire the final consumers in the named later tasks. Never fill those seams with fake
predictions, fabricated prices or a competing worker. The full suite and rollout
checks are required before global enablement.

The repository, production credentials, logs, screenshots and complete market files
mentioned by the source are not included in this package. Use supplied/accessibly
verified material during implementation; report missing evidence or ask for the
needed asset rather than claiming it was inspected. Screenshot counts are symptoms
to reconcile, not constants to enforce. Reference URLs are carried over from the
source, not independently verified by this splitting task.

## Finish each prompt with a handoff

Report the actual changed files or produced artifacts, focused test/check commands
and results, remaining limitations/blockers, and inputs needed by the next task.
Record configuration/migration changes and verified deviations so task 061 can
compile the final report. Do not mark an implementation complete when it is only
planned or blocked. Distinguish implementation, functional testing, measured model
validation, deployment and observed live behavior.

A task-specific test can run when its code is implemented; the later testing prompts
consolidate and extend acceptance coverage rather than excusing untested early work.
Use mocks/replays before spending production quota. A passing software test does
not establish improved forecasting accuracy.
