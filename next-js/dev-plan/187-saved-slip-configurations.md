# 187 — Saved Slip Builder configurations

Add account-owned configurations to the existing builder and subscriber account
page. Reuse strict criteria parsing and serialization, member authorization and
shared UI controls. Permit management even when subscription access has expired.

Persist up to ten named configurations per account with at most one optional
default. Support save, load, rename, replace filters, default selection/removal
and deletion. Serialize mutations under the account lock, recheck the session,
and reject stale revisions so another device's changes are not overwritten.
Remove private configurations on account erasure/deletion.

Keep the saved absolute dates explicit. A fresh builder visit may apply its
default, but loading any configuration must omit `build=1`, clear old results
and populate all controls without generating. Preserve manual market outcomes,
reuse, unrestricted ranges and probability precision. Reset uses built-in filters.

Ship an additive migration, MariaDB overlay and application grants. Verify
ownership, limits/concurrency, default uniqueness, persistence, stale requests,
expired sessions, hostile bodies, and browser/mobile CRUD and no-generation
flows. Run schema validation, lint, type checking, relevant tests and build.
Record actual results and deployment limitations before committing/pushing main.

## Completed verification

- Prisma client generation and schema validation passed. MySQL and MariaDB
  migrations, application grants and stable SQL line endings are included.
- Full lint and final changed-file lint passed. `npm run build` passed, including
  strict TypeScript checking, route generation and the offline asset manifest.
- The final focused run passed **233 tests**, with **one explicit skip** for
  the new real-MySQL integration test. Two migration/checksum tests passed.
  An earlier broader run also attempted two existing subscriber MySQL tests;
  those failed to start because a genuine MySQL test-server binary is absent.
  No database test was redirected to an installed service or live database.
- Isolated production rendering passed builder/account SSR, authenticated
  collection access, anonymous refusal and initial idle-generation checks.
- Playwright browser checks passed save, dropdown load, filter replacement,
  rename/delete, default switching/removal, fresh-page default application,
  dashboard editing and independent-context persistence. Loading after an
  explicit build cleared results and omitted `build=1`. Checks also passed
  Reset precedence, a delayed default versus an interactive edit, the ten-item
  UI limit and freeing a slot by deletion. Desktop and 375px phone layouts were
  inspected in light/dark themes without horizontal overflow.

The browser fixture uses the real handlers/service with synthetic in-memory
storage. Its first duplicate TypeScript check exceeded its 300-second budget;
the fixture now skips that duplicate check, while the complete production app
passed its own strict build. The fixture omits the production service worker,
which accounts for its service-worker script 404 messages. Browser screenshots
and command logs are ignored under `output/`.

Deployment still requires applying the migration and application grants.
Real MySQL/MariaDB concurrency, physical-device behavior and production
cross-device persistence were not exercised in this environment. No live
database, messaging, payment or authentication policy was changed.
