# Saved Slip Builder configurations

Every signed-in account can keep up to ten named filter configurations, including
while access is expired or subscription sales are closed. The builder offers
**Save current filters**, a load dropdown and **Update selected**.
Desktop shows only these three controls, styled with the existing filter toolbar.
Counts, management controls and explanatory text stay on the account page and
phone layout. The account page's **Saved Slip Builder configurations** panel
provides rename, default and delete controls; **Edit filters in builder** loads the selected filters for editing
and updating. Deleting a configuration does not change an open builder draft.

Names are trimmed, Unicode-normalized and unique per account without case
distinctions. A configuration includes time bounds, market selections/outcomes,
reuse and unrestricted ranges. Dates are excluded: loading uses today's date
in the reporting timezone, Africa/Kampala, for both date bounds. The saved time
range is preserved; blank times default to the entire day, 00:00–23:59.
Older dated configurations are normalized on read and load for today as well;
the next filter update writes the date-free format. No additional migration is
needed.

An optional default fills a fresh builder visit with no query. Explicit query
filters and Reset take precedence. A slow default read does not overwrite filters
the member has started editing. Loading navigates to canonical filters with the
configuration ID and **without `build=1`**. Previous results are cleared by the route;
generation still requires the existing explicit Build slips action and entitlement.
Configuration controls sit outside the generation form, with an associated
selection control to preserve the selection through generation.

`GET /api/account/slip-configurations` returns the private account collection.
`POST` accepts strict `create`, `rename`, `update`, `default` and `delete` actions.
Existing-record writes require an ID and revision. These are account operations,
not subscription grants. The service rechecks the authenticated, unexpired session,
phone ownership, blocked/erased state and account identity under the member row lock.
Every query/mutation is owner-scoped; guessed IDs reveal no other account data.
Responses are `no-store`, same-origin and excluded from indexing/analytics.

The row lock serializes the ten-item cap, default changes and erasure across web
processes/devices. A nullable default marker plus a database composite unique index
permits zero or one default and any number of non-defaults. Each edit increments
the revision, including records that lose default status. A stale device receives
`409 conflict` and must review refreshed data. Focus/visibility refreshes update
the collection without applying another default or overwriting an edit dialog.
Configurations belong to the account rather than cookies/browser storage and
survive sign-out and later logins. Erasure removes them; permanent deletion cascades.

## Deployment

Apply `prisma/migrations/20261031040514_saved_slip_configurations/migration.sql`
with the migration role before deploying this feature. MariaDB 11.4 uses the
matching `prisma/mariadb/20261031040514_saved_slip_configurations.sql` overlay;
it verifies prerequisites and records the exact migration checksum. Stop after
any DDL error and inspect partial state rather than retrying an import blindly.
Apply the application-role grants in
[slip-configuration-grants.sql](deployment/slip-configuration-grants.sql).
The normal app needs only SELECT/INSERT/UPDATE/DELETE on this new table, with
its existing member-table permissions. A missing migration/grant fails closed
with a retriable unavailable state; there is no browser-only persistence fallback.

## Verification

Unit/service/HTTP tests cover filter fidelity, load URLs without generation,
ownership, expired/revoked sessions, cap/default concurrency, stale revisions,
duplicate names, cross-device service reads and malformed/cross-site requests.
The isolated MySQL integration test covers actual row locking, indexes/checks
and account cascade; it explicitly skips without a genuine test-server binary.
The implementation plan records the final build and browser verification results.
