import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { getReportingDate } from '../src/domain/calendar.ts';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { createDatabase } from '../src/server/database/client.ts';
import { buildEvidenceSnapshot } from '../src/server/evidence/evidence-snapshot.ts';
import { createMysqlEvidenceStore } from '../src/server/evidence/evidence-mysql-store.ts';
import { createFootballCatalogStore } from '../src/server/football/catalog-mysql-store.ts';
import { createFootballCatalogImporter } from '../src/server/football/catalog-service.ts';
import { createMysqlJobQueue } from '../src/server/jobs/job-mysql-store.ts';
import { createMysqlModelVersionStore } from '../src/server/predictor/predictor-mysql-store.ts';
import { createMysqlPredictionHistoryStore } from '../src/server/predictions/history-mysql-store.ts';
import { storedCycle } from '../src/server/predictions/history-read.ts';
import { createRevisionPublicationService } from '../src/server/predictions/publication-service.ts';
import { createCutoffLockingService } from '../src/server/predictions/cutoff-service.ts';
import { createMysqlDailySelectionStore } from '../src/server/selection/selection-mysql-store.ts';
import { createDailySelectionService } from '../src/server/selection/selection-service.ts';
import { catalogFixture, catalogResponse, createSyntheticCatalogAdapter, CATALOG_NOW } from './helpers/catalog-fixtures.mjs';
import { evidenceContext, evidenceHash, evidenceAuthority, evidencePolicy, evidenceSource } from './helpers/evidence-fixtures.mjs';
import { modelVersion, modelAuthority } from './helpers/predictor-fixtures.mjs';
import { historyCandidate } from './helpers/prediction-history-fixtures.mjs';
import { jobTestEnvironment } from './helpers/job-fixtures.mjs';
import { selectionPolicy, selectionAuthority, catalogSelectionAuthority, SELECTION_FOR } from './helpers/selection-fixtures.mjs';
import { publicationPolicy, publicationAuthority, publicationInput, PUBLICATION_NOW } from './helpers/publication-fixtures.mjs';
import { cutoffPolicy, cutoffAuthority } from './helpers/cutoff-fixtures.mjs';
import { MysqlServerUnavailableError, startIsolatedMysql } from './helpers/mysql-instance.mjs';

const execute = promisify(execFile), workspace = fileURLToPath(new URL('../', import.meta.url));
const script = fileURLToPath(new URL('../scripts/database.mjs', import.meta.url));
const catalogTables = ['FootballCatalogLock','FootballTeam','FootballTeamProvider','FootballTeamAlias','FootballCompetition',
  'FootballCompetitionProvider','FootballCompetitionAlias','FootballSeason','FootballFixture','FootballFixtureAudit','FootballImport','FootballIdentityReview'];
const appendOnly = ['EvidenceSourceVersion','FixtureEvidenceSnapshot','FixtureEvidenceSnapshotSource','ModelVersion',
  'PredictionSet','MarketPrediction','PredictionSchedule','PredictionAudit','DailyRunManifest',
  'PredictionRefreshResult','PredictionPublicationBarrier','PredictionChangeEvent','PredictionCycleOperation','FixtureLifecycleObservation',
  'PredictionRefreshIntent','PredictionRefreshStage','PredictionRefreshOutcome','DurableJobUsage',
  'FixtureResult','ResultProviderObservation','SettlementBatch','MarketSettlementRevision','SettlementEventReceipt'];
const target = (state) => ({ fixtureId: state.fixture.id, cycleId: state.cycle.id });

export async function withPredictionPipeline(t, operation) {
  let instance;
  try { instance = await startIsolatedMysql(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(`${error.message} Cutoff acceptance remains pending.`); return; }
  t.diagnostic(`Owned MySQL ${instance.version}; synthetic policies, clocks and forecasts, no provider calls.`);
  const migrationPassword = randomBytes(24).toString('hex'), appPassword = randomBytes(24).toString('hex');
  const env = jobTestEnvironment(`mysql://cutoff_app:${appPassword}@127.0.0.1:${instance.port}/goal_hint_test`,
    `mysql://cutoff_migration:${migrationPassword}@127.0.0.1:${instance.port}/goal_hint_test`);
  const databases = []; let at = PUBLICATION_NOW;
  function replica(clock = () => at, afterCommit) {
    const base = createDatabase(parseRuntimePolicy(env)); databases.push(base);
    return { query: base.query.bind(base), transaction: async (operation, options) => {
      const result = await base.transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET timestamp = ${clock() / 1000}`);
        try { return await operation(tx); } finally { await tx.$executeRawUnsafe('SET timestamp = 0'); }
      }, options);
      if (afterCommit) await afterCommit(); return result;
    } };
  }
  try {
    await instance.executeAdmin(`CREATE USER 'cutoff_migration'@'127.0.0.1' IDENTIFIED BY '${migrationPassword}';
      CREATE USER 'cutoff_app'@'127.0.0.1' IDENTIFIED BY '${appPassword}';
      GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES ON goal_hint_test.* TO 'cutoff_migration'@'127.0.0.1';`);
    try { await execute(process.execPath, ['--conditions=react-server', script, 'deploy'], { cwd: workspace, env, windowsHide: true, timeout: 90_000 }); }
    catch (error) { t.diagnostic((await instance.executeAdmin('SELECT migration_name, LEFT(logs, 1500) FROM _prisma_migrations WHERE finished_at IS NULL')).stdout); throw error; }
    await instance.executeAdmin(catalogTables.map((name) => `GRANT SELECT, INSERT, UPDATE ON goal_hint_test.${name} TO 'cutoff_app'@'127.0.0.1';`).join('\n') +
      appendOnly.map((name) => `GRANT SELECT, INSERT ON goal_hint_test.${name} TO 'cutoff_app'@'127.0.0.1';`).join('\n') + `
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.PredictionCycle TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.FixtureLifecycleState TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.ResultPollerLease TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.FixtureResultState TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE (revisionId) ON goal_hint_test.MarketSettlement TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE (completedAt) ON goal_hint_test.ResultSyncBatch TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.ApiQuotaAccount TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.DailyRun TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE (finishedAt, failure) ON goal_hint_test.DailyRunImport TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE (jobId, jobState, terminalReason) ON goal_hint_test.RunFixture TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE (consumedRunId, previousVersion, kickoffAt, state, actor, evidenceRef, recordedAt, eligibleAfter) ON goal_hint_test.SelectionCycleEligibility TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.DurableJob TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, UPDATE ON goal_hint_test.DurableJobEnqueueLock TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.DurableJobAttempt TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.DurableJobEvent TO 'cutoff_app'@'127.0.0.1';`);
    const a = replica(), b = replica(), catalog = createFootballCatalogStore(a), history = createMysqlPredictionHistoryStore(a);
    const queue = createMysqlJobQueue(a), otherQueue = createMysqlJobQueue(b), model = modelVersion();
    await createMysqlModelVersionStore(a).save(model, modelAuthority());
    const locker = (database = a, overrides = {}) => createCutoffLockingService({ database,
      queue: database === b ? otherQueue : queue, policy: cutoffPolicy(), authority: cutoffAuthority(), ...overrides });
    const first = locker(), second = locker(b), publisher = createRevisionPublicationService({ database: a, queue,
      policy: publicationPolicy(), authority: publicationAuthority() });
    const cohorts = new Map();
    async function cohort(date = '2026-10-09', cutoff = first, options = {}) {
      if (cohorts.has(date)) return cohorts.get(date);
      const type = options.refresh?.type ?? `test.cutoff-refresh-${date}`, rawPolicy = selectionPolicy(); rawPolicy.refresh = { ...rawPolicy.refresh, type, ...options.refresh };
      const rows = options.rows ?? Array.from({ length: 30 }, (_, index) => catalogFixture(3000 + index, {
        kickoff: index < 4 ? new Date(PUBLICATION_NOW + 301_000).toISOString()
          : index === 4 ? '2026-10-09T21:03:00Z' : '2026-10-12T12:00:00Z' }));
      const provider = createSyntheticCatalogAdapter({ respond: (url) => catalogResponse(url, rows.filter((row) => getReportingDate(Date.parse(row.fixture.date)) === url.searchParams.get('date'))) });
      const importer = createFootballCatalogImporter({ adapter: provider.adapter, store: catalog, authority: catalogSelectionAuthority, clock: provider.clock });
      const store = createMysqlDailySelectionStore(a, queue), service = createDailySelectionService({ policy: rawPolicy,
        authority: selectionAuthority(), store, importer, cutoff });
      at = options.selectionAt ?? CATALOG_NOW;
      provider.clock.value = at;
      let selected;
      try { selected = await service.run(SELECTION_FOR + (Number(date.slice(-2)) - 9) * 86_400_000); } finally { at = options.afterSelectionAt ?? PUBLICATION_NOW; }
      const manifest = (await store.inspect(selected.runId)).manifest, leases = new Map();
      for (let index = 0; options.claim !== false && index < selected.total; index++) {
        const lease = await queue.claim(evidenceHash(`cutoff-owner:${type}:${index}`), [{ type, handlerVersion: 1 }]);
        assert.ok(lease); leases.set(lease.job.envelope.refresh.fixtureId, lease);
      }
      const value = { selected, manifest, leases, service, provider }; cohorts.set(date, value); return value;
    }
    async function setup(id, date = '2026-10-09') {
      const selected = await cohort(date), fixture = await catalog.fixtureByProviderId(id);
      const entry = selected.manifest.entries.find((item) => item.fixtureId === fixture.id), cycle = await history.findCycle(entry.cycleId);
      const lease = selected.leases.get(fixture.id), context = evidenceContext(fixture, { runId: selected.selected.runId, cycleId: cycle.id });
      const authority = evidenceAuthority(), snapshot = buildEvidenceSnapshot({ context, policy: evidencePolicy(), sources: [evidenceSource(context)] }, authority);
      const evidenceId = evidenceHash(randomUUID()); await createMysqlEvidenceStore(a).save(evidenceId, evidenceHash(`request:${evidenceId}`), snapshot, authority);
      const input = publicationInput(historyCandidate({ snapshot, model, jobId: lease.jobId }), evidenceId, cycle.scheduleVersion);
      return { fixture, cycle, input, lease, selected, snapshot };
    }
    const totals = (state) => a.query(async (tx) => ({ cycle: await storedCycle(tx, state.cycle.id),
      operations: await tx.predictionCycleOperation.count({ where: target(state) }),
      events: await tx.predictionChangeEvent.count({ where: { fixtureId: state.fixture.id } }),
      version: (await tx.footballFixture.findUniqueOrThrow({ where: { id: state.fixture.id } })).dataVersion }));

    await operation({ a, b, queue, otherQueue, catalog, history, publisher, first, second, replica, env, instance,
      setup, cohort, totals, target, setTime(value) { at = value; }, now() { return at; } });
  } finally {
    await Promise.all(databases.map((db) => db.disconnect().catch(() => {}))); await instance.stop();
  }
}
