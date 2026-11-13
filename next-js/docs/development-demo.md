# Development football demo

By default, `npm run dev` starts the regular Next application with synthetic
football data and its own persistent local MySQL database. Install the repository's pinned
Node/npm versions, Python 3.11+, and genuine MySQL 8.4+ first. The launcher finds
MySQL on PATH, a standard Windows installation, or the portable installation in
`%LOCALAPPDATA%/GoalHint/mysql-*/`. Alternatively set
`GOAL_HINT_DEMO_MYSQL_BINARY` to the full `mysqld` executable path.

```sh
npm ci
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Development uses the pinned Next.js version's default Turbopack compiler in both
demo and live modes. This reduces cold route compilation and compiler memory;
normal hot reload, environment restarts and authorization remain unchanged.
Use `npm run dev -- --webpack` (or `npm run dev:live -- --webpack`) for the explicit
Webpack fallback. The earlier instrumentation hang was not reproduced in the
November audit's actual-application checks; see [measurements and qualification](reports/ui-performance-287.md).
First visits still compile development routes. Keep builds and other expensive
verification sequential on memory-constrained machines; production response times
are a separate measurement from development compilation.

The launcher checks Next.js and loads Prisma's configuration dependencies before
starting or replacing any development services. If an interrupted or incomplete
install leaves packages such as `effect` missing, restore the lockfile's full
dependency tree with `npm ci --include=dev` and retry. This also runs the normal
postinstall client generation; no dependency version changes are needed.

The launcher applies the ordinary migrations and prepares the football catalog,
all fixture dates, and rich records for the default pages: today through the next
30 days for the slip builder, plus the preceding 29 days for performance/history.
First preparation takes substantial time; one status line is replaced by a
verified coverage summary before the web server reports ready. Redirected logs
contain just that summary; failures retain their detailed diagnostics.
This also prepares original-publication prices and 30 days
of editorial/saved slip examples for the default history page. Later starts reuse
the stored records. Route bundles and development reloads share preparation state
for the same database runtime, including pending dates and recent observations,
so navigating between pages does not repeat catalog initialization.
Startup also warms the default monthly performance view;
this full validated aggregation can take several minutes. Development performance
responses retain a one-hour snapshot with its original observation time, so the
initial report validation leaves enough time to browse the prepared pages.
Historical corrections, catalog updates and permission changes invalidate it;
today's live progress continues through the normal feed and detail refreshes.
Production performance cache and transaction budgets remain unchanged.
Startup also validates the default Matches summaries for both the page's
predictions-only view and the unrestricted API view before opening the web
server. Equivalent resolved SQL scopes warm only once. Their audited count
batches remain reusable for up to six hours, with date and catalog generation
checks invalidating corrections. Cards and prices keep their ordinary refresh
and expiry rules; historical summaries load separately from navigation.
The launcher starts its own loopback MySQL
process on an available port; it never connects to an installed MySQL service.
The private database lives in ignored `.goal-hint/development-demo/mysql`.
Ctrl+C stops the owned server and preserves its data for the next start.
Running `npm run dev` again replaces the previous development instance and
reclaims the requested web port, including another process listening on that
port. The default is 3000; `--port`/`-p` overrides `PORT`. Next receives an explicit
port and does not silently move to another. For example:

```sh
npm run dev -- --port 3000
```

The restart verifies process creation identities and the owned MySQL data
directory before shutdown. It preserves the database files and installed MySQL
services. Port-binding races retry the web server without repeating preparation.
Only one launcher can own this directory at a time. Preparation and verification
commands retain exclusive access and do not replace a running app. A process
owned by another system account may require a terminal with permission to stop
it; the launcher reports that failure instead of selecting a different port.
Provider credentials and database targets remain excluded from this demo process.
The existing private administrator configuration is retained as described below.

Use `npm run dev:live` to use the existing configured development services. This
explicit opt-out preserves their existing configuration and authorization rules.
`GOAL_HINT_DEMO=false npm run dev` is equivalent on shells supporting that syntax.
Production and tests never select the development demo.

## Local API-Football snapshot

From `next-js/`, run `python scripts/development.py --prepare-local-football`
to start a separate loopback MySQL instance and apply the application migrations.
Keep the command running during import and database verification. Its ignored
`.goal-hint/local-football-2026-11/target.env` identifies the listener and owned
data directory for the importer. This preparation can run alongside the demo.

From another terminal, download and load the November 2026 snapshot.

```sh
node --conditions=react-server --env-file=.env.development --env-file=.env.operations --env-file=.goal-hint/local-football-2026-11/target.env scripts/fetch-football-snapshot.mjs 2026-11-01 2026-11-30 2026-11-11
node --conditions=react-server --env-file=.goal-hint/local-football-2026-11/target.env scripts/import-local-football.mjs .goal-hint/real-football-import/2026-11-01_2026-11-30/fixtures.ndjson 2026-11-01 2026-11-30 2026-11-11
```

The downloader saves completed request pages in the ignored snapshot directory.
The importer uses committed date receipts to resume the same snapshot.

After verifying the imported fixtures, create the empty file
`.goal-hint/local-football-2026-11/active` and run `npm run dev` to serve the
stored snapshot. The launcher reads its competition IDs from the imported
fixtures and uses the usual private administrator configuration.

The local `.goal-hint/local-football-2026-11/live` marker starts the football
worker with the web app. The worker verifies the owned MySQL listener, uses
the configured API-Football account, and stops with the launcher.
It refreshes the schedule and results, collects match details in fixture
batches, and keeps pre-match and in-play prices separate. Bookmaker 8 is the
local pre-match default when `GOAL_HINT_ODDS_BOOKMAKER_ID` is unset. Use
`npm run live:usage -- --watch` in another terminal to monitor the provider
day. Remove the `live` marker and restart development to browse the saved
snapshot offline.

With the owned snapshot running, `npm run history:backfill -- --requests 100`
loads finished results in season order, newest first. The importer reuses its
saved competition catalog and includes verified league identities discovered
there. Within each season, leagues with more upcoming fixtures run first. The
optional `--competition <id>` limits a batch to one known league
and `--oldest-season <year>` stops it at a specific season. A regular
run uses at most six requests by default, including season discovery. Run the
same command again to resume. Completed receipts and original fixture rows
travel with the database, including verified empty seasons. Incomplete responses
and absent catalog entries are reported separately. The shared quota gives live
work priority.

Use `npm run history:backfill -- --reuse-pages` to move existing owned snapshot
pages into the archive without calling API-Football. Use
`npm run history:backfill -- --details --requests 20` to retrieve missing match
details for verified finals in batches of up to 20 fixtures per request. The
archive records available, missing, partial, and unsupported sections and keeps
the original observation times. The local archive can be exported later after
checking the hosted schema and permitted scope.

`npm run history:backfill -- --reference --requests 20` archives provider
dictionaries, team and venue records, standings, injuries, transfers, season
statistics, leaderboards, player profiles and career teams, coaches, current
squads, trophies, and sidelined records. It
discovers scoped targets from saved fixtures. Use `--help` for dataset selectors
or resume player pages separately with `--dataset player-statistics` or
`--dataset player-profiles`. Archived pages retain their retrieval dates and
can be read locally by selector. A complete empty response records what the
provider returned at that time. Active-season changes require later observations.

Use `npm run history:backfill -- --continuous` to run the supported fixture,
match-detail, and reference imports and process deferred fixture pages under
one owned database lock. The runner
checks each phase in bounded batches and waits when the shared provider quota
gives live work priority or repeated transport failures interrupt retrieval.
A drained pass waits for retryable or newly discovered coverage. The saved
source pages and import receipts persist across restarts.

To resume in the background after Windows sign-in, run the same continuous
command with `--prepare-database --log-to-disk` through Task Scheduler. The
runner starts the existing private loopback snapshot if necessary, and writes
an importer log under `.goal-hint/`. It can use the database already started
by the development app. Use `npm run history:backfill -- --replay` to process
a bounded batch of saved fixture pages without making API requests.

Run `npm run history:backfill -- --coverage` alongside the importer to audit
the saved archive without spending quota. It matches whole-season receipts
to checksummed provider pages, reports verified empty seasons and unresolved
scopes, and lists match-detail coverage and saved endpoint observations.

Add `--notify-on-completion` to the continuous Windows task to get one
desktop message after a settled pass verifies the historical archive.
The check requires current catalog evidence, resolved fixture and detail
coverage, settled reference discovery, the current odds mapping, and no
pending fixture replay. The runner saves the verified message and retries
delivery when the signed-in desktop is available. Imports continue after
the message. Live price and forecast collection have their own windows.

The live snapshot's web server defaults to `127.0.0.1`. To browse from another
device on the same network, start it with `npm run dev -- --hostname 0.0.0.0 --port 3000`
and open the host computer's LAN IP on port 3000. To keep LAN access enabled on
ordinary restarts, create an empty `.goal-hint/local-football-2026-11/lan` file.
Remove that file to restore the loopback default, or pass `--hostname 127.0.0.1`
for a single start. MySQL listens on loopback and the usual authentication
applies. See [LAN setup](../README.md#local-development) for address lookup and
firewall troubleshooting.

The local `.goal-hint/development-demo-retired` marker retires the old synthetic
database and blocks development commands that would recreate it. Preserved
member and payment records live in the local football database. The private
restore archive is stored under the ignored `.goal-hint/` directory.

## Coverage and storage

The deterministic schedule covers every Africa/Kampala reporting date from
**1 January through 30 November 2026 inclusive**: **334 days × 20 fixtures =
6,680 fixtures**, with 56 competition groups and 3,360 invented clubs. Twenty
distinct competitions are selected each day, rotating countries and pairings
across the calendar. Existing fixture identities, teams, kickoffs and match
outcomes are preserved for the retained selection. Stable
synthetic IDs use their own ranges. Club names, players, schedules, match results,
predictions and prices are fictional; familiar country and competition names
provide context. They do not represent actual fixtures or published bookmaker
prices.

The generator implements the documented API-Football v3 envelopes and endpoint
payloads, including `get`, `parameters`, `errors`, `results`, `paging`, and
`response`. Fixture detail responses include events, lineups, statistics and
players. Other endpoints cover teams, competitions, venues, squads, injuries,
standings, historical fixtures, team/player statistics, predictions, pre-match
and live odds, bookmakers and betting markets. Lineups and live statistics follow match-state
availability; future scores remain null. Match status and progress follow the
observation clock.

All canonical fixtures and the default 60-day window are stored initially. Rich
forecasts, evidence, details, prices and settlements for other requested date
ranges are materialized before the normal service reads. This bounds initial disk usage and makes every covered
date available. Normal filtering, search, pagination, details, refresh, results,
performance, slip generation and saved-slip services continue to read the same
production tables and validators. A first visit to an unmaterialized date range
can take longer than subsequent visits. Dates outside this dataset have no demo
fixtures.

Provider team/competition history remains complete in memory for consistent
form, standings and player statistics. That background evidence does not add
canonical fixture rows to the curated daily schedule. Every normal restart and
date materialization uses the same 20-match selection.
Stored form and head-to-head lists can be shorter because the retained canonical
schedule is a sample, while provider aggregates describe the larger fictional history.

The demo enables synthetic public odds and a local sign-in identity. The seeded
member is **+256700000001**, password **DemoGoalHint2026!**. Startup does not grant
paid access, create subscription offers or add wallet credit. Normal account/session
and entitlement checks still apply; administrators manage access through the normal tools.
An explicit sign-out is respected. Set `GOAL_HINT_DEMO_MEMBER=false` before
starting to exercise the signed-out experience. Synthetic editorial slips and
saved examples retain their original forecast references and ordinary result
settlement. Synthetic estimates are development examples, without production
model qualification.

Each day's synthetic editorial set is published at the opening of its Kampala
reporting day. Starting the demo after kickoff therefore still shows the same
original slips with their current pending, won or lost results. Custom builds
continue to use the normal current eligibility and kickoff checks.

The protected owner workspace uses the regular account login with your existing
administrator phone and password. The launcher reads `GOAL_HINT_ADMIN_PHONES`,
`GOAL_HINT_ADMIN_PASSWORD_HASH` and `GOAL_HINT_ADMIN_PASSWORD` with Next's normal
development environment-file precedence and process overrides. A configured hash
keeps precedence over a plain password. No public demo administrator credential
is installed. A valid configured administrator is provisioned in the isolated
demo database through normal login; the original database is not connected.
Startup does not create synthetic subscriber or financial examples. Analytics includes 61
days of diverse synthetic visits, devices, locations, sources and conversions.
These application records are separate from the unchanged provider payloads.
Restarts preserve your existing account records, package settings and edits.
Forecast-source diagnostics label their synthetic comparison replays and preserve
the original forecast bodies and recorded source order.

## Inspect, export and verify

Legacy demo subscription cleanup is separate from startup. The scoped
`scripts/reset-demo-subscriptions.mjs` command defaults to a dry run and requires
development demo mode, a verified loopback demo database and exactly six retained
active packages (1, 7, 30, 90, 180 and 365 days). Apply only after backing up the
owned database and reviewing the report. It deletes the five known demo offers
and verified synthetic payment/access records, retains accounts and unrelated trials,
and removes known synthetic spendable credit using compensating ledger entries.
Original wallet/audit history remains intact. Unrecognized payment dependencies,
transferred or already-spent synthetic funds block the reset for review. Deploying
the source alone does not clean an existing database or change production data.

Use the launcher's sanitized development environment with `DATABASE_URL` pointing
to the verified owned demo listener; do not load a private application environment file.
Preview with `node --conditions=react-server scripts/reset-demo-subscriptions.mjs --dry-run --expected-datadir <owned-mysql-directory>`.
After backup and review, replace `--dry-run` with `--apply`. Applying requires the
explicit directory and compares its resolved path to MySQL's `@@datadir` before
modifying any records. Stop old seed writers or load the updated source first.

While the demo server runs, inspect provider-shaped JSON directly:

```text
/api/demo/football/fixtures?date=2026-11-30&timezone=Africa/Kampala
/api/demo/football/fixtures?id=<synthetic fixture id>
/api/demo/football/fixtures/events?fixture=<synthetic fixture id>
/api/demo/football/fixtures/statistics?fixture=<synthetic fixture id>&half=true
/api/demo/football/odds?fixture=<synthetic fixture id>&bookmaker=8
/api/demo/football/odds/live
/api/demo/football/odds/live?fixture=<currently available synthetic fixture id>&bet=59
/api/demo/football/odds/live/bets?search=chance
```

These routes return 404 outside development demo mode. Internal catalog metadata
and app projections are never added to raw provider envelopes. The authoritative
reference is the [official API-Football v3 documentation](https://www.api-football.com/documentation_v3).

`fixtures/statistics?half=true` returns each team's `statistics`, `statistics_1h`
and `statistics_2h` arrays, containing the provider's `{type, value}` entries.
Team and statistic-type filters apply to all three arrays. The first half freezes
at the interval; the second half contains observations since the restart and
excludes extra time. An unstarted second half has no observations. Omitted or
`half=false` requests keep the ordinary full-match response.

Live odds use the provider's separate `/odds/live/bets` market IDs and the
`fixture`, `league`, `teams`, `status`, `update` and `odds` response fields.
Prices follow the observed score and remaining match time, update in five-second
steps, and include handicap, main-price and suspension flags. Fixtures enter the
live feed 5–15 minutes before kickoff and leave 5–20 minutes after completion;
the endpoint has no historical archive. Fixture, league and bet filters can be
combined. Extra-time markets and paused or closed markets follow match status.
Normal pages continue to use the same production services and components;
the slip builder retains the production pre-match price and eligibility rules.

Variant field trees were checked against the provider's OpenAPI 3.9.3 examples.
The [archived official specification](https://web.archive.org/web/20251204223402id_/https://api-sports.io/public/documentations/football-v3.yaml)
preserves the selectable “With half parameter” example, which the indexed
documentation does not expand. This is a copy of the provider's specification,
not a separately designed demo schema.

```sh
npm run demo:prepare
npm run demo:prepare:full
npm run demo:export
npm run demo:export -- --from 2026-11-01 --to 2026-11-30 --details
npm run demo:export -- --as-of 2026-10-28T09:00:00+03:00
npm run test:demo
npm run test:demo:integration
```

Exports stream gzip NDJSON to ignored `.goal-hint/demo-export/fixtures` or
`.goal-hint/demo-export/details`, with a manifest recording the date range,
observation time and counts. Default exports contain the unchanged daily
`fixtures` response envelope; `--details` writes an unchanged fixture-detail
response envelope per fixture, including the four detail arrays. Full detail
exports require substantially more time and disk space. Generated data, database
files, exports, credentials and build output stay out of Git.

`demo:prepare:full` eagerly materializes rich database records for all covered
days instead of waiting for reads; allow significant disk space and preparation
time. Stop the development server before running either preparation command or
`test:demo:integration`, since these commands own the same database directory.
`test:demo:integration` checks
the real production projections, including slip generation, without provider
credentials, and verifies the protected owner workspace through normal login.

Default and half-by-half statistics, live scores/events, live odds and the
pre-match odds used by the application are covered. Optional round-date responses
and lineup `type` projections are outside
the supported demo contract, as are unrelated API families such as transfers and
coaches. Compatibility is checked against official endpoint examples and the
application's production normalizers; it is not certification of every optional
API-Football variant. Internal demo metadata is never added to provider responses.
