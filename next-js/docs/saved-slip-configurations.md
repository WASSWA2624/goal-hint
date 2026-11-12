# Saved filters

Every signed-in account can keep up to ten named presets, including while access
is expired or subscription sales are closed. The **Saved filters** chooser and
**Manage** button sit at the top of Builder **Filters**. Long names wrap in the
scrollable chooser. Choosing a preset fills the criteria form as a draft.
**Apply Filters** commits the visible values to the next build and updates its
summary. Closing Filters discards the draft. **Reset Filters** restores defaults
in the form and keeps the saved presets available.

**Manage** opens a child dialog with the saved count, preset selection, default
control and **Create**, **Rename**, **Update**, and **Delete** actions. Create and
Update save the values currently entered in the main Filters form. Create and
Rename ask for a name. Update and Delete ask for confirmation. Escape closes
the active dialog and returns focus to its opener. Deleting the applied record
clears its ID and preserves the Builder values.

Names are trimmed, Unicode-normalized and unique per account without case
distinctions. The **Date and time window** displays **From** and **To** in the
form's time zone. Creating or updating a filter saves the continuous
range with its time zone, alongside the markets, outcomes, reuse and limits.
Applying a dated preset uses that saved interval. Older time-only presets use
today's date in the device's time zone with their saved times. The range fits
in the existing saved-configuration parameters.

An optional default fills a fresh builder visit with no query. Explicit query
filters, Reset and the member's edits take precedence over a late default read.
Applying updates the Builder draft and canonical URL with the configuration ID
and clears previous results. Generation requires the explicit **Build slips**
action and entitlement. A hidden configuration ID preserves the selection
through generation.

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
