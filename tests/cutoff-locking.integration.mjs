import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { getReportingDate } from '../src/domain/calendar.ts';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { createDatabase } from '../src/server/database/client.ts';
import { buildEvidenceSnapshot } from '../src/server/evidence/evidence-snapshot.ts';
import { createMysqlEvidenceStore } from '../src/server/evidence/evidence-mysql-store.ts';
import { createFootballCatalogStore } from '../src/server/football/catalog-mysql-store.ts';
import { createFootballCatalogImporter } from '../src/server/football/catalog-service.ts';
import { createMysqlJobQueue } from '../src/server/jobs/job-mysql-store.ts';
import { createJobRegistry } from '../src/server/jobs/job-registry.ts';
import { createJobWorker } from '../src/server/jobs/job-worker.ts';
import { createMysqlModelVersionStore } from '../src/server/predictor/predictor-mysql-store.ts';
import { createMysqlPredictionHistoryStore } from '../src/server/predictions/history-mysql-store.ts';
import { storedCycle } from '../src/server/predictions/history-read.ts';
import { createRevisionPublicationService } from '../src/server/predictions/publication-service.ts';
import { createCutoffJob, createCutoffLockingService } from '../src/server/predictions/cutoff-service.ts';
import { CutoffLockingError } from '../src/server/predictions/cutoff-contract.ts';
import { CUTOFF_JOB_TYPE } from '../src/server/predictions/cutoff-input.ts';
import { createMysqlDailySelectionStore } from '../src/server/selection/selection-mysql-store.ts';
import { createDailySelectionService } from '../src/server/selection/selection-service.ts';
import { catalogFixture, catalogRequest, catalogResponse, createSyntheticCatalogAdapter, CATALOG_NOW } from './helpers/catalog-fixtures.mjs';
import { evidenceContext, evidenceHash, evidenceAuthority, evidencePolicy, evidenceSource } from './helpers/evidence-fixtures.mjs';
import { modelVersion, modelAuthority } from './helpers/predictor-fixtures.mjs';
import { historyCandidate, cycleChange, cycleCreation } from './helpers/prediction-history-fixtures.mjs';
import { jobTestEnvironment } from './helpers/job-fixtures.mjs';
import { selectionPolicy, selectionAuthority, catalogSelectionAuthority, SELECTION_FOR } from './helpers/selection-fixtures.mjs';
import { publicationPolicy, publicationAuthority, publicationInput, PUBLICATION_NOW } from './helpers/publication-fixtures.mjs';
import { cutoffPolicy, cutoffAuthority } from './helpers/cutoff-fixtures.mjs';
import { MysqlServerUnavailableError, startIsolatedMysql } from './helpers/mysql-instance.mjs';

const execute = promisify(execFile), workspace = fileURLToPath(new URL('../', import.meta.url));
const script = fileURLToPath(new URL('../scripts/database.mjs', import.meta.url));
const denied = (reason) => (error) => error instanceof CutoffLockingError && error.reason === reason;
const catalogTables = ['FootballCatalogLock','FootballTeam','FootballTeamProvider','FootballTeamAlias','FootballCompetition',
  'FootballCompetitionProvider','FootballCompetitionAlias','FootballSeason','FootballFixture','FootballFixtureAudit','FootballImport','FootballIdentityReview'];
const appendOnly = ['EvidenceSourceVersion','FixtureEvidenceSnapshot','FixtureEvidenceSnapshotSource','ModelVersion',
  'PredictionSet','MarketPrediction','PredictionSchedule','PredictionAudit','DailyRunManifest',
  'PredictionRefreshResult','PredictionPublicationBarrier','PredictionChangeEvent','PredictionCycleOperation'];
const target = (state) => ({ fixtureId: state.fixture.id, cycleId: state.cycle.id });

test('irreversible cutoff locking on isolated genuine MySQL', { timeout: 300_000 }, async (t) => {
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
      GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES, TRIGGER ON goal_hint_test.* TO 'cutoff_migration'@'127.0.0.1';`);
    try { await execute(process.execPath, ['--conditions=react-server', script, 'deploy'], { cwd: workspace, env, windowsHide: true, timeout: 90_000 }); }
    catch (error) { t.diagnostic((await instance.executeAdmin('SELECT migration_name, LEFT(logs, 1500) FROM _prisma_migrations WHERE finished_at IS NULL')).stdout); throw error; }
    await instance.executeAdmin(catalogTables.map((name) => `GRANT SELECT, INSERT, UPDATE ON goal_hint_test.${name} TO 'cutoff_app'@'127.0.0.1';`).join('\n') +
      appendOnly.map((name) => `GRANT SELECT, INSERT ON goal_hint_test.${name} TO 'cutoff_app'@'127.0.0.1';`).join('\n') + `
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.PredictionCycle TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT ON goal_hint_test.FixtureLifecycleState TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.DailyRun TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE (finishedAt, failure) ON goal_hint_test.DailyRunImport TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE (jobId, jobState, terminalReason) ON goal_hint_test.RunFixture TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE (consumedRunId) ON goal_hint_test.SelectionCycleEligibility TO 'cutoff_app'@'127.0.0.1';
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
    async function cohort(date = '2026-10-09', cutoff = first) {
      if (cohorts.has(date)) return cohorts.get(date);
      const type = `test.cutoff-refresh-${date}`, rawPolicy = selectionPolicy(); rawPolicy.refresh = { ...rawPolicy.refresh, type };
      const rows = Array.from({ length: 30 }, (_, index) => catalogFixture(3000 + index, {
        kickoff: index < 4 ? new Date(PUBLICATION_NOW + 301_000).toISOString()
          : index === 4 ? '2026-10-09T21:03:00Z' : '2026-10-12T12:00:00Z' }));
      const provider = createSyntheticCatalogAdapter({ respond: (url) => catalogResponse(url, rows.filter((row) => getReportingDate(Date.parse(row.fixture.date)) === url.searchParams.get('date'))) });
      const importer = createFootballCatalogImporter({ adapter: provider.adapter, store: catalog, authority: catalogSelectionAuthority, clock: provider.clock });
      const store = createMysqlDailySelectionStore(a, queue), service = createDailySelectionService({ policy: rawPolicy,
        authority: selectionAuthority(), store, importer, cutoff });
      at = CATALOG_NOW;
      let selected;
      try { selected = await service.run(SELECTION_FOR + (Number(date.slice(-2)) - 9) * 86_400_000); } finally { at = PUBLICATION_NOW; }
      const manifest = (await store.inspect(selected.runId)).manifest, leases = new Map();
      for (let index = 0; index < selected.total; index++) {
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
    async function update(state, kickoffAt, observedAt, actualStartedAt = null) {
      return history.withFixtureTransaction(state.fixture.id, async (writer, tx) => {
        const cycle = await storedCycle(tx, state.cycle.id);
        const next = await writer.changeCycle({ ...cycleChange(cycle, {}, randomUUID()), at: observedAt,
          schedule: { kickoffAt, providerObservedAt: observedAt, actualStartedAt } });
        await tx.footballFixture.update({ where: { id: state.fixture.id }, data: { kickoff: new Date(kickoffAt) } });
        return next;
      });
    }
    const totals = (state) => a.query(async (tx) => ({ cycle: await storedCycle(tx, state.cycle.id),
      operations: await tx.predictionCycleOperation.count({ where: target(state) }),
      events: await tx.predictionChangeEvent.count({ where: { fixtureId: state.fixture.id } }),
      version: (await tx.footballFixture.findUniqueOrThrow({ where: { id: state.fixture.id } })).dataVersion }));

    await t.test('migration and least-privilege native constraints are verified on MySQL', async () => {
      await execute(process.execPath, ['--conditions=react-server', script, 'verify'], { cwd: workspace, env, windowsHide: true, timeout: 60_000 });
      const rows = await a.query((tx) => tx.$queryRaw`SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PredictionCycleOperation'`);
      assert.equal(rows[0].ENGINE, 'InnoDB');
      await assert.rejects(a.query((tx) => tx.$executeRaw`CREATE TABLE forbidden_cutoff (id INT)`));
      await assert.rejects(a.query((tx) => tx.$executeRaw`DELETE FROM PredictionCycleOperation`));
      await assert.rejects(a.query((tx) => tx.$executeRaw`INSERT INTO PredictionChangeEvent (fixtureId, version, kind, at)
        VALUES ('10000000-0000-4000-8000-000000000001', 1, 'cycle-closed', UTC_TIMESTAMP(3))`));
    });
    await t.test('daily selection schedules one stable cutoff job per eligible cycle and replay does not duplicate jobs', async () => {
      await assert.rejects(cohort('2026-10-09', { scheduleRun: async (runId) => {
        const entry = await a.query((tx) => tx.runFixture.findFirstOrThrow({ where: { runId }, orderBy: { rank: 'asc' },
          select: { fixtureId: true, cycleId: true } }));
        await first.scheduleCycle(entry); throw new Error('synthetic-crash-after-cutoff-prefix');
      } }), /synthetic-crash-after-cutoff-prefix/);
      assert.equal(await a.query((tx) => tx.durableJob.count({ where: { type: CUTOFF_JOB_TYPE } })), 1);
      const selected = await cohort();
      assert.equal(selected.selected.total, 30);
      assert.equal(selected.provider.network.length, 0);
      assert.equal(await a.query((tx) => tx.durableJob.count({ where: { type: CUTOFF_JOB_TYPE } })), 30);
      at = CATALOG_NOW; await selected.service.run(SELECTION_FOR); at = PUBLICATION_NOW;
      assert.equal(await a.query((tx) => tx.durableJob.count({ where: { type: CUTOFF_JOB_TYPE } })), 30);
      assert.equal(await queue.claim(evidenceHash('not-yet-due'), [{ type: CUTOFF_JOB_TYPE, handlerVersion: 1 }]), null);
      for (const entry of selected.manifest.entries) {
        const cycle = await history.findCycle(entry.cycleId), job = await first.scheduleCycle({ fixtureId: entry.fixtureId, cycleId: cycle.id });
        assert.equal(job.envelope.notBefore, cycle.cutoffAt); assert.equal(job.envelope.refresh, null);
      }
    });
    await t.test('just before cutoff refuses; exactly at cutoff duplicates establish one immutable lock', async () => {
      const state = await setup(3000), published = await publisher.publish(state.input, state.lease);
      const before = await totals(state);
      at = state.cycle.cutoffAt - 1;
      await assert.rejects(first.close(target(state)), denied('not-due'));
      assert.deepEqual(await totals(state), before);
      at = state.cycle.cutoffAt;
      const results = await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? first : second).close(target(state))));
      assert.ok(results.every((value) => value.operation.id === results[0].operation.id));
      assert.deepEqual(results[0].revision, published.revision);
      assert.equal(results[0].operation.cycle.closedAt, state.cycle.cutoffAt);
      assert.equal(results[0].operation.cycle.lockedAt, at);
      assert.equal((await totals(state)).operations, 1);
      at++; assert.deepEqual(await second.close(target(state)), results[0]);
      const events = await publisher.changesForFixture(state.fixture.id);
      assert.deepEqual(events.map((event) => event.kind), ['revision-published', 'cycle-closed']);
      assert.ok(events[1].version > events[0].version);
      assert.equal((await publisher.displayForFixture(state.fixture.id)).mode, 'locked');
    });
    await t.test('publication exactly at and after cutoff cannot win even before a lock job runs', async () => {
      for (const [id, offset] of [[3001, 0], [3002, 1]]) {
        at = PUBLICATION_NOW; const state = await setup(id); at = state.cycle.cutoffAt + offset;
        const published = await publisher.publish(state.input, state.lease);
        assert.equal(published.refresh.reason, 'cutoff-passed');
        const closed = await first.close(target(state));
        assert.equal(closed.revision, null); assert.equal(closed.operation.cycle.lockedAt, null);
        assert.equal((await publisher.displayForFixture(state.fixture.id)).revision, null);
      }
    });
    await t.test('an earlier-day forecast survives a late early-morning lock without a newer completed refresh', async () => {
      at = PUBLICATION_NOW; const state = await setup(3004), published = await publisher.publish(state.input, state.lease);
      assert.equal(published.revision.runSequence, 20261009n);
      assert.equal(getReportingDate(state.cycle.kickoffAt), '2026-10-10');
      at = Date.parse('2026-10-10T00:30:00Z');
      const closed = await second.close(target(state));
      assert.deepEqual(closed.revision, published.revision);
      assert.equal(closed.operation.cycle.closedAt, Date.parse('2026-10-09T20:58:00Z'));
      assert.equal(closed.operation.cycle.lockedAt, at);
      assert.deepEqual(closed.revision.candidate, published.revision.candidate);
    });
    await t.test('early play immediately closes through the same operation and later scheduled evidence cannot reopen', async () => {
      at = PUBLICATION_NOW; const state = await setup(3005), published = await publisher.publish(state.input, state.lease);
      const observation = { ...state.input.observation, status: 'live', actualStartedAt: at + 1, retrievedAt: at + 2 };
      at += 2; const closed = await first.closeObservedPlay(observation);
      assert.equal(closed.operation.reason, 'early-play'); assert.equal(closed.operation.cycle.closedAt, observation.actualStartedAt);
      assert.deepEqual(closed.revision, published.revision);
      assert.deepEqual(await second.closeObservedPlay({ ...observation, retrievedAt: at + 1 }), closed);
      await assert.rejects(history.withFixtureTransaction(state.fixture.id, (writer) => writer.changeCycle({
        ...cycleChange(closed.operation.cycle, { state: 'open', closedAt: null, lockedAt: null, lockedSetId: null }, 'forbidden-reopen'), at })),
      (error) => error.reason === 'closed-cycle');
      assert.deepEqual(await publisher.publish(state.input, state.lease), published);
      at = PUBLICATION_NOW;
      const observed = await setup(3016);
      assert.equal((await publisher.publish({ ...observed.input, observation: { ...observed.input.observation, status: 'live' } }, observed.lease)).refresh.reason, 'early-play');
      at += 10;
      const delayed = await first.close(target(observed));
      assert.equal(delayed.operation.reason, 'early-play');
      assert.equal(delayed.operation.cycle.closedAt, observed.input.observation.retrievedAt);
    });
    await t.test('an early-start correction can close with no prediction instead of locking an ineligible current pointer', async () => {
      at = PUBLICATION_NOW; const state = await setup(3006), published = await publisher.publish(state.input, state.lease);
      at += 1;
      const closed = await first.closeObservedPlay({ ...state.input.observation, status: 'live', actualStartedAt: published.revision.publishedAt, retrievedAt: at });
      assert.equal(closed.revision, null); assert.equal(closed.operation.cycle.currentSetId, published.revision.id);
      assert.equal(closed.operation.cycle.lockedSetId, null);
      assert.equal((await history.displayForFixture(state.fixture.id)).revision, null);
    });
    await t.test('late locking scans accepted history and skips the newest revision invalidated by an earlier cutoff', async () => {
      at = PUBLICATION_NOW; const state = await setup(3007, '2026-10-08');
      const old = await publisher.publish(state.input, state.lease);
      const next = await setup(3007); at = PUBLICATION_NOW + 2;
      const newer = await publisher.publish(next.input, next.lease);
      at = PUBLICATION_NOW + 10;
      await update(state, PUBLICATION_NOW + 300_001, at);
      const closed = await first.close(target(state));
      assert.equal(closed.operation.cycle.currentSetId, newer.revision.id);
      assert.equal(closed.revision.id, old.revision.id);
      assert.equal(closed.operation.cycle.closedAt, PUBLICATION_NOW + 1);
      assert.deepEqual(closed.revision, old.revision);
    });
    await t.test('stored actual-start evidence and final scores do not influence which eligible pick is selected', async () => {
      at = PUBLICATION_NOW; const state = await setup(3008, '2026-10-08');
      const earlier = await publisher.publish(state.input, state.lease), newer = await setup(3008);
      newer.input.candidate = historyCandidate({ snapshot: newer.snapshot, model, jobId: newer.lease.jobId, probabilities: {
        'match-result': { period: 'regulation-including-stoppage-time', probabilities: { 'home-win': 0.1, draw: 0.2, 'away-win': 0.7 } },
        'total-goals': null, 'both-teams-to-score': null } });
      at += 2; const published = await publisher.publish(newer.input, newer.lease);
      assert.equal(earlier.revision.candidate.markets['match-result'].market.selection, 'home-win');
      assert.equal(published.revision.candidate.markets['match-result'].market.selection, 'away-win');
      at = state.cycle.kickoffAt + 600_000;
      await update(state, state.cycle.kickoffAt, at, state.cycle.kickoffAt - 600_000);
      await a.transaction((tx) => tx.footballFixture.update({ where: { id: state.fixture.id }, data: {
        status: 'finished-regulation', retrievedAt: new Date(at), regulationHome: 8, regulationAway: 0,
        regulationEvidenceRef: 'synthetic-final-proof', regulationVerifiedAt: new Date(at) } }));
      const closed = await first.close(target(state)); assert.deepEqual(closed.revision, published.revision);
      await a.transaction((tx) => tx.footballFixture.update({ where: { id: state.fixture.id }, data: { regulationHome: 0, regulationAway: 8 } }));
      at += 86_400_000; assert.deepEqual(await second.close(target(state)), closed);
    });
    await t.test('a cutoff reached before a delayed postponement of kickoff cannot be extended by schedule history', async () => {
      at = PUBLICATION_NOW; const state = await setup(3009), published = await publisher.publish(state.input, state.lease);
      at = state.cycle.cutoffAt + 1;
      await update(state, state.cycle.kickoffAt + 86_400_000, at);
      const closed = await first.close(target(state));
      assert.equal(closed.operation.reason, 'schedule-history-cutoff');
      assert.equal(closed.operation.cycle.closedAt, state.cycle.cutoffAt);
      assert.deepEqual(closed.revision, published.revision);
    });
    await t.test('schedule update wins the shared lock; old close jobs requeue the accepted cutoff instead of closing early', async () => {
      at = PUBLICATION_NOW; const state = await setup(3003);
      const job = await first.scheduleCycle(target(state)), original = state.cycle;
      await update(state, state.cycle.kickoffAt + 86_400_000, at);
      at = original.cutoffAt;
      const lease = await queue.claim(evidenceHash('old-cutoff-delivery'), [{ type: CUTOFF_JOB_TYPE, handlerVersion: 1 }]);
      assert.ok(lease);
      // A claimed sibling may have the same deadline. Claim until this exact cycle is reached.
      let current = lease;
      while (current.jobId !== job.id) {
        await first.close(current.job.envelope.payload.fixtureId === state.fixture.id ? target(state) :
          { fixtureId: current.job.envelope.payload.fixtureId, cycleId: current.job.envelope.payload.cycleId }, current);
        await queue.acknowledge(current);
        current = await queue.claim(evidenceHash(randomUUID()), [{ type: CUTOFF_JOB_TYPE, handlerVersion: 1 }]); assert.ok(current);
      }
      const definition = createCutoffJob(first);
      assert.deepEqual(await definition.handle(current.job.envelope.payload, { lease: current, signal: new AbortController().signal }), { status: 'succeeded' });
      await queue.acknowledge(current);
      const cycle = await history.findCycle(state.cycle.id);
      assert.equal(cycle.state, 'open'); assert.equal(cycle.scheduleVersion, 2);
      const replacement = await first.scheduleCycle(target(state)); assert.notEqual(replacement.id, job.id);
      assert.equal(replacement.envelope.notBefore, cycle.cutoffAt);
    });
    await t.test('publication wins before cutoff and a competing lock sees its committed revision', async () => {
      at = PUBLICATION_NOW; const state = await setup(3010); await update(state, at + 300_001, at);
      const refreshed = await setup(3010); let entered, release, calls = 0;
      const began = new Promise((resolve) => { entered = resolve; }), gate = new Promise((resolve) => { release = resolve; });
      const controlled = createRevisionPublicationService({ database: a, policy: publicationPolicy(), authority: publicationAuthority(),
        queue: { assertOwned: async (tx, lease) => { if (++calls === 2) { entered(); await gate; } return queue.assertOwned(tx, lease); } } });
      const pending = controlled.publish(refreshed.input, refreshed.lease); await began;
      const closingDb = replica(() => PUBLICATION_NOW + 1), closing = locker(closingDb).close(target(state));
      release(); const published = await pending, closed = await closing;
      assert.deepEqual(closed.revision, published.revision);
    });
    await t.test('closure wins the shared lock and publication cannot replace a closed snapshot', async () => {
      at = PUBLICATION_NOW; const state = await setup(3011);
      let entered, release;
      const began = new Promise((resolve) => { entered = resolve; }), gate = new Promise((resolve) => { release = resolve; });
      const clockDb = replica(() => state.cycle.cutoffAt);
      at = state.cycle.cutoffAt;
      const scheduled = await first.scheduleCycle(target(state));
      // Close synchronously with an authority proof gate held under the fixture lock.
      const closing = locker(clockDb, { authority: cutoffAuthority({ verifyPolicy: () => true }) });
      const held = createMysqlPredictionHistoryStore(clockDb).withFixtureTransaction(state.fixture.id, async () => { entered(); await gate; });
      await began; const lock = closing.close(target(state));
      const publication = publisher.publish(state.input, state.lease); release(); await held;
      const [closed, refused] = await Promise.all([lock, publication]);
      assert.equal(closed.revision, null); assert.ok(['closed-cycle','cutoff-passed'].includes(refused.refresh.reason));
      assert.ok(scheduled); assert.equal((await history.findCycle(state.cycle.id)).state, 'closed');
    });
    await t.test('failed closure rolls all state/events back; ambiguous committed responses and restart return the original lock', async () => {
      at = PUBLICATION_NOW; const state = await setup(3012); const published = await publisher.publish(state.input, state.lease);
      at = state.cycle.cutoffAt; const before = await totals(state); let checks = 0;
      const failing = locker(a, { authority: cutoffAuthority({ verifyPolicy: () => ++checks < 2 }) });
      await assert.rejects(failing.close(target(state)), denied('unauthorized'));
      assert.deepEqual(await totals(state), before);
      await assert.rejects(locker(a, { authority: cutoffAuthority({ verifyPolicy: async () => true }) }).close(target(state)), denied('unauthorized'));
      assert.deepEqual(await totals(state), before);
      let lost = true;
      const uncertainDb = replica(() => at, () => { if (lost) { lost = false; throw new Error('synthetic-response-lost-after-commit'); } });
      await assert.rejects(locker(uncertainDb).close(target(state)), denied('unavailable'));
      const recovered = await second.close(target(state)); assert.deepEqual(recovered.revision, published.revision);
      const after = await totals(state); at += 86_400_000;
      assert.deepEqual(await locker(replica()).close(target(state)), recovered); assert.deepEqual(await totals(state), after);
    });
    await t.test('audited void preserves the locked snapshot and duplicate corrections never substitute another pick', async () => {
      at = PUBLICATION_NOW; const state = await setup(3013), published = await publisher.publish(state.input, state.lease);
      at = state.cycle.cutoffAt; const closed = await first.close(target(state)); at += 10;
      const action = { ...target(state), actor: 'synthetic-schedule-coordinator', reason: 'Earlier actual start invalidated this lock', evidenceRef: 'synthetic-start-correction-proof' };
      await assert.rejects(locker(a, { authority: cutoffAuthority({ verifyVoid: () => false }) }).voidLockedCycle(action), denied('unauthorized'));
      const values = await Promise.all([first.voidLockedCycle(action), second.voidLockedCycle(action)]);
      assert.deepEqual(values[0], values[1]); assert.deepEqual(values[0].revision, published.revision);
      assert.equal(values[0].operation.cycle.lockedAt, closed.operation.cycle.lockedAt);
      assert.equal(values[0].operation.cycle.closedAt, closed.operation.cycle.closedAt);
      assert.equal((await publisher.displayForFixture(state.fixture.id)).mode, 'void');
      const events = await publisher.changesForFixture(state.fixture.id);
      assert.deepEqual(events.map((event) => event.kind), ['revision-published','cycle-closed','cycle-voided']);
      assert.deepEqual(await second.close(target(state)), closed);
      const otherFixture = await catalog.fixtureByProviderId(3000);
      await assert.rejects(first.close({ fixtureId: otherFixture.id, cycleId: state.cycle.id }), denied('wrong-cycle'));
      await assert.rejects(history.withFixtureTransaction(state.fixture.id, (writer) => writer.changeCycle({
        ...cycleChange(values[0].operation.cycle, { lockedSetId: null, lockedAt: null }, 'forbidden-substitution'), at })),
      (error) => error.reason === 'closed-cycle');
      await assert.rejects(a.query((tx) => tx.$executeRaw`UPDATE PredictionCycleOperation SET kind = 'close' WHERE cycleId = ${state.cycle.id}`));
    });
    await t.test('a durable close handler runs after downtime and verified recovery remains idempotent', async () => {
      at = PUBLICATION_NOW; const state = await setup(3014); await publisher.publish(state.input, state.lease);
      at = state.cycle.cutoffAt + 86_400_000;
      const registry = createJobRegistry([createCutoffJob(first)]), worker = createJobWorker({ queue, registry, ownerId: evidenceHash('delayed-close-worker') });
      // Drain due sibling close jobs through the real registry/worker, never another prediction job.
      for (let count = 0; count < 40 && (await history.findCycle(state.cycle.id)).state === 'open'; count++) assert.equal(await worker.runOnce(), true);
      assert.equal((await history.findCycle(state.cycle.id)).state, 'closed');
      const job = await queue.inspect((await first.scheduleCycle(target(state)))?.id ??
        (await a.query((tx) => tx.durableJob.findMany({ where: { type: CUTOFF_JOB_TYPE } }))).find((row) => row.envelopeJson.payload.cycleId === state.cycle.id).id);
      assert.equal(job.state, 'succeeded');
      // Create a newly discovered internal cycle after draining earlier jobs.
      at = PUBLICATION_NOW;
      const provider = createSyntheticCatalogAdapter({ rows: [catalogFixture(3100)] });
      const importer = createFootballCatalogImporter({ adapter: provider.adapter, store: catalog,
        authority: catalogSelectionAuthority, clock: provider.clock });
      await importer.import(catalogRequest({ kind: 'fixtures', query: { fixtureId: 3100 } }));
      const fixture = await catalog.fixtureByProviderId(3100);
      const cycle = await history.createCycle(cycleCreation(fixture));
      const fresh = { fixture, cycle };
      const recovery = { ...target(fresh), recoveryKey: evidenceHash('verified-recovery'), actor: 'synthetic-recovery',
        reason: 'Recover bounded exhausted close work', evidenceRef: 'synthetic-recovery-proof' };
      await assert.rejects(locker(a, { authority: cutoffAuthority({ verifyRecovery: () => false }) }).recoverCycle(recovery), denied('unauthorized'));
      const recovered = await first.recoverCycle(recovery); assert.equal(recovered.id, (await second.recoverCycle(recovery)).id);
      assert.equal(recovered.state, 'pending');
    });
    await t.test('expired owned delivery cannot commit provisional closure and can be recovered under a new fence', async () => {
      const fixture = await catalog.fixtureByProviderId(3100);
      const active = await a.query((tx) => tx.footballFixture.findUniqueOrThrow({ where: { id: fixture.id }, select: { activeCycleId: true } }));
      const cycle = await history.findCycle(active.activeCycleId), fresh = { fixture, cycle };
      at = cycle.cutoffAt;
      let lease = await queue.claim(evidenceHash('expiring-close-owner'), [{ type: CUTOFF_JOB_TYPE, handlerVersion: 1 }]);
      assert.ok(lease);
      while (lease.job.envelope.payload.cycleId !== cycle.id) {
        await first.close({ fixtureId: lease.job.envelope.payload.fixtureId, cycleId: lease.job.envelope.payload.cycleId }, lease);
        await queue.acknowledge(lease);
        lease = await queue.claim(evidenceHash(randomUUID()), [{ type: CUTOFF_JOB_TYPE, handlerVersion: 1 }]); assert.ok(lease);
      }
      const before = await totals(fresh); let checks = 0;
      const stale = locker(a, { queue: { ...queue, assertOwned: async (tx, owned) => {
        if (++checks === 2) await tx.$executeRawUnsafe(`SET timestamp = ${owned.leaseExpiresAt / 1000}`);
        return queue.assertOwned(tx, owned);
      } } });
      await assert.rejects(stale.close(target(fresh), lease), denied('lost-lease'));
      assert.deepEqual(await totals(fresh), before);
      at = lease.leaseExpiresAt;
      assert.equal(await queue.claim(evidenceHash('lease-reaper'), [{ type: CUTOFF_JOB_TYPE, handlerVersion: 1 }]), null);
      at += 1000;
      const next = await otherQueue.claim(evidenceHash('recovered-close-owner'), [{ type: CUTOFF_JOB_TYPE, handlerVersion: 1 }]);
      assert.ok(next); assert.ok(next.fence > lease.fence);
      const closed = await second.close(target(fresh), next);
      assert.equal(closed.operation.cycle.state, 'closed');
      await otherQueue.acknowledge(next);
    });
  } finally {
    await Promise.all(databases.map((database) => database.disconnect().catch(() => {}))); await instance.stop();
  }
});
