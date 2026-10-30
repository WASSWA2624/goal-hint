# 169 — Shared match progress status

## Scope

- Show one status on every match card: Upcoming before kickoff, Live during play
  (including half-time), and the recorded prediction result after completion.
- Keep postponed/unknown observations, saved results and anonymous offline views
  truthful. Do not change prediction settlement, authorization or stored facts.
- Reuse one status component across the Matches feed, desktop slips, Slip Builder
  and compact slip variants. Pass the existing refreshed original-selection-bound
  states through mobile slip rows as well.
- Reuse the slip header's glowing dot, including its reduced-motion fallback.
- Enlarge status text in centered, equal-width badges with a faint semantic fill
  and fine border, reusing the same badge base as the entire slip's status.
- Keep supplied live minutes and phases beside the score.

## Verification

- TypeScript, scoped ESLint, Python syntax and whitespace checks passed.
- All 44 focused match-card, slip-card, slip-status and settlement tests passed.
  The original-selection state suite passed three checks and retained one
  pre-existing failure: its free-viewer access case expects an unreleased slip
  where the unchanged completed-only gate correctly returns an empty list.
- Both isolated production fixtures built successfully. Match-card SSR passed
  all 13 examples; desktop-slip SSR passed all 12 scenarios. Rendering checks
  now follow the shared wrapper, numbered kickoff and completed-only access.
- Playwright checked 32 combinations across Matches, slips, Slip Builder,
  Best Slips and saved results in both themes at 1440/1024px, plus responsive
  routes at 390/320px. Badges retain equal 5.75rem widths, centered 13px text,
  faint backgrounds, 1px borders and no horizontal page overflow. Only live
  fixtures have dots. Reduced motion retains a still halo for both live phases.
- Visually reviewed desktop Slip Builder, mobile Matches and dark mobile Slip
  Builder captures. Synthetic-logo DNS failures and the fixture's absent service
  worker are isolated acceptance-environment limitations.
