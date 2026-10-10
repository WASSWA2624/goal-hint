# 053 Score-distribution markets

**Feature:** Derive every goal-based provider market from an AI-predicted full-time and half-time score distribution.

**Depends on:** [012-ai-predictor.md](012-ai-predictor.md), [027-market-settlement.md](027-market-settlement.md), [052-provider-odds-import.md](052-provider-odds-import.md).

**Source:** [App specification](../app-write-up.md), sections 4, 7 and 8 (version 1.8 approved expansion).

## Prompt

Extend the predictor contract so one AI call returns validated full-time and half-time score distributions per fixture, keeping per-job token and cost budgets. Deterministically derive goal-based markets from them: all over/under lines, half-time and second-half results, HT/FT, exact score, team totals, odd/even, clean sheet, win to nil, Asian and European handicaps, and combinations. Map each to the provider's bet names. Keep the four launch families' existing semantics, locks and history.

Add a settlement rule for every derived market (half-time scores come from the stored result), market-family keys, labels, codes and colours, and per-market performance reporting. Expose the families in the market filter; a market stays hidden until its settlement and labelling tests pass.

## Acceptance checks

- Derived probabilities in each group sum to one where complementary; tie order is deterministic.
- Settlement handles extra time, penalties, abandonment and corrections for every new market.

## Handoff

Required: tick this row in [dev-tracker.md](../dev-tracker.md) only when implementation and checks are complete. Update `docs/development-progress.md` and `docs/implementation-decisions.md`.
