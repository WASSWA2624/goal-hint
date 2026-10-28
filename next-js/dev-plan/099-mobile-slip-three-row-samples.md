# Compact mobile slip samples

## Scope

- Offer ten review-only mobile designs at `/en/slips/designs` before selecting a
  shared production layout.
- Keep the existing collapsed disclosure presentation, with less vertical
  padding and a 44px touch target.
- First row: `28-Oct`, 12-hour time and AM/PM on the left; league crest and short
  name, then country flag and code on the right. Times use Africa/Kampala (EAT).
- Second row: home name, home crest, `VS`, away crest, away name. Logos match
  adjacent text height; common short names keep mobile rows compact.
- Third row: abbreviated market, prediction, odds and individual probability.
- Keep every candidate square and use theme tokens, shared snapshot/prediction
  helpers, bundled flags and generic local sample crests.

## Review

- Compare the same records in ten numbered options with both collapsed and
  expanded examples. Inspect any option independently.
- Support Best slips and builder labels, light/dark appearance, widths of
  320/375/430/768px, long names, eight selections and saved results.
- Keep the selected production layout pending the owner's choice.

## Verification

- Full ESLint, TypeScript and optimized production build passed.
- Existing slip-card, slip-builder, prediction-label and team-name suites:
  86 tests passed.
- Browser verification passed all 32 combinations of 320/375/430/768px,
  light/dark themes and typical/long-name/eight-selection/settled records.
  All ten options preserve row/field/crest order and text-height logos with
  no document or field overflow and no runtime errors.
- Confirmed 44px disclosures, Enter/Space toggles, Best slips/builder labels,
  individual inspection and return to all ten. Typical match rows measure
  61–79px, depending on the design. Screenshots were visually inspected.
- Existing desktop work was committed separately during implementation;
  detached worktrees and both existing Git stashes remain intact.
