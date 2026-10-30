# 163 — Slip loading and date-control polish

## Scope

Refine unseen-range and first-build loading, and distinguish date controls from
status toggles while keeping the compact desktop toolbar.

## Implementation

- Add a reusable four-header slip skeleton with a gentle two-second shimmer,
  one accessible loading message and steady reduced-motion styling.
- Use it only when no usable view is available; background reads keep existing
  results visible. Reuse it for a first pending Builder result.
- Separate date controls with a slim divider and responsive horizontal spacing.
  Give the select and Custom date button a subtle 4px radius, as requested.
- Match native option text to the desktop control's font size and preserve
  keyboard selection, shared filter chrome and Custom range dialog behavior.
- Rename the button from Custom to Custom date; keep its accessible dialog label.

## Verification

- Scoped ESLint, TypeScript and the integrated production build passed.
- All eight focused skeleton checks passed, including first Builder loading,
  unseen ranges, reduced motion and preserved background results. The 24 cache
  transition checks passed with failures/Retry, races and access revocation.
- Desktop screenshots were inspected at 1440px light and 1024px dark, including
  the loading list, formatted headers and date-control spacing. Large-count
  narrow layouts retain date/Custom date/Reset beside a scrollable status group.
