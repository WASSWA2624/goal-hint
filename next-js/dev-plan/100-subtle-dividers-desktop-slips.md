# Apply desktop Subtle dividers

## Scope

- Apply selected desktop design 09 to Best slips, slip builder and shared slip
  history, including aggregate-only locked summaries.
- Keep one slim native header and one row per match, initially collapsed.
- Centre intrinsic short team-name pairs in their track; retain shrinking,
  ellipsis, full-text tooltips, flags and text-height crests for long names.
- Preserve the separately selected mobile layout and other in-progress work.

## Implementation

- Promote the reviewed desktop row, tooltip and common layout into reusable
  production components, and reuse them from the review surface.
- Select the desktop presentation at the existing 64rem breakpoint using the
  existing responsive external-store hook, keeping one active row tree.
- Preserve original snapshots, aggregate ranking, entitlement gating, saved
  outcomes and regulation scores. Add canonical match-analysis links on vs,
  separate from the full-name tooltip controls.
- Keep stashes and detached worktrees intact; commit only this task's changes.

## Verification

- Optimized application build, including TypeScript and the offline manifest,
  passes on the integrated main checkout.
- Full ESLint and 44 focused snapshot, prediction-label, Best slips, published
  slip and country-flag unit cases pass.
- Seven isolated production SSR cases pass, covering original odds, probability,
  EAT midnight rollover, canonical analysis URLs, saved outcomes and scores, and
  aggregate-only locked summaries through the actual BestSlips component.
- Thirty browser cases pass at 1024, 1280 and 1600px in light and dark themes:
  native collapsed defaults, Enter/Space controls, centred short pairs, no field
  overlap or page overflow, one selection tree, tooltips and analysis targets.
- Four additional browser cases pass for actual BestSlips guest/member locked
  summaries in both themes, mobile Clean ledger fallback and collapsed reloads.
- JavaScript-disabled content stays readable; delayed desktop hydration does not
  flash expanded content. Numeric stress values 1000.00 and >99.9% fit.
- Detached worktrees and both existing stashes are preserved.
