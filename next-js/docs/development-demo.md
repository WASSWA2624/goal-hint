# Development football demo

`npm run dev` starts the regular Next application with synthetic football data
and its own persistent local MySQL database. Install the repository's pinned
Node/npm versions, Python 3.11+, and genuine MySQL 8.4+ first. The launcher finds
MySQL on PATH, a standard Windows installation, or the portable installation in
`%LOCALAPPDATA%/GoalHint/mysql-*/`. Alternatively set
`GOAL_HINT_DEMO_MYSQL_BINARY` to the full `mysqld` executable path.

```sh
npm ci
npm run dev -- --hostname 0.0.0.0 --port 3000
```

The launcher applies the ordinary migrations and prepares the football catalog,
all fixture dates, and rich records for the default pages: today through the next
30 days for the slip builder, plus the preceding 29 days for performance/history.
First preparation takes substantial time; progress is printed before the web
server reports ready. This also prepares original-publication prices and 30 days
of editorial/saved slip examples for the default history page. Later starts reuse
the stored records. Startup also warms the default monthly performance view;
this full validated aggregation can take several minutes. Development performance
responses retain a one-hour snapshot with its original observation time, so the
initial report validation leaves enough time to browse the prepared pages.
Historical corrections, catalog updates and permission changes invalidate it;
today's live progress continues through the normal feed and detail refreshes.
Production performance cache and transaction budgets remain unchanged.
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
Existing local environment files,
provider credentials and database targets are excluded from this demo process.

Use `npm run dev:live` to use the existing configured development services. This
explicit opt-out preserves their existing configuration and authorization rules.
`GOAL_HINT_DEMO=false npm run dev` is equivalent on shells supporting that syntax.
Production and tests never select the development demo.

## Coverage and storage

The deterministic schedule covers every Africa/Kampala reporting date from
**1 January through 30 November 2026 inclusive**: **334 days × 560 fixtures =
187,040 fixtures**, with 56 competition groups and 3,360 invented clubs. Stable
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

The demo enables synthetic public odds and local member access. The seeded
member is **+256700000001**, password **DemoGoalHint2026!**, with synthetic access
and wallet credit. Normal account/session and entitlement checks still apply.
An explicit sign-out is respected. Set `GOAL_HINT_DEMO_MEMBER=false` before
starting to exercise the signed-out experience. Synthetic editorial slips and
saved examples retain their original forecast references and ordinary result
settlement. Synthetic estimates are development examples, without production
model qualification.

Each day's synthetic editorial set is published at the opening of its Kampala
reporting day. Starting the demo after kickoff therefore still shows the same
original slips with their current pending, won or lost results. Custom builds
continue to use the normal current eligibility and kickoff checks.

The protected owner workspace uses the regular account login with administrator
**+256700000099**, password **DemoGoalHintAdmin2026!**. Its separate fictional
allowlist and password are installed only in the isolated launcher environment.
The demo includes 48 additional members with active, expired, blocked and reset
states, multiple plans, pending/approved/rejected/superseded/reversed payments,
access periods, wallet ledgers and owner audit entries. Analytics includes 61
days of diverse synthetic visits, devices, locations, sources and conversions.
These application records are separate from the unchanged provider payloads.
They are inserted once; restarts preserve your review decisions and edits.
Forecast-source diagnostics label their synthetic comparison replays and preserve
the original forecast bodies and recorded source order.

## Inspect, export and verify

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
