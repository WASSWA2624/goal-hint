# 131 — Slip builder defaults and reset

## Scope

Use five slips, total odds of 5.00–10.00, and a minimum individual probability
of 75%. Keep individual odds, match counts, automatic market choices and
date/time defaults unchanged. Global Reset restores every default; each dialog
resets only its own fields.

## Implementation

- Keep the domain criteria factory as the source for initialization and resets.
- Distinguish an omitted total-odds maximum from an explicitly blank Any ceiling.
- Keep total odds at two decimal places without floating-point conversion and
  preserve an explicit 0% probability when custom criteria are reopened.
- Keep dialog Apply/Cancel behavior and reset scope consistent across layouts.
- Retain daily Best Slips' existing probability policy independently of the
  custom builder defaults, and use configured minima for range feedback.

## Verification

- All 140 targeted builder, numeric guard, Best Slips, service and joint-model
  tests passed. Full ESLint and TypeScript checks passed; scoped ESLint also
  passed after the final source changes.
- The production fixture built successfully, and the full slip-rendering
  verification passed, including defaults, native GET builds and exact limits.
- All 44 Playwright checks passed across 1440px desktop and 390px mobile:
  initial defaults, global Reset after query loading, each dialog's Reset with
  Apply and Cancel, preservation of unrelated fields, Automatic markets, exact
  decimal formatting, explicit zero probability and blank Any ceilings. Neither
  layout overflowed horizontally.
- The first fixture build timed out while the broad unit suite was running;
  the fixture build succeeded on retry. The broad suite was interrupted after
  an offline database CLI timeout; the isolated retry passed all six CLI tests.
- Browser console entries were limited to the isolated fixture's missing
  session API and service-worker script; form hydration and reset checks passed.
- Unrelated concurrent work, existing stashes and detached worktrees are kept.
