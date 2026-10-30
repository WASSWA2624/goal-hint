# 170 — Aligned desktop slip status

## Scope

Move Share before the slip status in the shared desktop header, leaving the
status immediately before the disclosure arrow and aligned with match statuses.

## Implementation

- Reuse the match layout's status-track width and match its right gutter,
  border and inner padding so header and match badge edges align exactly.
- Share keeps its own action slot and external button, positioned using the
  header's shared gap, status width and end gutter. It never becomes an
  interactive descendant of the native summary.
- Keep the arrow clear of the status and preserve the compact desktop gap.
- Apply the shared geometry to Best Slips, builder, history and static summaries;
  keep mobile and match-row markup/styles unchanged.

## Verification

- Scoped ESLint and project TypeScript passed. The production-component
  acceptance app built successfully with the current shared match badges.
- All 64 browser assertions passed: exact left/right status-badge alignment in
  both themes at 1440/1280/1024px, Share/status/arrow ordering in both disclosure
  states, keyboard expansion/collapse, share image generation and focus return,
  and an independent Share button outside the summary.
- Shared builder cards and cards without Share align with their match statuses.
  The 50-slip limit and full-height blue rail are retained. Mobile rendering at
  390px and 320px keeps its original layout without desktop actions or overflow.
- Visually reviewed the expanded desktop result. No match-row or mobile code
  changes were needed; separate in-progress match edits remain outside this commit.
