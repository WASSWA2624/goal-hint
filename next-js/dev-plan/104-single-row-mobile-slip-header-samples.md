# Single-row mobile slip header samples

## Scope

- Create ten review-only mobile header alternatives at `/en/slips/designs/headers`.
- Keep slip number, total odds, average match probability, selection count and
  Won/Lost/Pending status on one horizontal row. Retain Void truthfully.
- Keep the expanded Clean ledger match rows unchanged; do not apply a header
  to production before the owner chooses a sample.

## Implementation

- Use one semantic native disclosure and scoped header styles across ten
  visual variants. Retain a 44px touch target and full accessible field names.
- Reuse the exact production `CleanLedgerSelection` and structural card styles.
- Use coherent illustrative pending/won/lost/void records and scenarios for eight
  selections, larger slip numbers/odds and long team names.
- Include collapsed, expanded and status-only examples; offer phone widths,
  light/dark appearance and individual inspection.
- Keep numeric values visible without ellipsis. Narrow frames use compact labels.

## Verification

- Focused ESLint, Python compilation and 21 existing snapshot/prediction/timezone
  tests passed. Optimized application and isolated review builds passed with
  TypeScript validation.
- All 42 phone-width/theme/scenario combinations passed across all ten designs:
  each header is one row, at least 44px high, with visible complete numeric values
  and status, no field/document overflow and no JavaScript runtime errors.
- Native Enter/Space disclosures, individual inspection and return to all ten
  passed. Final 200% text checks retain one scrollable header row, reachable
  status and complete numbers without overflowing the document.
- Screenshots were visually inspected. Production match-row, slip-table and
  disclosure source files remain unchanged; expanded samples reuse them directly.
- The dedicated `--view mobile-headers` preview stays separate from application
  builds. Preserve concurrent work, detached worktrees and Git stashes; commit
  only intended changes and push main.
