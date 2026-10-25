# Owner profit foundation

This unfinished B06 foundation preserves the owner-entered cost schema, pure EAT
month accounting and validated input contracts. It does not provide a profit
service, write API, page, production records or measured net-profit report.

`20261025183256_owner_profit` creates cost lines, immutable amount entries with
void markers and month-close snapshots. Its grants restrict updates to intended
columns. The shared revenue predicates preserve the Overview's existing cash
accounting without counting credit purchases twice.

Before exposing this feature, implement account-independent owner authorization,
month locking, stale-total checks, bounded reads, privacy validation for free
text, audit events and genuine database acceptance. Add the UI and rendered
acceptance then; B06 remains partial. Parser and arithmetic checks are in
`tests/owner-profit.test.mjs`.
