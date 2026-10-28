# Apply Minimal rules mobile slip headers

## Scope

- Apply selected option 09 to production mobile slip headers.
- Increase horizontal padding around all header text, as clarified by the user.
- Keep compact one-row metadata and fixed-width status cells.
- Preserve Clean ledger match rows and existing desktop headers.

## Implementation

- Share production header markup/styles with the comparison; keep sample variant
  styling in the review only.
- Select the new header in the shared Clean ledger disclosure, including locked
  aggregate summaries, static headers and native collapsible headers.
- Reuse the existing outcome precedence through a lightweight domain helper;
  use only normalized saved results or selection-matched current states.
- Keep the probability calculation and its accessible explanation unchanged.

## Verification

- Focused ESLint and 32 domain/card/message tests passed, including aggregate
  results and selection-bound current-state checks.
- Isolated production rendering and TypeScript passed against a source snapshot
  of main plus only this task's changes. The first workspace build encountered
  concurrent Match/desktop type errors; those files were preserved.
- All SSR rendering assertions passed for full/locked Best slips, generated
  slips, stored results, privacy boundaries, original values and match-row order.
- Browser checks passed 48 combinations: 320/375/430/768px, both themes and six
  production contexts. Verified 28px headers, text bounds without overlap, 3px
  cell padding, fixed separators and equal 50px statuses. Slip 100, 999999.99 odds,
  100.0% probability and eight matches fit at 320px. Native keyboard disclosure
  and unchanged desktop headers at 1024/1440px passed. Reviewed light/dark images.
- At 200% text the header itself remains within the viewport and scrolls locally
  (verified independently at 320px). The full-page smoke test exposed existing
  app-bar/navigation overflow at that text size, outside this header change.
- Clean ledger selection source/styles have no changes in this revision.
- Preserve concurrent desktop refresh work, linked worktrees and Git stashes;
  commit only this task's changes and push main.
