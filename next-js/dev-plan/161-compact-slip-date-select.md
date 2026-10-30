# 161 — Compact slip date select

## Scope

Replace the Best Slips desktop date-button strip with a select after the status
toggles. Keep Custom range immediately to its right and Reset at the outer edge.

## Implementation

- Retain the existing date presets, query semantics, applied summary and custom
  range dialog; change only their presentation and toolbar order.
- Use a controlled native select with an accessible date label, compact square
  styling and the shared filter palette. Keep all status counts and percentages.
- Preserve Today for valid subscribers and Yesterday for guests/unsubscribed
  users, explicitly confirmed by the user during this update.
- Retain the existing desktop-only date/result controls and the shared mobile
  paginator. Changing dates still resets to page 1 and preserves the status.

## Verification

- Scoped ESLint, standalone TypeScript and the integrated production build passed
  on Node 24.18.1 / npm 11.16.0.
- Browser checks verified dropdown selection/order, Custom date actions,
  subscriber/public defaults, both themes and retained-result transitions.
- At 1024px, very large totals use a bounded horizontal status rail, retaining
  complete labels and keeping the date controls and Reset visible. Focus rings
  remain inset and Reset preserves its outer-edge alignment. Explicit focus
  reveal scrolls only the status rail; all 12 final keyboard checks passed.
