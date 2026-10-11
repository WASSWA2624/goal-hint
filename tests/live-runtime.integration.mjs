import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { addReportingDays, getReportingDate } from '../src/domain/calendar.ts';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { createJobWorker } from '../src/server/jobs/job-worker.ts';
import { selectionTriggerBounds } from '../src/server/live/live-plan.ts';
import { latestSelectionOccurrence } from '../src/server/live/live-runner.ts';
import { createLiveRuntime } from '../src/server/live/live-runtime.ts';
import { createMatchFeedService } from '../src/server/matches/feed-service.ts';
import { latestOddsSlot, ODDS_CATALOG_TYPE, ODDS_IMPORT_TYPE, ODDS_SWEEP_MS, oddsImportEnvelope, oddsScheduleEnvelopes,
  oddsSlotDates } from '../src/server/odds/odds-jobs.ts';
import { dailySelectionEnvelope } from '../src/server/selection/selection-trigger.ts';
import { latestTeamCodesSlot, TEAM_CODES_HANDLER_VERSION, TEAM_CODES_SLOT_MS, TEAM_CODES_TYPE, teamCodesEnvelope } from '../src/server/teams/team-code-jobs.ts';
import { catalogFixture, catalogResponse, catalogTeam } from './helpers/catalog-fixtures.mjs';
import { fallbackRawPrediction, fallbackResponse } from './helpers/fallback-adapter-fixtures.mjs';
import { MysqlServerUnavailableError, startIsolatedMysql } from './helpers/mysql-instance.mjs';
import { launchBetCatalog, oddsResponse, offsetTime, rawOddsRow } from './helpers/odds-fixtures.mjs';

// The real live runtime runs on a fresh owned MySQL with the local application role's
// exact grants. Provider responses, account limits and owner approvals are synthetic.
const execute = promisify(execFile), workspace = fileURLToPath(new URL('../', import.meta.url));
const script = fileURLToPath(new URL('../scripts/database.mjs', import.meta.url));
const DAY = 86_400_000, hash = (value) => createHash('sha256').update(value).digest('hex');
const appendOnly = ['DailyRunManifest','DurableJobEvent','DurableJobUsage','EvidenceSourceVersion','FixtureEvidenceSnapshot',
  'FixtureEvidenceSnapshotSource','FixtureLifecycleObservation','FixtureResult','FootballFixtureAudit','FootballImport','MarketPrediction',
  'MarketSettlementRevision','ModelVersion','PredictionAudit','PredictionChangeEvent','PredictionCycleOperation','PredictionPublicationBarrier',
  'PredictionRefreshIntent','PredictionRefreshOutcome','PredictionRefreshResult','PredictionRefreshStage','PredictionSchedule','PredictionSet',
  'RecoveryAudit','ResultProviderObservation','SettlementBatch','SettlementEventReceipt','OddsImportBatch','OddsBetObservation','ProviderOddsSnapshot'];
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
  FixtureOddsState: 'lastProviderUpdatedAt, lastRetrievedAt, latestBatchId, policyHash, publicVersion, withdrawnAt',
  FixtureOddsPrice: 'basis, basisJson, bookmakerExternalId, displayHundredths, impliedProbability, line, mappingVersion, method, overround, priceDecimal, providerUpdatedAt, retrievedAt, snapshotId, stale',
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
  let runtime, oddsRuntime;
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

    const policyEnv = { NODE_ENV: 'development', GOAL_HINT_OPERATION_SCOPE: 'production', GOAL_HINT_DATABASE_ENABLED: 'true',
      DATABASE_URL: appUrl, GOAL_HINT_DATABASE_CONNECTION_MODE: 'direct', GOAL_HINT_DATABASE_POOL_LIMIT: '6', GOAL_HINT_DATABASE_TLS_MODE: 'disabled',
      GOAL_HINT_FOOTBALL_ENABLED: 'true', API_FOOTBALL_KEY: 'synthetic-live-key', API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS: '0',
      GOAL_HINT_COMPETITION_IDS: '39', GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS: '0', GOAL_HINT_JOB_REQUEST_LIMIT: '2',
      GOAL_HINT_JOB_TIMEOUT_SECONDS: '120', ...refs };
    const policy = parseRuntimePolicy(policyEnv);
    const approvals = { version: 1, owner: 'Synthetic owner', approvals: Object.entries(refs).map(([field, reference]) =>
      ({ requirement: requirementFor[field], reference, approvedAt: '2026-10-10', decision: 'Synthetic test approval only.' })) };

    const now = Math.floor(Date.now() / 60_000) * 60_000, iso = (at) => new Date(at).toISOString();
    const rows = [catalogFixture(9001, { kickoff: iso(now + 2 * DAY), homeId: 501, awayId: 502 }),
      catalogFixture(9002, { kickoff: iso(now + 3 * DAY), homeId: 503, awayId: 504 }),
      // Competition 40's clubs arrive without codes, as /fixtures sends them: candidates for the team-code import.
      catalogFixture(9003, { kickoff: iso(now + 2 * DAY), competitionId: 40, teams: { home: catalogTeam(505, { code: null }),
        away: catalogTeam(506, { code: null }) } })];
    const network = [];
    // Synthetic odds rows: two fixtures the selection imports and one (9100) it never does.
    const update = offsetTime(now - 60_000);
    const oddsRows = [rawOddsRow(9001, now + 2 * DAY, { update }), rawOddsRow(9002, now + 3 * DAY, { update }), rawOddsRow(9100, now + 2 * DAY, { update })];
    let statusUsed = 0;
    const fetcher = async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      assert.equal(url.origin, 'https://v3.football.api-sports.io'); assert.equal(init.headers['x-apisports-key'], 'synthetic-live-key');
      network.push(`${url.pathname}?${[...url.searchParams.keys()].filter((key) => key !== 'timezone').join(',')}`);
      if (url.pathname === '/status') return Response.json({ get: 'status', parameters: [], errors: [], results: 1, paging: { current: 1, total: 1 },
        response: { account: { email: 'owner@example.test' }, subscription: { plan: 'Pro', end: iso(now + 30 * DAY), active: true },
          requests: { current: statusUsed, limit_day: 7500 } } });
      if (url.pathname === '/odds/bets') return oddsResponse(url, launchBetCatalog());
      if (url.pathname === '/odds/bookmakers') return oddsResponse(url, [{ id: 8, name: 'Synthetic bookmaker' }]);
      if (url.pathname === '/odds') return oddsResponse(url, oddsRows.filter((row) => getReportingDate(row.fixture.timestamp * 1000) === url.searchParams.get('date')));
      if (url.pathname === '/teams') return catalogResponse(url, [{ team: catalogTeam(505) }, { team: catalogTeam(506) }]);
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

    // Odds (052): synthetic bookmaker 8 prices for two imported fixtures and one fixture the catalog never imported.
    const oddsTypes = [ODDS_IMPORT_TYPE, ODDS_CATALOG_TYPE], slot = latestOddsSlot(Date.now()), today = getReportingDate(slot);
    const slotDates = oddsSlotDates(slot, 7), oddsCalls = () => network.filter((entry) => entry.startsWith('/odds')).length;
    const oddsJobs = () => runtime.database.query((tx) => tx.durableJob.findMany({ where: { type: { in: oddsTypes } },
      select: { idempotencyKey: true, type: true, state: true, terminalReason: true } }));
    const drain = async (registry, label) => {
      const worker = createJobWorker({ queue: runtime.queue, registry, ownerId: hash(label), pollMs: 50 });
      for (let index = 0; index < 20 && await worker.runOnce(); index++);
    };
    const teamCalls = () => network.filter((entry) => entry.startsWith('/teams')).length;
    const teamCodeJob = (envelope) => runtime.database.query((tx) => tx.durableJob.findFirst({ where: { type: TEAM_CODES_TYPE,
      idempotencyKey: envelope.idempotencyKey }, select: { id: true, state: true, terminalReason: true } }));
    const enrichmentDispatched = () => runtime.database.query((tx) => tx.apiQuotaAttempt.count({ where: { priority: 3, dispatchedAt: { not: null } } }));
    const teamsReceipts = async () => (await runtime.database.query((tx) => tx.footballImport.aggregate({ where: { kind: 'teams' },
      _sum: { requestsDispatched: true } })))._sum.requestsDispatched ?? 0;

    // Team codes: on by default, and Pro has the spare. A sweep needs three minutes of its hourly slot to start a season.
    const teamSlot = latestTeamCodesSlot(Date.now());
    const teamSkip = teamSlot + TEAM_CODES_SLOT_MS - Date.now() < 4 * 60_000 ? 'Fewer than four minutes remain in this team-code slot.' : false;
    await t.test('a team-code sweep imports the codeless league on the enrichment worker, attributed by receipt, job usage and limiter', { skip: teamSkip }, async () => {
      assert.equal(runtime.teamCodes.enabled, true);
      const before = { teams: teamCalls(), enrichment: await enrichmentDispatched() };
      assert.equal(before.enrichment, 0, 'no enrichment caller has run yet');
      const envelope = teamCodesEnvelope(teamSlot);
      await runtime.queue.enqueue(envelope);
      await drain(runtime.registry, 'ordinary-worker-team-codes');
      assert.equal((await teamCodeJob(envelope)).state, 'pending', 'ordinary workers leave team-code jobs alone');
      await drain(runtime.enrichment.registry, 'enrichment-worker-team-codes');
      const job = await teamCodeJob(envelope);
      assert.deepEqual([job.state, job.terminalReason], ['succeeded', 'completed']);
      assert.deepEqual(network.filter((entry) => entry.startsWith('/teams')).slice(before.teams), ['/teams?league,season'],
        'one request: competition 40 has the only codeless clubs; the clubs of competition 39 already carry codes');
      const stored = await runtime.database.query(async (tx) => ({
        codes: (await tx.footballTeamProvider.findMany({ where: { externalId: { in: [505n, 506n] } }, include: { team: true }, orderBy: { externalId: 'asc' } }))
          .map((row) => row.team.code),
        usage: await tx.durableJobUsage.findMany({ where: { jobId: job.id }, select: { provider: true, phase: true, requests: true, costReference: true } }),
      }));
      assert.deepEqual(stored.codes, ['T505', 'T506']);
      assert.equal(await teamsReceipts(), 1);
      assert.deepEqual(stored.usage, [{ provider: 'football', phase: 'completed', requests: 1, costReference: null }]);
      assert.equal(await enrichmentDispatched(), 1, 'the team-code request is an enrichment attempt the shared gate counts');
    });
    // A slot that ends mid-test would expire its jobs at claim time; that boundary is covered by the unit tests.
    const oddsSkip = slot + ODDS_SWEEP_MS - Date.now() < 3 * 60_000 ? 'Fewer than three minutes remain in this odds slot.' : false;
    await t.test('odds are off by default: the dedicated worker expires queued odds jobs without a provider call', { skip: oddsSkip }, async () => {
      assert.equal(runtime.odds.enabled, false); assert.equal(runtime.workload.odds.eligible, true, 'Pro has spare quota, but the owner switch is off');
      assert.deepEqual(runtime.odds.registry.types.map((entry) => entry.type), oddsTypes);
      assert.ok(runtime.registry.types.every((entry) => !oddsTypes.includes(entry.type)), 'refresh and cutoff workers never claim odds jobs');
      assert.deepEqual(await oddsJobs(), []);
      await runtime.queue.enqueue(oddsImportEnvelope(slot, slotDates[6], 6));
      await drain(runtime.registry, 'ordinary-worker');
      assert.deepEqual((await oddsJobs()).map((job) => job.state), ['pending'], 'ordinary workers leave odds jobs alone');
      const calls = oddsCalls();
      await drain(runtime.odds.registry, 'odds-worker-off');
      assert.deepEqual((await oddsJobs()).map((job) => [job.state, job.terminalReason]), [['expired', 'eligibility-expired']]);
      assert.equal(oddsCalls(), calls); assert.equal(calls, 0);
      assert.equal(await runtime.odds.expire(500), 0, 'write-time staleness runs under the application grants with nothing to stale');
    });
    await t.test('enabled odds spend only enrichment quota above the floor, attributed by receipt, job usage and limiter', { skip: oddsSkip }, async () => {
      oddsRuntime = await createLiveRuntime(parseRuntimePolicy({ ...policyEnv, GOAL_HINT_ODDS_IMPORT_ENABLED: 'true', GOAL_HINT_ODDS_BOOKMAKER_ID: '8' }),
        { fetcher, approvals });
      assert.equal(oddsRuntime.odds.enabled, true); assert.equal(oddsRuntime.odds.horizonDays, 7);
      assert.equal(oddsRuntime.workload.odds.floor, 6639);
      const before = { fixtures: await runtime.database.query((tx) => tx.footballFixture.count()), enrichment: await enrichmentDispatched() };
      assert.equal(before.enrichment, await teamsReceipts(), 'only the team-code sweep has used enrichment priority so far');
      const calls = oddsCalls();
      // The runner's schedule: the day's catalog first, then one sweep per EAT date (one of them already expired above).
      for (const envelope of oddsScheduleEnvelopes(Date.now(), oddsRuntime.odds.horizonDays)) await oddsRuntime.queue.enqueue(envelope);
      await drain(oddsRuntime.odds.registry, 'odds-worker-on');
      const odds = network.filter((entry) => entry.startsWith('/odds')).slice(calls);
      assert.deepEqual(odds.slice(0, 2), ['/odds/bets?', '/odds/bookmakers?'], 'the catalog is claimed before any price sweep');
      assert.equal(odds.filter((entry) => entry.startsWith('/odds?')).length, 6, 'one page per remaining EAT date');
      assert.ok(odds.slice(2).every((entry) => entry === '/odds?bookmaker,date,page'), JSON.stringify(odds));
      const jobs = await oddsJobs();
      assert.deepEqual(jobs.map((job) => job.state).sort(), ['expired', ...Array(7).fill('succeeded')]);
      const stored = await runtime.database.query(async (tx) => ({
        batches: await tx.oddsImportBatch.findMany({ select: { kind: true, status: true, requestsDispatched: true } }),
        usage: await tx.durableJobUsage.findMany({ where: { job: { type: { in: oddsTypes } } }, select: { provider: true, phase: true, requests: true, costReference: true } }),
        enrichment: await tx.apiQuotaAttempt.count({ where: { priority: 3, dispatchedAt: { not: null } } }),
        bets: await tx.oddsBetObservation.count(), snapshots: await tx.providerOddsSnapshot.count(), states: await tx.fixtureOddsState.count(),
        prices: await tx.fixtureOddsPrice.count(), fixtures: await tx.footballFixture.count(),
      }));
      const dispatched = odds.length;
      assert.deepEqual(stored.batches.map((batch) => batch.kind).sort(), ['bets', 'bookmakers', ...Array(6).fill('prices')]);
      assert.ok(stored.batches.every((batch) => batch.status === 'complete'), JSON.stringify(stored.batches));
      // Every odds request is attributed three ways: receipts, durable job usage and enrichment limiter attempts.
      assert.equal(stored.batches.reduce((sum, batch) => sum + batch.requestsDispatched, 0), dispatched);
      assert.equal(stored.usage.reduce((sum, usage) => sum + usage.requests, 0), dispatched);
      assert.ok(stored.usage.every((usage) => usage.provider === 'football' && usage.phase === 'completed' && usage.costReference === null));
      assert.equal(stored.enrichment - before.enrichment, dispatched);
      assert.equal(stored.bets, 5); assert.equal(stored.states, 2); assert.equal(stored.snapshots, 10, 'five bets for each known fixture');
      assert.equal(stored.prices, 0, 'without recorded display rights every price stays private');
      assert.equal(stored.fixtures, before.fixtures, 'an unknown provider fixture is never created');
    });
    await t.test('partly spent ordinary quota leaves the odds spare: the gate counts ordinary use once', { skip: oddsSkip }, async () => {
      assert.ok(oddsRuntime, 'the enabled runtime exists');
      // The provider reports 800 used (a morning of one-minute date polls): remaining 6,700 is below floor 6,639 + one
      // sweep ceiling of 154, which the previous gate refused. Odds have spent only their own few requests.
      statusUsed = 800; await oddsRuntime.quota.refresh();
      assert.ok(await oddsRuntime.quota.remaining() < 6639 + 154);
      const before = network.length, envelope = oddsImportEnvelope(slot, addReportingDays(today, 7), 6);
      await oddsRuntime.queue.enqueue(envelope);
      await drain(oddsRuntime.odds.registry, 'odds-worker-mid-day');
      const job = (await oddsJobs()).find((row) => row.idempotencyKey === envelope.idempotencyKey);
      assert.deepEqual([job.state, job.terminalReason], ['succeeded', 'completed']);
      assert.deepEqual(network.slice(before), ['/odds?bookmaker,date,page'], 'one page for a date without priced fixtures');
      const counters = await oddsRuntime.quota.counters();
      const enrichment = await runtime.database.query((tx) => tx.apiQuotaAttempt.count({ where: { accountId: counters.day.accountId,
        periodId: counters.day.periodId, priority: 3, dispatchedAt: { not: null } } }));
      const receipts = await runtime.database.query((tx) => tx.oddsImportBatch.aggregate({ _sum: { requestsDispatched: true } }));
      assert.equal(enrichment, receipts._sum.requestsDispatched + await teamsReceipts(),
        'the gate reads the shared enrichment spend (odds and team codes) from the limiter ledger their receipts agree with');
    });
    await t.test('past the reserve the odds gate expires the sweep with zero /odds requests', { skip: oddsSkip }, async () => {
      // The provider reports 7,000 used: ordinary work ran past its plan, and 500 left is below the reserve 750 + 154.
      statusUsed = 7000; await oddsRuntime.quota.refresh();
      assert.ok(await oddsRuntime.quota.remaining() <= 500);
      const before = { network: network.length, attempts: await runtime.database.query((tx) => tx.apiQuotaAttempt.count()) };
      const envelope = oddsImportEnvelope(slot, addReportingDays(today, 8), 6);
      await oddsRuntime.queue.enqueue(envelope);
      await drain(oddsRuntime.odds.registry, 'odds-worker-below-reserve');
      const job = (await oddsJobs()).find((row) => row.idempotencyKey === envelope.idempotencyKey);
      assert.deepEqual([job.state, job.terminalReason], ['expired', 'eligibility-expired']);
      assert.equal(network.length, before.network, 'zero provider requests past the reserve');
      assert.equal(await runtime.database.query((tx) => tx.apiQuotaAttempt.count()), before.attempts, 'no quota was reserved');
    });
    await t.test('team codes are on by default on Pro, run only on the enrichment worker and spend nothing past the reserve', async () => {
      assert.equal(runtime.teamCodes.enabled, true, 'default on, and Pro has the odds spare');
      assert.deepEqual(runtime.teamCodes.registry.types.map((entry) => entry.type), [TEAM_CODES_TYPE]);
      assert.deepEqual(runtime.enrichment.registry.types.map((entry) => entry.type), [...oddsTypes, TEAM_CODES_TYPE]);
      assert.ok(runtime.registry.types.every((entry) => entry.type !== TEAM_CODES_TYPE), 'refresh and cutoff workers never claim team-code jobs');
      const off = await createLiveRuntime(parseRuntimePolicy({ ...policyEnv, GOAL_HINT_TEAM_CODES_IMPORT_ENABLED: 'false' }), { fetcher, approvals });
      try { assert.equal(off.teamCodes.enabled, false); } finally { await off.close(); }
      // The live handler reads the shared limiter ledger and the plan allowance. The provider reports 7,000 used: 500
      // left is below the reserve 750 plus the slot's ceiling of 8, so it expires before selection or any provider call.
      // (The queued path through the enrichment worker is the subtest above; this checks the gate on the live counters.)
      const definition = runtime.teamCodes.registry.find(TEAM_CODES_TYPE, TEAM_CODES_HANDLER_VERSION), usages = [];
      const context = { lease: { jobId: hash('team-code-gate-job'), attemptId: hash('team-code-gate-attempt') }, signal: new AbortController().signal,
        remainingMs: () => 9 * 60_000, checkpoint: async () => {}, recordUsage: async (usage) => { usages.push(usage); } };
      statusUsed = 7000; await runtime.quota.refresh();
      assert.ok(await runtime.quota.remaining() <= 500);
      const before = { teams: teamCalls(), attempts: await runtime.database.query((tx) => tx.apiQuotaAttempt.count()) };
      assert.deepEqual(await definition.handle({ slot: latestTeamCodesSlot(Date.now()) }, context),
        { status: 'failed', reason: 'eligibility-expired', retryable: false });
      assert.deepEqual(usages, []);
      assert.equal(teamCalls(), before.teams, 'zero /teams requests past the reserve');
      assert.equal(await runtime.database.query((tx) => tx.apiQuotaAttempt.count()), before.attempts, 'no quota was reserved');
    });
  } finally {
    await oddsRuntime?.close().catch(() => {});
    await runtime?.close().catch(() => {}); await instance.stop();
  }
});
