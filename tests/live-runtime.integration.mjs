import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { getReportingDate } from '../src/domain/calendar.ts';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { createJobWorker } from '../src/server/jobs/job-worker.ts';
import { selectionTriggerBounds } from '../src/server/live/live-plan.ts';
import { latestSelectionOccurrence } from '../src/server/live/live-runner.ts';
import { createLiveRuntime } from '../src/server/live/live-runtime.ts';
import { createMatchFeedService } from '../src/server/matches/feed-service.ts';
import { dailySelectionEnvelope } from '../src/server/selection/selection-trigger.ts';
import { catalogFixture, catalogResponse } from './helpers/catalog-fixtures.mjs';
import { fallbackRawPrediction, fallbackResponse } from './helpers/fallback-adapter-fixtures.mjs';
import { MysqlServerUnavailableError, startIsolatedMysql } from './helpers/mysql-instance.mjs';

// The real live runtime runs on a fresh owned MySQL with the local application role's
// exact grants. Provider responses, account limits and owner approvals are synthetic.
const execute = promisify(execFile), workspace = fileURLToPath(new URL('../', import.meta.url));
const script = fileURLToPath(new URL('../scripts/database.mjs', import.meta.url));
const DAY = 86_400_000, hash = (value) => createHash('sha256').update(value).digest('hex');
const appendOnly = ['DailyRunManifest','DurableJobEvent','DurableJobUsage','EvidenceSourceVersion','FixtureEvidenceSnapshot',
  'FixtureEvidenceSnapshotSource','FixtureLifecycleObservation','FixtureResult','FootballFixtureAudit','FootballImport','MarketPrediction',
  'MarketSettlementRevision','ModelVersion','PredictionAudit','PredictionChangeEvent','PredictionCycleOperation','PredictionPublicationBarrier',
  'PredictionRefreshIntent','PredictionRefreshOutcome','PredictionRefreshResult','PredictionRefreshStage','PredictionSchedule','PredictionSet',
  'RecoveryAudit','ResultProviderObservation','SettlementBatch','SettlementEventReceipt'];
const mutable = ['ApiQuotaAccount','ApiQuotaAttempt','ApiQuotaPeriod','CostBudgetAccount','CostBudgetAttempt','CostBudgetJob','CostBudgetPeriod',
  'FixtureLifecycleState','FixtureResultState','FootballCatalogLock','FootballCompetition','FootballCompetitionAlias','FootballCompetitionProvider',
  'FootballFixture','FootballIdentityReview','FootballSeason','FootballTeam','FootballTeamAlias','FootballTeamProvider','ResultPollerLease'];
const columns = {
  PublicCacheInvalidation: 'acknowledgedAt', SelectionCycleEligibility: 'actor, consumedRunId, eligibleAfter, evidenceRef, kickoffAt, previousVersion, recordedAt, state',
  DurableJob: 'attemptCount, attemptDeadlineAt, availableAt, fence, finishedAt, leaseExpiresAt, ownerId, state, terminalReason, updatedAt, version',
  PredictionCycle: 'closedAt, currentSetId, cutoffAt, kickoffAt, lockedAt, lockedSetId, scheduleVersion, state, version, voidReason, voidedAt',
  DailyRun: 'committedAt, completedJobs, fence, leaseExpiresAt, ownerId, partial, selectionHash, selectionJson, terminalJobs, totalJobs, windowEnd, windowStart',
  ResultSyncBatch: 'completedAt', DailyRunImport: 'failure, finishedAt', DurableJobAttempt: 'finishedAt, outcome, reason',
  RunFixture: 'jobId, jobState, terminalReason', MarketSettlement: 'revisionId',
};
const refs = { GOAL_HINT_BUDGET_APPROVAL_REF: 'synthetic-budget', GOAL_HINT_FOOTBALL_PRIVATE_USE_REF: 'synthetic-private-use',
  GOAL_HINT_FOOTBALL_ACCOUNT_EVIDENCE_REF: 'synthetic-account', GOAL_HINT_EVIDENCE_POLICY_REF: 'synthetic-evidence',
  GOAL_HINT_FRESHNESS_POLICY_REF: 'synthetic-freshness', GOAL_HINT_PIPELINE_INTEGRITY_REF: 'synthetic-integrity',
  GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF: 'synthetic-rights', GOAL_HINT_QUALITY_QUALIFICATION_REF: 'synthetic-quality',
  GOAL_HINT_RELEASE_APPROVAL_REF: 'synthetic-release' };
const requirementFor = { GOAL_HINT_BUDGET_APPROVAL_REF: 'budget-approval', GOAL_HINT_FOOTBALL_PRIVATE_USE_REF: 'football-private-use',
  GOAL_HINT_FOOTBALL_ACCOUNT_EVIDENCE_REF: 'football-account', GOAL_HINT_EVIDENCE_POLICY_REF: 'evidence-policy',
  GOAL_HINT_FRESHNESS_POLICY_REF: 'freshness-policy', GOAL_HINT_PIPELINE_INTEGRITY_REF: 'pipeline-integrity',
  GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF: 'football-public-rights', GOAL_HINT_QUALITY_QUALIFICATION_REF: 'quality-qualification',
  GOAL_HINT_RELEASE_APPROVAL_REF: 'release-approval' };

test('the live runtime imports, publishes fallback forecasts and serves them through the public feed', { timeout: 300_000 }, async (t) => {
  let instance;
  try { instance = await startIsolatedMysql(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(`${error.message} Live runtime acceptance remains pending.`); return; }
  const appPassword = randomBytes(24).toString('hex'), migrationPassword = randomBytes(24).toString('hex');
  const appUrl = `mysql://live_app:${appPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  const migrationUrl = `mysql://live_migration:${migrationPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
  let runtime;
  try {
    await instance.executeAdmin(`CREATE USER 'live_app'@'127.0.0.1' IDENTIFIED BY '${appPassword}';
      CREATE USER 'live_migration'@'127.0.0.1' IDENTIFIED BY '${migrationPassword}';
      GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES, TRIGGER ON goal_hint_test.* TO 'live_migration'@'127.0.0.1';`);
    const base = { ...process.env };
    for (const key of Object.keys(base)) if (key.startsWith('GOAL_HINT_') || key.endsWith('DATABASE_URL') || key.endsWith('_API_KEY')) delete base[key];
    await execute(process.execPath, ['--conditions=react-server', script, 'deploy'], { cwd: workspace, windowsHide: true, timeout: 120_000,
      env: { ...base, NODE_ENV: 'development', GOAL_HINT_DATABASE_ENABLED: 'true', MIGRATION_DATABASE_URL: migrationUrl,
        GOAL_HINT_DATABASE_TLS_MODE: 'disabled', DEBUG: '' } });
    // Mirror the local application role: database-wide reads, append-only history and column-scoped updates.
    await instance.executeAdmin([`GRANT SELECT ON goal_hint_test.* TO 'live_app'@'127.0.0.1';`,
      ...appendOnly.map((name) => `GRANT SELECT, INSERT ON goal_hint_test.${name} TO 'live_app'@'127.0.0.1';`),
      ...mutable.map((name) => `GRANT SELECT, INSERT, UPDATE ON goal_hint_test.${name} TO 'live_app'@'127.0.0.1';`),
      ...Object.entries(columns).map(([name, list]) => `GRANT SELECT, INSERT, UPDATE (${list}) ON goal_hint_test.${name} TO 'live_app'@'127.0.0.1';`),
      `GRANT SELECT, INSERT, UPDATE, DELETE ON goal_hint_test.PublicResponseCache TO 'live_app'@'127.0.0.1';`,
      `GRANT SELECT, UPDATE (id) ON goal_hint_test.DurableJobEnqueueLock TO 'live_app'@'127.0.0.1';`,
      `GRANT SELECT, UPDATE (requests, windowStartedAt) ON goal_hint_test.PublicSearchLimit TO 'live_app'@'127.0.0.1';`].join('\n'));

    const policy = parseRuntimePolicy({ NODE_ENV: 'development', GOAL_HINT_OPERATION_SCOPE: 'production', GOAL_HINT_DATABASE_ENABLED: 'true',
      DATABASE_URL: appUrl, GOAL_HINT_DATABASE_CONNECTION_MODE: 'direct', GOAL_HINT_DATABASE_POOL_LIMIT: '6', GOAL_HINT_DATABASE_TLS_MODE: 'disabled',
      GOAL_HINT_FOOTBALL_ENABLED: 'true', API_FOOTBALL_KEY: 'synthetic-live-key', API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS: '0',
      GOAL_HINT_COMPETITION_IDS: '39', GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS: '0', GOAL_HINT_JOB_REQUEST_LIMIT: '2',
      GOAL_HINT_JOB_TIMEOUT_SECONDS: '120', ...refs });
    const approvals = { version: 1, owner: 'Synthetic owner', approvals: Object.entries(refs).map(([field, reference]) =>
      ({ requirement: requirementFor[field], reference, approvedAt: '2026-10-10', decision: 'Synthetic test approval only.' })) };

    const now = Math.floor(Date.now() / 60_000) * 60_000, iso = (at) => new Date(at).toISOString();
    const rows = [catalogFixture(9001, { kickoff: iso(now + 2 * DAY), homeId: 501, awayId: 502 }),
      catalogFixture(9002, { kickoff: iso(now + 3 * DAY), homeId: 503, awayId: 504 }),
      catalogFixture(9003, { kickoff: iso(now + 2 * DAY), competitionId: 40, homeId: 505, awayId: 506 })];
    const network = [];
    const fetcher = async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      assert.equal(url.origin, 'https://v3.football.api-sports.io'); assert.equal(init.headers['x-apisports-key'], 'synthetic-live-key');
      network.push(`${url.pathname}?${[...url.searchParams.keys()].filter((key) => key !== 'timezone').join(',')}`);
      if (url.pathname === '/status') return Response.json({ get: 'status', parameters: [], errors: [], results: 1, paging: { current: 1, total: 1 },
        response: { account: { email: 'owner@example.test' }, subscription: { plan: 'Pro', end: iso(now + 30 * DAY), active: true },
          requests: { current: 0, limit_day: 7500 } } });
      if (url.pathname === '/predictions') {
        const row = rows.find((item) => String(item.fixture.id) === url.searchParams.get('fixture'));
        return fallbackResponse(url, [fallbackRawPrediction({ home: { externalId: row.teams.home.id }, away: { externalId: row.teams.away.id } })]);
      }
      let selected = rows;
      if (url.searchParams.has('date')) selected = rows.filter((row) => getReportingDate(Date.parse(row.fixture.date)) === url.searchParams.get('date'));
      if (url.searchParams.has('id')) selected = rows.filter((row) => String(row.fixture.id) === url.searchParams.get('id'));
      if (url.searchParams.has('live')) selected = [];
      return catalogResponse(url, selected);
    };

    runtime = await createLiveRuntime(policy, { fetcher, approvals });
    assert.equal(runtime.workload.cadence.liveMs, null, 'a 7,500-request plan observes live status through date sync');
    const occurrence = latestSelectionOccurrence(Date.now());
    await runtime.queue.enqueue(dailySelectionEnvelope(occurrence, selectionTriggerBounds));
    await assert.doesNotReject(runtime.queue.enqueue(dailySelectionEnvelope(occurrence, selectionTriggerBounds)), 'scheduling is idempotent');
    const events = [];
    const worker = createJobWorker({ queue: runtime.queue, registry: runtime.registry, ownerId: hash('live-worker'), pollMs: 50,
      onEvent: (event) => events.push(event) });
    for (let index = 0; index < 10 && await worker.runOnce(); index++);
    if (network.filter((entry) => entry === '/predictions?fixture').length !== 2) {
      const jobs = await runtime.database.query((tx) => tx.durableJob.findMany({ select: { type: true, state: true, attemptCount: true, terminalReason: true } }));
      const outcomes = await runtime.database.query((tx) => tx.$queryRaw`SELECT CAST(body AS CHAR) AS body FROM PredictionRefreshOutcome`);
      t.diagnostic(JSON.stringify({ network, events, jobs, outcomes: outcomes.map((row) => JSON.parse(row.body)).map(({ outcome, reason, phases }) => ({ outcome, reason, phases })) }));
    }

    await t.test('one selection imports seven dates and refreshes only selected competitions', async () => {
      assert.equal(network.filter((entry) => entry === '/fixtures?date').length, 7);
      assert.equal(network.filter((entry) => entry === '/predictions?fixture').length, 2);
      assert.equal(network.filter((entry) => entry === '/fixtures?id').length, 2);
      const counts = await runtime.database.query(async (tx) => ({ sets: await tx.predictionSet.count(), runs: await tx.dailyRun.count(),
        markets: await tx.marketPrediction.findMany({ where: { family: 'match-result' }, select: { available: true, source: true } }) }));
      assert.equal(counts.runs, 1); assert.equal(counts.sets, 2);
      assert.ok(counts.markets.length === 2 && counts.markets.every((market) => market.available && market.source === 'api-football'));
    });
    await t.test('the public feed serves the published fallback forecasts with provisional provenance', async () => {
      const feed = createMatchFeedService({ database: runtime.database, competitionIds: [39] });
      const date = getReportingDate(Date.parse(rows[0].fixture.date));
      const response = await feed.query({ date });
      assert.equal(response.state, 'ready');
      const record = response.records.find((item) => item.homeTeam.name === 'Synthetic club 501');
      assert.ok(record?.forecast, JSON.stringify(response.records));
      assert.match(JSON.stringify(record.forecast), /api-football/u);
      assert.equal(record.cycle.state, 'open');
      assert.ok(response.records.every((item) => item.competition.name !== 'Synthetic competition 40'));
    });
    await t.test('result polling covers predicted competitions through the shared limiter', async () => {
      const poller = await runtime.resultPoller();
      assert.deepEqual(poller.policy.coverage, [{ competitionId: 39, season: 2026 }]);
      const before = network.length; await poller.service.runOnce();
      assert.ok(network.slice(before).includes('/fixtures?date'));
      assert.ok(await runtime.quota.remaining() < 7500);
      await poller.service.stop();
    });
    await t.test('settlement and cache maintenance run without provider calls', async () => {
      const before = network.length;
      await runtime.settlement.reconcile(100); await runtime.cache.reconcile(100);
      assert.equal(network.length, before);
    });
  } finally {
    await runtime?.close().catch(() => {}); await instance.stop();
  }
});
