# 166 — Styled slip date options

## Scope

Style the open desktop date-options list to match the already styled trigger.

## Implementation

- Replace the browser-drawn popup with a reusable UI `SelectMenu`, scoped to the
  Best Slips date control so other filters retain their existing presentation.
- Use theme colors, compact padded rows, subtle borders/shadow, a selected
  checkmark and distinct hover/keyboard focus, with subtle corners.
- Preserve the seven presets, confirmed access defaults, Custom date dialog,
  result filters and page-reset behavior.
- Support combobox/listbox semantics, arrow/Home/End navigation, type-ahead,
  Enter/Space selection, Escape, Tab and outside-click dismissal. Keep focus
  on the trigger and scroll only the menu when revealing an active option.

## Verification

- Scoped ESLint and project TypeScript passed on Node 24.18.1.
- All 45 browser checks passed across both themes and 1440/1024px desktop:
  keyboard/mouse/touch selection, disabled Custom range context, the existing
  Custom date dialog, short-viewport scrolling, focus/dismissal and defaults.
