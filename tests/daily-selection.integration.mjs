import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';
import { getReportingDate } from '../src/domain/calendar.ts';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { createDatabase } from '../src/server/database/client.ts';
import { createFootballCatalogStore } from '../src/server/football/catalog-mysql-store.ts';
import { createFootballCatalogImporter } from '../src/server/football/catalog-service.ts';
import { createMysqlJobQueue } from '../src/server/jobs/job-mysql-store.ts';
import { createMysqlPredictionHistoryStore } from '../src/server/predictions/history-mysql-store.ts';
import { DailySelectionError } from '../src/server/selection/selection-contract.ts';
import { parseSelectionPolicy, selectionWindow } from '../src/server/selection/selection-input.ts';
import { createMysqlDailySelectionStore } from '../src/server/selection/selection-mysql-store.ts';
import { selectionDateState } from '../src/server/selection/selection-read.ts';
import { createDailySelectionService } from '../src/server/selection/selection-service.ts';
import { catalogFixture as rawCatalogFixture, catalogRequest, catalogResponse, createSyntheticCatalogAdapter } from './helpers/catalog-fixtures.mjs';
import { jobTestEnvironment } from './helpers/job-fixtures.mjs';
import { selectionPolicy, selectionAuthority, catalogSelectionAuthority, degradedAction, selectionHash, SELECTION_FOR } from './helpers/selection-fixtures.mjs';
import { MysqlServerUnavailableError, startIsolatedMysql } from './helpers/mysql-instance.mjs';

const execute = promisify(execFile), workspace = fileURLToPath(new URL('../', import.meta.url));
const script = fileURLToPath(new URL('../scripts/database.mjs', import.meta.url));
const denied = (reason) => (error) => error instanceof DailySelectionError && error.reason === reason;
// Import receipts and audits are append-only, matching the application role.
const catalogAppendOnly = ['FootballFixtureAudit', 'FootballImport'];
const catalogTables = ['FootballCatalogLock','FootballTeam','FootballTeamProvider','FootballTeamAlias','FootballCompetition',
  'FootballCompetitionProvider','FootballCompetitionAlias','FootballSeason','FootballFixture','FootballIdentityReview', ...catalogAppendOnly];
const day = 86_400_000;
const occurrence = (offset) => SELECTION_FOR + offset * day;
const kickoff = (offset, hours = 12) => new Date(occurrence(offset) + hours * 3_600_000).toISOString();
const actor = { actor: 'synthetic-lifecycle', reason: 'Synthetic formal lifecycle decision', evidenceRef: 'synthetic-formal-lifecycle-proof' };
const catalogFixture = (id, options = {}) => rawCatalogFixture(id, { competitionId: id < 1100 ? 39 : Math.floor(id / 100) + 30, ...options });
const policyFor = (rows) => selectionPolicy({ competitionIds: [rows[0]?.league.id ?? 39] });

test('daily selection manifests and recovery on isolated genuine MySQL', { timeout: 300_000 }, async (t) => {
  let instance;
  try { instance = await startIsolatedMysql(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(`${error.message} Selection acceptance remains pending.`); return; }
  t.diagnostic(`Owned server: ${instance.version}. Synthetic provider data/permissions; no network provider requests.`);
  const migrationPassword = randomBytes(24).toString('hex'), applicationPassword = randomBytes(24).toString('hex');
  const env = jobTestEnvironment(`mysql://selection_app:${applicationPassword}@127.0.0.1:${instance.port}/goal_hint_test`,
    `mysql://selection_migration:${migrationPassword}@127.0.0.1:${instance.port}/goal_hint_test`);
  const databases = [];
  const replica = () => { const db = createDatabase(parseRuntimePolicy(env)); databases.push(db); return db; };
  try {
    await instance.executeAdmin(`CREATE USER 'selection_app'@'127.0.0.1' IDENTIFIED BY '${applicationPassword}';
      CREATE USER 'selection_migration'@'127.0.0.1' IDENTIFIED BY '${migrationPassword}';
      GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES, TRIGGER ON goal_hint_test.* TO 'selection_migration'@'127.0.0.1';`);
    try { await execute(process.execPath, ['--conditions=react-server', script, 'deploy'], { cwd: workspace, env, windowsHide: true, timeout: 90_000 }); }
    catch (error) {
      const diagnostic = await instance.executeAdmin("SELECT migration_name, LEFT(logs, 1800) FROM _prisma_migrations WHERE finished_at IS NULL");
      t.diagnostic(diagnostic.stdout); throw error;
    }
    await instance.executeAdmin(catalogTables.map((name) => `GRANT ${catalogAppendOnly.includes(name) ? 'SELECT, INSERT' : 'SELECT, INSERT, UPDATE'} ON goal_hint_test.${name} TO 'selection_app'@'127.0.0.1';`).join('\n') + `
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.PredictionCycle TO 'selection_app'@'127.0.0.1';
      GRANT SELECT ON goal_hint_test.FixtureLifecycleState TO 'selection_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.PredictionSchedule TO 'selection_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.PredictionAudit TO 'selection_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.DailyRun TO 'selection_app'@'127.0.0.1';
      GRANT UPDATE (selectionHash, selectionJson, windowStart, windowEnd, committedAt, partial, ownerId, fence, leaseExpiresAt, totalJobs, completedJobs, terminalJobs)
        ON goal_hint_test.DailyRun TO 'selection_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.DailyRunManifest TO 'selection_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE (finishedAt, failure) ON goal_hint_test.DailyRunImport TO 'selection_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE (jobId, jobState, terminalReason) ON goal_hint_test.RunFixture TO 'selection_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE (consumedRunId) ON goal_hint_test.SelectionCycleEligibility TO 'selection_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.DurableJob TO 'selection_app'@'127.0.0.1';
      GRANT SELECT, UPDATE ON goal_hint_test.DurableJobEnqueueLock TO 'selection_app'@'127.0.0.1';
      GRANT UPDATE (state, version, availableAt, updatedAt, attemptCount, fence, ownerId, leaseExpiresAt, attemptDeadlineAt, finishedAt, terminalReason)
        ON goal_hint_test.DurableJob TO 'selection_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.DurableJobAttempt TO 'selection_app'@'127.0.0.1';
      GRANT UPDATE (outcome, reason, finishedAt) ON goal_hint_test.DurableJobAttempt TO 'selection_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.DurableJobEvent TO 'selection_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.DurableJobUsage TO 'selection_app'@'127.0.0.1';`);
    const database = replica(), queue = createMysqlJobQueue(database), store = createMysqlDailySelectionStore(database, queue);
    const catalog = createFootballCatalogStore(database), history = createMysqlPredictionHistoryStore(database);
    function setup({ rows = [], respond, policy = policyFor(rows), selectionStore = store, db = database, authority = selectionAuthority() } = {}) {
      const provider = createSyntheticCatalogAdapter({ respond: respond ?? ((url) => catalogResponse(url,
        rows.filter((row) => getReportingDate(Date.parse(row.fixture.date)) === url.searchParams.get('date')))) });
      const importer = createFootballCatalogImporter({ adapter: provider.adapter, store: createFootballCatalogStore(db), authority: catalogSelectionAuthority, clock: provider.clock });
      return { service: createDailySelectionService({ cutoff: { scheduleRun: async () => {} }, policy, authority, store: selectionStore, importer }), provider, importer, policy };
    }
    async function runId(scheduledFor) {
      const date = new Date(`${selectionWindow(scheduledFor).runDate}T00:00:00Z`);
      return (await database.query((tx) => tx.dailyRun.findUniqueOrThrow({ where: { eatDate: date } }))).id;
    }
    async function stage(offset, rows, policy = policyFor(rows)) {
      const state = setup({ rows, policy }), parsed = parseSelectionPolicy(policy);
      const lease = await store.acquire(selectionWindow(occurrence(offset)).runDate, parsed, selectionHash(`owner-${offset}`));
      const window = selectionWindow(occurrence(offset));
      for (let index = 0; index < 7; index++) {
        const date = getReportingDate(window.startInclusive + index * day), pending = await store.beginImport(lease, date, parsed);
        if (pending) { await state.importer.import(pending.request); await store.finishImport(lease, pending.id, false); }
      }
      return { state, lease, parsed };
    }
    await t.test('all migrations deploy without drift; new tables are InnoDB and immutable columns have restricted grants', async () => {
      await execute(process.execPath, ['--conditions=react-server', script, 'verify'], { cwd: workspace, env, windowsHide: true, timeout: 60_000 });
      const engines = await database.query((tx) => tx.$queryRaw`SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('DailyRunManifest','DailyRunImport','RunFixture','SelectionCycleEligibility')`);
      assert.equal(engines.length, 4); assert.ok(engines.every((row) => row.ENGINE === 'InnoDB'));
      await assert.rejects(database.query((tx) => tx.$executeRaw`CREATE TABLE forbidden_selection_ddl (id INT)`));
    });
    await t.test('two concurrent triggers select once, retain seven date receipts, and enqueue one refresh per selected identity', async () => {
      let release, started; const gate = new Promise((resolve) => { release = resolve; }), began = new Promise((resolve) => { started = resolve; });
      const rows = [catalogFixture(1001, { kickoff: kickoff(1) }), catalogFixture(1002, { kickoff: kickoff(2) }),
        catalogFixture(1003, { kickoff: kickoff(2), competitionId: 40 }), catalogFixture(1004, { kickoff: kickoff(2), status: 'FT' })];
      const policy = policyFor(rows); policy.refresh.type = 'test.selection-progress';
      const state = setup({ rows, policy, respond: async (url, _init, count) => {
        if (count === 1) { started(); await gate; }
        return catalogResponse(url, rows.filter((row) => getReportingDate(Date.parse(row.fixture.date)) === url.searchParams.get('date')));
      } });
      const first = state.service.run(occurrence(0)); await began;
      const second = await setup({ rows, policy }).service.run(occurrence(0)); assert.equal(second.status, 'busy'); release();
      const result = await first; assert.equal(result.total, 2); assert.equal(state.provider.network.length, 7);
      const manifest = (await store.inspect(result.runId)).manifest;
      assert.equal(manifest.partial, false); assert.equal(manifest.sequence, '20261009'); assert.equal(manifest.coverage.length, 7);
      assert.deepEqual(manifest.exclusions.map((entry) => entry.reason).sort(), ['competition-ineligible','status-ineligible']);
      assert.ok(manifest.entries[0].kickoffAt < manifest.entries[1].kickoffAt);
      assert.equal(manifest.entries[0].envelope.priority, 255); assert.equal(manifest.entries[1].envelope.priority, 254);
      for (const entry of manifest.entries) assert.equal(entry.envelope.refresh.runId, result.runId);
      const noFetch = setup({ policy, respond() { assert.fail('committed run must never import again'); } });
      assert.equal((await noFetch.service.run(occurrence(0))).total, 2);
      assert.deepEqual((await store.inspect(result.runId)).manifest, manifest);
      assert.equal(await database.query((tx) => tx.durableJob.count({ where: { refreshRunId: result.runId } })), 2);
    });
    await t.test('pagination failure retries without dispatch; restart resumes only incomplete dates and keeps receipts', async () => {
      let fail = true; const row = catalogFixture(1101, { kickoff: kickoff(2) });
      const state = setup({ rows: [row], respond: (url) => catalogResponse(url, getReportingDate(Date.parse(row.fixture.date)) === url.searchParams.get('date') ? [row] : [],
        fail && url.searchParams.get('date') === '2026-10-12' ? { paging: { current: 1, total: 2 } } : {}) });
      await assert.rejects(state.service.run(occurrence(1)), denied('incomplete-import'));
      const id = await runId(occurrence(1)), before = await store.inspect(id);
      assert.equal(before.manifest, null); assert.equal(await database.query((tx) => tx.durableJob.count({ where: { refreshRunId: id } })), 0);
      assert.equal(state.provider.network.filter((entry) => entry.url.searchParams.get('date') === '2026-10-12').length, 2);
      assert.ok(before.coverage.find((entry) => entry.date === '2026-10-12').status !== 'complete');
      const calls = state.provider.network.length; fail = false;
      const restarted = createDailySelectionService({ cutoff: { scheduleRun: async () => {} }, policy: state.policy, authority: selectionAuthority(), store: createMysqlDailySelectionStore(replica(), queue), importer: state.importer });
      assert.equal((await restarted.run(occurrence(1))).total, 1);
      assert.equal(state.provider.network.length - calls, 1);
      assert.equal(await database.query((tx) => tx.dailyRunImport.count({ where: { runId: id } })), 9);
    });
    await t.test('explicit partial finalization records its action and missing date, never false empty; late discoveries cannot join', async () => {
      const row = catalogFixture(1201, { kickoff: kickoff(3) });
      const state = setup({ rows: [row], respond: (url) => url.searchParams.get('date') === '2026-10-13'
        ? catalogResponse(url, [], { status: 500 }) : catalogResponse(url,
          getReportingDate(Date.parse(row.fixture.date)) === url.searchParams.get('date') ? [row] : []) });
      await assert.rejects(state.service.run(occurrence(2)), denied('incomplete-import'));
      const result = await state.service.run(occurrence(2), degradedAction), snapshot = (await store.inspect(result.runId)).manifest;
      assert.equal(snapshot.partial, true); assert.deepEqual(snapshot.degradedAction, degradedAction);
      assert.equal(selectionDateState(snapshot, '2026-10-13').state, 'data-unavailable');
      const late = catalogFixture(1202, { kickoff: kickoff(4) });
      const lateProvider = createSyntheticCatalogAdapter({ rows: [late] });
      await createFootballCatalogImporter({ adapter: lateProvider.adapter, store: catalog, authority: catalogSelectionAuthority, clock: lateProvider.clock })
        .import(catalogRequest({ kind: 'fixtures', query: { fixtureId: 1202 } }));
      const next = await state.service.run(occurrence(2)); assert.equal(next.total, 1);
      assert.deepEqual((await store.inspect(result.runId)).manifest, snapshot);
      assert.equal(await database.query((tx) => tx.durableJob.count({ where: { refreshRunId: result.runId } })), 1);
      const later = await setup({ rows: [row, late] }).service.run(occurrence(3));
      assert.equal(later.total, 2);
      const lateFixture = await catalog.fixtureByProviderId(1202);
      assert.ok((await store.inspect(later.runId)).manifest.entries.some((entry) => entry.fixtureId === lateFixture.id));
    });
    await t.test('unselected or unverified degraded policy/action cannot finalize a known subset', async () => {
      const noPolicy = setup({ policy: selectionPolicy({ degradationPolicyRef: null }) });
      await assert.rejects(noPolicy.service.run(occurrence(3), degradedAction), denied('policy-required'));
      const noAction = setup({ authority: selectionAuthority({ verifyDegradedAction: () => false }) });
      await assert.rejects(noAction.service.run(occurrence(3), degradedAction), denied('unauthorized'));
    });
    await t.test('crash after a catalog receipt but before run receipt completion reuses the original import without fetching', async () => {
      const state = setup({ rows: [catalogFixture(1301, { kickoff: kickoff(5) })] }), policy = parseSelectionPolicy(state.policy);
      const lease = await store.acquire(selectionWindow(occurrence(4)).runDate, policy, selectionHash('crashed-import-owner'));
      const pending = await store.beginImport(lease, '2026-10-13', policy); await state.importer.import(pending.request);
      await instance.executeAdmin(`UPDATE DailyRun SET leaseExpiresAt = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND WHERE id = '${lease.runId}'`);
      const before = state.provider.network.length; const result = await state.service.run(occurrence(4));
      assert.equal(result.total, 1); assert.equal(state.provider.network.length - before, 6);
      const receipt = await database.query((tx) => tx.dailyRunImport.findUniqueOrThrow({ where: { id: pending.id } }));
      assert.ok(receipt.finishedAt); assert.equal(receipt.failure, null);
    });
    await t.test('crash before manifest commit rolls back cycles and membership; an expired owner cannot retry it', async () => {
      const { lease, parsed } = await stage(5, [catalogFixture(1401, { kickoff: kickoff(6) })]);
      const crashDatabase = { query: (operation) => database.query(operation),
        transaction: (operation, options) => database.transaction((tx) => operation(new Proxy(tx, { get(target, property) {
          if (property === 'dailyRunManifest') return { ...target.dailyRunManifest, create() { throw new Error('synthetic precommit crash'); } };
          return Reflect.get(target, property);
        } })), options) };
      await assert.rejects(createMysqlDailySelectionStore(crashDatabase, queue).commit(lease, parsed, null), denied('unavailable'));
      const fixture = await catalog.fixtureByProviderId(1401);
      assert.equal((await store.inspect(lease.runId)).manifest, null);
      assert.equal(await database.query((tx) => tx.predictionCycle.count({ where: { fixtureId: fixture.id } })), 0);
      assert.equal(await database.query((tx) => tx.runFixture.count({ where: { runId: lease.runId } })), 0);
      await instance.executeAdmin(`UPDATE DailyRun SET leaseExpiresAt = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND WHERE id = '${lease.runId}'`);
      await assert.rejects(store.commit(lease, parsed, null), denied('lost-lease'));
      assert.equal((await store.inspect(lease.runId)).manifest, null);
      assert.equal(await database.query((tx) => tx.predictionCycle.count({ where: { fixtureId: fixture.id } })), 0);
      await setup({ rows: [catalogFixture(1401, { kickoff: kickoff(6) })] }).service.run(occurrence(5));
      assert.equal(await database.query((tx) => tx.predictionCycle.count({ where: { fixtureId: fixture.id } })), 1);
    });
    await t.test('restart after commit recovers dispatch, including a partially enqueued prefix and duplicate enqueue', async () => {
      const rows = [catalogFixture(1501, { kickoff: kickoff(7) }), catalogFixture(1502, { kickoff: kickoff(8) })];
      const { lease, parsed } = await stage(6, rows), manifest = await store.commit(lease, parsed, null);
      await store.release(lease);
      assert.equal(await database.query((tx) => tx.durableJob.count({ where: { refreshRunId: lease.runId } })), 0);
      let calls = 0;
      const failingQueue = { ...queue, async withTransaction(operation) { if (++calls === 2) throw new Error('synthetic crash before enqueue'); return queue.withTransaction(operation); } };
      const partialStore = createMysqlDailySelectionStore(database, failingQueue);
      await assert.rejects(setup({ rows, selectionStore: partialStore }).service.run(occurrence(6)));
      assert.equal(await database.query((tx) => tx.durableJob.count({ where: { refreshRunId: lease.runId } })), 1);
      const restartedDb = replica(), restartedQueue = createMysqlJobQueue(restartedDb), restartedStore = createMysqlDailySelectionStore(restartedDb, restartedQueue);
      assert.equal((await setup({ rows, db: restartedDb, selectionStore: restartedStore }).service.run(occurrence(6))).total, 2);
      await queue.enqueue(manifest.entries[0].envelope);
      assert.equal(await database.query((tx) => tx.durableJob.count({ where: { refreshRunId: lease.runId } })), 2);
      assert.deepEqual((await store.inspect(lease.runId)).manifest, manifest);
    });
    await t.test('expired owners cannot renew or finalize before takeover; renewed provider work keeps exclusive ownership', async () => {
      const policy = parseSelectionPolicy(selectionPolicy({ leaseMs: 1000 }));
      const old = await store.acquire(selectionWindow(occurrence(7)).runDate, policy, selectionHash('old'));
      await instance.executeAdmin(`UPDATE DailyRun SET leaseExpiresAt = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND WHERE id = '${old.runId}'`);
      await assert.rejects(store.renew(old, 1000), denied('lost-lease'));
      const next = await store.acquire(selectionWindow(occurrence(7)).runDate, policy, selectionHash('new'));
      assert.equal(next.fence, old.fence + 1); await assert.rejects(store.commit(old, policy, null), denied('lost-lease')); await store.release(next);
      const state = setup({ policy, respond: async (url, _init, count) => { if (count === 1) await sleep(1400); return catalogResponse(url, []); } });
      assert.equal((await state.service.run(occurrence(7))).status, 'committed');
    });
    await t.test('open cycles are reused; closed cycles remain excluded until explicitly recorded eligible void/postponed inputs', async () => {
      const row = catalogFixture(1601, { kickoff: kickoff(12) }), first = await setup({ rows: [row] }).service.run(occurrence(8));
      const original = (await store.inspect(first.runId)).manifest.entries[0];
      const again = await setup({ rows: [row] }).service.run(occurrence(9));
      assert.equal((await store.inspect(again.runId)).manifest.entries[0].cycleId, original.cycleId);
      let cycle = await history.findCycle(original.cycleId), at = Date.now();
      await history.withFixtureTransaction(cycle.fixtureId, (writer) => writer.changeCycle({ ...actor, cycleId: cycle.id, expectedVersion: cycle.version, eventKey: selectionHash('void-cycle'), at,
        next: { state: 'void', currentSetId: null, lockedSetId: null, closedAt: at, lockedAt: null, voidedAt: at, voidReason: 'Synthetic postponement void' } }));
      const excluded = await setup({ rows: [row] }).service.run(occurrence(10));
      assert.equal(excluded.total, 0); assert.equal((await store.inspect(excluded.runId)).manifest.exclusions[0].reason, 'closed-cycle');
      cycle = await history.findCycle(original.cycleId);
      const eligibility = { id: selectionHash('eligible-void-reschedule'), fixtureId: cycle.fixtureId, previousCycleId: cycle.id,
        previousVersion: cycle.version, kickoffAt: Date.parse(row.fixture.date), state: 'void', actor: actor.actor, evidenceRef: actor.evidenceRef };
      await store.recordCycleEligibility(eligibility, selectionAuthority()); await store.recordCycleEligibility(eligibility, selectionAuthority());
      const resumed = await setup({ rows: [row] }).service.run(occurrence(11)), next = (await store.inspect(resumed.runId)).manifest.entries[0];
      assert.notEqual(next.cycleId, original.cycleId); assert.equal((await history.findCycle(original.cycleId)).state, 'void');
      assert.equal((await history.findCycle(next.cycleId)).ordinal, 2);
      const fixture = await catalog.fixtureByProviderId(1601);
      assert.equal(await database.query((tx) => tx.predictionCycle.count({ where: { fixtureId: fixture.id } })), 2);
      const closed = await history.findCycle(next.cycleId); at = Date.now();
      await history.withFixtureTransaction(closed.fixtureId, (writer) => writer.changeCycle({ ...actor, cycleId: closed.id, expectedVersion: closed.version, eventKey: selectionHash('closed-postponed'), at,
        next: { state: 'closed', currentSetId: null, lockedSetId: null, closedAt: at, lockedAt: null, voidedAt: null, voidReason: null } }));
      await instance.executeAdmin(`UPDATE FootballFixture SET status = 'postponed' WHERE id = '${fixture.id}'`);
      const latest = await history.findCycle(closed.id);
      await store.recordCycleEligibility({ ...eligibility, id: selectionHash('eligible-postponed-reschedule'), previousCycleId: closed.id,
        previousVersion: latest.version, state: 'postponed', kickoffAt: Date.parse(kickoff(14)) }, selectionAuthority());
      // 024 owns detecting/rescheduling. Supply that explicit state directly, without asking selection to infer it.
      await instance.executeAdmin(`UPDATE FootballFixture SET status = 'scheduled', kickoff = '${kickoff(14).slice(0, 23).replace('T', ' ')}',
        eatDate = '${getReportingDate(Date.parse(kickoff(14)))}' WHERE id = '${fixture.id}'`);
      const third = await setup({ rows: [catalogFixture(1601, { kickoff: kickoff(14) })] }).service.run(occurrence(12));
      const thirdEntry = (await store.inspect(third.runId)).manifest.entries[0]; assert.ok(thirdEntry);
      assert.equal((await history.findCycle(thirdEntry.cycleId)).ordinal, 3); assert.equal((await history.findCycle(closed.id)).state, 'closed');
    });
    await t.test('terminal and successful job outcomes persist without changing manifest membership', async () => {
      const id = await runId(occurrence(0)), manifest = (await store.inspect(id)).manifest;
      // Other test cohorts can become available as the real calendar advances.
      const types = [{ type: 'test.selection-progress', handlerVersion: 1 }];
      const one = await queue.claim(selectionHash('progress-worker'), types); assert.ok(one);
      assert.equal(one.job.envelope.refresh.runId, id); await queue.acknowledge(one);
      const two = await queue.claim(selectionHash('progress-worker'), types); await queue.retry(two, 'invalid-output', false);
      assert.deepEqual(await store.progress(id), { total: 2, completed: 1, terminal: 2 });
      const rows = await database.query((tx) => tx.runFixture.findMany({ where: { runId: id } }));
      assert.deepEqual(rows.map((entry) => entry.terminalReason).sort(), ['completed','invalid-output']);
      assert.deepEqual((await store.inspect(id)).manifest, manifest);
    });
    await t.test('committed manifest, import requests, membership and eligibility evidence resist application edits', async () => {
      for (const sql of ['UPDATE DailyRunManifest SET manifestJson = JSON_OBJECT()', 'DELETE FROM DailyRunManifest',
        'UPDATE RunFixture SET fixtureId = UUID()', 'DELETE FROM RunFixture', 'UPDATE DailyRunImport SET requestJson = JSON_OBJECT()',
        "UPDATE SelectionCycleEligibility SET evidenceRef = 'changed'"]) await assert.rejects(database.query((tx) => tx.$executeRawUnsafe(sql)));
      const id = await runId(occurrence(0));
      await assert.rejects(instance.executeAdmin(`UPDATE DailyRun SET completedJobs = totalJobs + 1 WHERE id = '${id}'`));
      const original = (await store.inspect(id)).manifest.entries[0];
      const unrelated = await queue.enqueue({ ...original.envelope, refresh: null, idempotencyKey: selectionHash('unrelated-durable-job') });
      await assert.rejects(database.query((tx) => tx.runFixture.update({ where: { runId_fixtureId_cycleId: {
        runId: id, fixtureId: original.fixtureId, cycleId: original.cycleId } },
        data: { jobId: unrelated.id, jobState: 'pending', terminalReason: null } })));
      await assert.rejects(setup({ policy: selectionPolicy({ competitionIds: [40] }) }).service.run(occurrence(0)), denied('conflicting-request'));
    });
    await t.test('refresh capacity keeps the nearest kickoffs and records later fixtures as deferred without cycles', async () => {
      // Provider IDs deliberately invert kickoff order so ID order cannot satisfy the budget.
      const rows = [catalogFixture(2005, { kickoff: kickoff(20, 6) }), catalogFixture(2004, { kickoff: kickoff(20, 30) }),
        catalogFixture(2003, { kickoff: kickoff(20, 54) }), catalogFixture(2002, { kickoff: kickoff(20, 78) }),
        catalogFixture(2001, { kickoff: kickoff(20, 102) })];
      const policy = { ...policyFor(rows), refreshCapacity: 2 }; policy.refresh = { ...policy.refresh, type: 'test.selection-capacity' };
      const result = await setup({ rows, policy }).service.run(occurrence(20));
      assert.equal(result.total, 2);
      const manifest = (await store.inspect(result.runId)).manifest;
      const ids = async (externalIds) => Promise.all(externalIds.map(async (id) => (await catalog.fixtureByProviderId(id)).id));
      assert.deepEqual(manifest.entries.map((entry) => entry.fixtureId), await ids([2005, 2004]));
      assert.deepEqual(manifest.exclusions.filter((entry) => entry.reason === 'refresh-capacity').map((entry) => entry.fixtureId).sort(),
        (await ids([2003, 2002, 2001])).sort());
      const deferred = await ids([2003, 2002, 2001]);
      assert.equal(await database.query((tx) => tx.predictionCycle.count({ where: { fixtureId: { in: deferred } } })), 0);
      assert.equal(await database.query((tx) => tx.durableJob.count({ where: { refreshRunId: result.runId } })), 2);
      assert.throws(() => parseSelectionPolicy({ ...policy, refreshCapacity: -1 }));
    });
    await t.test('a plan horizon requests only its dates and finalizes the rest as explicit partial coverage', async () => {
      const rows = [catalogFixture(2101, { kickoff: kickoff(22, 6) }), catalogFixture(2102, { kickoff: kickoff(22, 78) })];
      const policy = { ...policyFor(rows), importDays: 2 }; policy.refresh = { ...policy.refresh, type: 'test.selection-horizon' };
      const state = setup({ rows, policy });
      await assert.rejects(state.service.run(occurrence(22)), denied('incomplete-import'));
      assert.equal(state.provider.network.length, 2, 'dates beyond the horizon are never requested');
      const result = await setup({ rows, policy }).service.run(occurrence(22), degradedAction);
      assert.equal(result.status, 'committed'); assert.equal(result.total, 1);
      const manifest = (await store.inspect(result.runId)).manifest;
      assert.equal(manifest.partial, true); assert.deepEqual(manifest.degradedAction, degradedAction);
      assert.deepEqual(manifest.coverage.map((entry) => entry.status), ['complete', 'complete', 'failed', 'failed', 'failed', 'failed', 'failed']);
      assert.ok(manifest.coverage.slice(2).every((entry) => entry.missingCoverage.includes('date-not-retrieved')));
      assert.throws(() => parseSelectionPolicy({ ...policy, importDays: 8 }));
    });
  } finally {
    await Promise.all(databases.map((db) => db.disconnect().catch(() => {}))); await instance.stop();
  }
});
