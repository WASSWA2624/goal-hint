# 146 — Admin Audit filters and record navigation

## Scope

- Reuse floating fields for Category, Event and Date; keep Category and Event on one row.
- Add last-hour, three-month and six-month periods alongside existing day presets and Any date.
- Use a custom date-range dialog with validated, inclusive dates in East Africa Time.
- Apply event and date criteria before the existing newest-100 database limit, retaining bounded reads and CSV export of all matching loaded entries.
- Show Audit at the left of the content header and retain Export CSV at the right.
- Add First and Last pagination controls without changing the result scrollbar.
- Resolve event actions to the correct payment, plan, subscriber or settings destination.

## Verification

- Passed 27 focused Audit and payment-review tests, including inclusive EAT boundaries, month clamping, invalid ranges, bounded historical queries, exact record links and the existing ordinary payment-queue contract.
- A clean snapshot containing only this task's changes passed full ESLint with zero warnings and the full TypeScript check.
- The production rendering fixture passed historical date/action queries and exact-payment review assertions.
- Real browser checks passed at desktop, 390px and 320px widths: floating labels, the Category/Event row, all date presets, custom-range validation/apply/cancel/edit/Escape, First/Last pagination, CSV across all loaded pages and exact payment navigation. No horizontal overflow or browser JavaScript errors were observed.
- The broader admin-route suite has an existing phone-form assertion mismatch in unchanged `code-tools.tsx`: the test expects a literal `method="post"`, while the existing demo form chooses GET or POST. Both the test and source were verified identical to the starting commit; the Audit update leaves them intact.

## Preserved behavior

The result window remains bounded to the newest 100 matching event/date records. Search, category, pagination and CSV operate on that loaded window; choosing a historical date range queries that range before applying the bound. Existing unrelated working changes and Git stashes remain untouched.
