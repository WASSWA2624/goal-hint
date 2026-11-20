# Football improvements release qualification — 20 November 2026

## Source and evidence

| Workstream | GitHub commit | Main change and verified result |
| --- | --- | --- |
| 01 Audit | `80d94137` | [Baseline report](football-improvement-baseline-2026-11-20.md) traces fixture IDs, forecast provenance, quota and the historical publication gap. |
| 02 Data contracts | `321585d4` | [Data contracts](football-improvement-data-contracts-2026-11-20.md) inventory provider endpoints and shared market definitions, and distinguish unavailable and partial coverage. |
| 03 Shared ingestion | `27fff730` | [Ingestion and replay](football-improvement-shared-ingestion-2026-11-20.md) describes shared provider requests, sealed checkpoints, the qualification flag and quota policy. |
| 04 Workers | `9ddcd0aa` | [Coordinated workers](football-improvement-coordinated-workers-2026-11-20.md) covers live discovery, recent context, interrupted backfill, per-fixture forecast material and durable recovery. |
| 05 Odds | `9745798c` | [Independent odds coverage](football-improvement-odds-coverage-2026-11-20.md) covers scan resumability, separate market namespaces, qualified reference prices and retained source identity. |
| 06 Numerical models | `fb3478bc` | [Evidence and models](football-improvement-evidence-models-2026-11-20.md) contains the point-in-time replay, calibration threshold and actual sample limits. |
| 07 Forecast decisions | `1c136583` | [Forecast pipeline](football-improvement-forecast-pipeline-2026-11-20.md) covers per-family source and abstention decisions, probability-first ranking and recovery of committed jobs. |
| 08 Publication and settlement | `fbdb0668` | [Fixture visibility and settlement](football-improvement-publication-settlement-2026-11-20.md) verifies that public fixture coverage does not depend on forecast or price availability. |

The mobile layout change was reverted in `32ab6b27`. The source sequence preserves the original application routes, UI components, styles, translations and Flutter host. The two pre-rollout hosts used identical UI source. The release integrates the backend changes on the existing production source `425268d8` to retain the deployed clock, checkout and account behavior.

## Acceptance evidence

| Checks | Verified evidence |
| --- | --- |
| Duplicate replay, corrections and cutoff | Isolated fixture and result ingestion, price receipts, publication, and resolution suites exercise repeated observation IDs, out-of-order responses, locked forecasts, and correction replay. A result correction can return a pick to pending until its current proof is attached. |
| Batching and checkpointing | Provider fixture batches are bounded to 20 IDs, with a second request at 21. Pre-match odds pages are capped by the provider at 10 fixtures. Single-page histories, forecast manifests and structured odds have durable scope receipts. A failed odds page rolls back its snapshots and resumes from the first uncommitted page. |
| Sharing and errors | A single verified read can serve catalog, live details and result consumers. Exact request keys and freshness epochs prevent inappropriate sharing. Adapter and quota cases cover HTTP errors, HTTP-200 error envelopes, permissions, minute and daily limits, and reserved priority. |
| Live and unresolved | The simulated runtime adopts an unknown fixture from one broad live poll. Overdue fixtures keep their provider status across midnight. A 70-day-old played extra-time fixture without verified regulation evidence retains a daily check. |
| Interrupted queue | Isolated MySQL sealed 1,001 hourly fixture jobs with distinct material keys. A replacement worker recovered one expired lease, reused its sealed stage, and drained the queue through 1,001 terminal outcomes. |
| Fixture visibility and access | The actual MySQL feed and summary listed 72 fixtures, nine with forecasts. Picks-only returned the nine qualifying fixtures. The 63 unavailable forecasts did not hide fixtures in the ordinary list. Free access retained authorized fixture data and withheld protected forecast details. |
| Evidence and probability | Evidence references and indirect relationships deduplicate their fixture observations. Player transfers are recorded with provenance. A numerical transfer effect, a new player probability, or a period forecast remains unavailable without data that qualifies it. The coherent score and settlement tests cover overlapping double chance, ordered thresholds, joint outcomes, tail bounds, pushes and half grades. |
| Engine routing and odds | The qualified refresh test publishes an evidence-supported provider forecast with no odds. Synthetic cases verify per-family fallback, partial coherent output, accounted retries and circuit failure behavior. The odds integration verifies exact requested, preferred and fallback source identities and no rerun on an odds-only change. |
| Safe publication and performance | An immutable decision keeps the original pre-match cutoff and selected outcome. Performance counts separate fixture, market and resolved-pick denominators. Diagnostic replay is identified separately from historical published picks. |

Run the tests from `next-js/` using the pinned Node 24.18.1. The provider and forecast cases use synthetic or archived data.

```powershell
fnm exec --using=24.18.1 npm.cmd run test:theme:contract
fnm exec --using=24.18.1 npm.cmd run test:scripts
fnm exec --using=24.18.1 node --conditions=react-server --test --test-concurrency=1 tests/live-ai.test.mjs tests/predictor-service.test.mjs tests/recommendation-selection.test.mjs tests/reference-odds.test.mjs tests/forecast-qualification-resilience.test.mjs tests/live-binding.test.mjs
fnm exec --using=24.18.1 node --conditions=react-server --test --test-concurrency=3 tests/device-feed-query.test.mjs tests/demo-feed-summary.test.mjs tests/performance-streaming.test.mjs
$env:MYSQL_TEST_SERVER_BINARY = '<path to an isolated MySQL 8.4 mysqld binary>'
fnm exec --using=24.18.1 node --conditions=react-server --test tests/forecast-cohort-resume.integration.mjs
```

All 203 deployment script checks, the shared theme contract, 72 focused AI, recommendation, odds and worker checks, and 24 feed, date and performance streaming checks passed. Older AI intents still reconstruct their original timing and approved source order. The test-only quote grant subprocess allows for concurrent startup time. Ordinary date reads and distinct forecast-only reads now warm their own cache keys.

A further 237 checks passed for member authentication, paywalls, subscription timing, filters, pagination, match details and slip logic.

The 1,001-fixture acceptance test passed on MySQL 8.4.11. The final run took 165.41 seconds to seed and enqueue and 302.33 seconds to exercise checkpointing, interruption and drain, including exactly 1,000 started stages and 1,000 sealed stages. It recorded 1,000 successful synthetic abstentions and one deliberate terminal failure, with one outcome per fixture and no pending work. The interrupted job had two attempts and reused its original receipt. A separate real publisher replay in the same database produced one immutable revision. The initial workload had already passed its assertions, then encountered a transient Windows directory lock during MySQL teardown. The final run passed with the test harness's bounded cleanup retry. An earlier version that tried to import all 1,001 new catalog rows at once stopped with `incomplete-import`. The scale result covers queued execution for stored fixtures. It provides no cold-import throughput or numerical prediction rate.

The build check identified a Next.js advisory on the shared `16.4.2` lock. The release pins Next.js and its lint config to `16.4.6`. The production lock audit cleared the Next.js finding and still reports a transitive Effect advisory through Prisma. npm's automated remedy for those Prisma entries is a major downgrade. [Next.js security fixes](https://github.com/vercel/next.js/releases/tag/v16.4.5) and [Effect advisory](https://github.com/Effect-TS/effect/security/advisories/GHSA-7589-6fvf-x4pw)

The first broad suite exposed failures already present at `c6ce6be2` in the loading-shell test harness, managed-support settings, slip-number and slip-price tests, and three theme preference DOM mocks. A serial run reproduced those baseline failures. The read-only browser checks cover existing desktop and mobile layout in both themes and the signed-out prediction link. The rollout retains the existing account and slip source. Read-only web smoke is complemented by tests for member sign-in, signed-out access, settlement and paid data visibility.

## Deployment scope

The new canonical migrations are `20261120123000_football_provider_coverage` and `20261120130000_in_play_odds_history`. Both add private tables. Restored older migration files match the historically applied bytes, and staging must reconcile the existing hourly-fixture gap against its own ledger. Web and worker profiles use independent configuration and retention authorities. The source exposes `GOAL_HINT_FOOTBALL_RESPONSE_ARCHIVE_ENABLED`, `GOAL_HINT_COORDINATED_FOOTBALL_ENABLED`, `GOAL_HINT_FORECAST_CONCURRENCY` and `GOAL_HINT_ODDS_BOOKMAKER_FALLBACK_IDS`, with conservative defaults. The odds reader and archive require their respective rights. Staging remains isolated from paid provider traffic.

The existing provider subscription is direct prepaid. Its documented daily reset is 00:00 UTC. The API separately limits per-minute request volume. Provider limits, date/competition coverage and approved rights take precedence over desired refresh intervals. In-play odds have no retrospective provider history, and the pre-match endpoint retains seven days. [API-Football terms](https://www.api-football.com/terms) and [endpoint guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)

## Capacity and schedules

Production recorded 35,918 physical provider dispatches in the 24 hours sampled before deployment, including 27,811 detail requests, 3,299 live/date requests, 2,949 results and cutoff requests, 1,530 enrichment requests and 329 daily input requests. It recorded 35 uncertain outcomes and zero throttled dispatches. The busiest minute had 53 requests and the 95th-percentile active minute had 36. The Mega account budget is 150,000 per UTC day, with an application ceiling of 120,000 and a short-window guard of 12 per second and 720 per minute. Staging dispatched zero in the same sample.

Production's seven forward Kampala dates held 330, 1,232, 879, 145, 202, 206 and 130 fixtures. At the provider's ten-fixture odds page size, the upper bound for all those fixtures is 315 pages per complete sweep or 2,520 pages per day at a three-hour cadence, before catalog calls, retries and any reduction from missing provider offers. This estimate does not establish bookmaker coverage or activate odds collection.

The coordination estimate uses the retained kickoff minutes, a two-hour live interval, grouping up to 20 IDs, and checks every 15 minutes before kickoff. It projects 2,447–5,192 critical calls and 1,832 optional detail calls for the 330-fixture date, and 3,965–12,170 critical plus 4,872 optional calls for the 1,232-fixture date. The peak minute is projected at 21 and 74 requests respectively for those calls, before forecast and history work. Current-day context may add 1,152 calls per day and forecast preparation up to eight per newly eligible fixture. The model assumes fully occupied batches where possible. A projected overlap of 398 live fixtures on the busier date means processing latency still needs on-host evidence. No production request savings were measured for the gated coordinator.

| Responsibility | Candidate operational defaults and limit |
| --- | --- |
| Results and live details | Broad live discovery every 60 seconds while active and five minutes while idle. Details normally refresh every two minutes. Unresolved rows use hourly recovery then daily after 48 hours, subject to the configured account. Fixture lookup batches contain up to 20 IDs. |
| Current-day inputs | Kampala day discovery, hourly context refresh and resumable scoped player pages, with verified coverage and shared quota admission. `/players` pages contain up to 20 rows. |
| Odds | Three-hour pre-match dates, daily reference catalog, resumable verified pages and a 60-second coordinated in-play poll when retention authority and quota allow. Separate namespaces preserve catalog coverage and actual price source. |
| History | Checkpointed competition, season, round, details and reference work uses eligible spare capacity. Live and current-day reserves take priority. |
| Forecasts | One active forecast by default, fenced per fixture, with 60 seconds to coalesce material changes and hourly recovery. AI dispatch limits apply only under approved numerical and billing policy. Ordinary odds updates never change the forecast material identity. |

## Hosted baseline

Before activation, HTTPS and the Matches API passed on both origins. Staging returned `X-Robots-Tag: noindex, follow`, and anonymous `/admin` requests redirected to the account page on both origins. For 20 November, the old staging API returned zero listed fixtures from a known cohort of 334; old production returned 12 of 330. The normal API dates and coverage totals provide a stable comparison for the new fixture publication path.

On the pre-release production worker, the ten preceding hourly jobs exhausted retries. The last verified hourly commit was at 00:01 UTC on 20 November. Historical fixture pages were still advancing. Recent details jobs had also exhausted retries, with 515,915 details remaining in the stored status. Deployment observation distinguishes scheduling, a committed hourly run, and an advancing history checkpoint.

The historical fit scored 31 of 82 final-block fixtures and abstained on 51. Its low-score correction did not improve the matched Brier or log-loss measures in that small block. No competition reached the calibration requirement. No rollout finding establishes an accuracy improvement or qualifies the new fitted or period models for publication. [Numerical evaluation](football-improvement-evidence-models-2026-11-20.md)

## Operator commands

Build the clean integrated commit with `fnm exec --using=24.18.1 npm.cmd run package:cpanel`. Verify the adjacent SHA-256 before extracting the ZIP's `goal-hint/` directory into the target account's dedicated, commit-named release directory. Compare `BUILD_INFO.json` to the pushed commit and verify that its working tree was clean. Prepare the production worker with the same commit's `next-js` source and native Linux dependencies using `npm ci --no-audit --no-fund`, which generates Prisma during postinstall. Reuse its private systemd environment and existing approvals. Staging uses its own credentials and keeps its worker disabled.

```bash
node=/opt/node-v24.18.1-linux-x64/bin/node
# Set sha to the pushed release commit and set each verified backup manifest.
stage=/home/ghstage/goal-hint-releases/$sha-staging
prod=/home/ghprod/goal-hint-releases/$sha-production
GOAL_HINT_MIGRATION_BACKUP="$stage_backup_manifest" bash "$stage/scripts/activate-hosted.sh" \
  staging "$stage" ghstage "$node" /root/goalhint-setup/staging-credentials/migrate.cnf ghstage_localcopy
systemctl stop goalhint-live@ghprod.service
GOAL_HINT_MIGRATION_BACKUP="$prod_backup_manifest" bash "$prod/scripts/activate-hosted.sh" \
  production "$prod" ghprod "$node" /root/goalhint-setup/production/migrate.cnf ghprod_prod
worker=/home/ghprod/goal-hint-worker
ln -s "$worker/releases/$sha-production" "$worker/current.next"
chown -h ghprod:ghprod "$worker/current.next"
mv -T "$worker/current.next" "$worker/current"
systemctl start goalhint-live@ghprod.service
systemctl is-active goalhint-live@ghprod.service
```

Record the exact old web and worker link targets before switching. For application rollback, select the corresponding account and recorded release. Pause the production worker before restoring either production pointer. Preserve previously installed migration markers and the expanded schema. Verify the target directories, resume production's existing worker, and verify HTTPS, feed counts and its systemd status.

```bash
# Set account, previous_web and, for production, previous_worker to the recorded paths.
home=/home/$account
if [[ "$account" == ghprod ]]; then systemctl stop goalhint-live@ghprod.service; fi
runuser -u "$account" -- touch "$previous_web/tmp/restart.txt"
ln -s "$previous_web" "$home/goal-hint.rollback"
chown -h "$account:$account" "$home/goal-hint.rollback"
mv -T "$home/goal-hint.rollback" "$home/goal-hint"
if [[ "$account" == ghprod ]]; then
  worker=$home/goal-hint-worker
  ln -s "$previous_worker" "$worker/current.rollback"
  chown -h "$account:$account" "$worker/current.rollback"
  mv -T "$worker/current.rollback" "$worker/current"
  systemctl start goalhint-live@ghprod.service
fi
```

The activation checks the encrypted database backup's SHA-256 manifest. Verify a restore by decrypting to an explicitly isolated schema using the retained key and an authorized connection. The application rollback leaves new tables in place. The staging hourly-fixture compatibility migration also adds the existing production hourly key, so its older web can be relinked while staging's provider writers remain disabled.
