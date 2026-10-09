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
import { createMysqlModelVersionStore } from '../src/server/predictor/predictor-mysql-store.ts';
import { createModelPin } from '../src/server/predictor/predictor-input.ts';
import { createMysqlPredictionHistoryStore } from '../src/server/predictions/history-mysql-store.ts';
import { storedCycle } from '../src/server/predictions/history-read.ts';
import { createRevisionPublicationService } from '../src/server/predictions/publication-service.ts';
import { RevisionPublicationError } from '../src/server/predictions/publication-contract.ts';
import { createMysqlDailySelectionStore } from '../src/server/selection/selection-mysql-store.ts';
import { createDailySelectionService } from '../src/server/selection/selection-service.ts';
import { catalogFixture, catalogResponse, createSyntheticCatalogAdapter, CATALOG_NOW } from './helpers/catalog-fixtures.mjs';
import { evidenceContext, evidenceHash, evidenceAuthority, evidencePolicy, evidenceSource } from './helpers/evidence-fixtures.mjs';
import { modelVersion, modelAuthority } from './helpers/predictor-fixtures.mjs';
import { historyCandidate, cycleChange, cycleCreation } from './helpers/prediction-history-fixtures.mjs';
import { jobTestEnvironment } from './helpers/job-fixtures.mjs';
import { selectionPolicy, selectionAuthority, catalogSelectionAuthority, SELECTION_FOR } from './helpers/selection-fixtures.mjs';
import { publicationPolicy, publicationAuthority, publicationInput, emptyCandidate, PUBLICATION_NOW } from './helpers/publication-fixtures.mjs';
import { MysqlServerUnavailableError, startIsolatedMysql } from './helpers/mysql-instance.mjs';

const execute = promisify(execFile), workspace = fileURLToPath(new URL('../', import.meta.url));
const script = fileURLToPath(new URL('../scripts/database.mjs', import.meta.url));
const denied = (reason) => (error) => error instanceof RevisionPublicationError && error.reason === reason;
const catalogTables = ['FootballCatalogLock','FootballTeam','FootballTeamProvider','FootballTeamAlias','FootballCompetition',
  'FootballCompetitionProvider','FootballCompetitionAlias','FootballSeason','FootballFixture','FootballFixtureAudit','FootballImport','FootballIdentityReview'];
const appendOnly = ['EvidenceSourceVersion','FixtureEvidenceSnapshot','FixtureEvidenceSnapshotSource','ModelVersion',
  'PredictionSet','MarketPrediction','PredictionSchedule','PredictionAudit','DailyRunManifest',
  'PredictionRefreshResult','PredictionPublicationBarrier','PredictionChangeEvent'];

test('atomic revision publication on isolated genuine MySQL', { timeout: 300_000 }, async (t) => {
  let instance;
  try { instance = await startIsolatedMysql(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(`${error.message} Publication acceptance remains pending.`); return; }
  t.diagnostic(`Owned server: ${instance.version}. Provider/model data, permissions and MySQL session clocks are synthetic.`);
  const migrationPassword = randomBytes(24).toString('hex'), applicationPassword = randomBytes(24).toString('hex');
  const env = jobTestEnvironment(`mysql://publication_app:${applicationPassword}@127.0.0.1:${instance.port}/goal_hint_test`,
    `mysql://publication_migration:${migrationPassword}@127.0.0.1:${instance.port}/goal_hint_test`);
  const databases = []; let at = PUBLICATION_NOW;
  // Exercise the production UTC_TIMESTAMP query against a deterministic MySQL
  // session clock. Reset it before returning the connection to the pool.
  function replica() {
    const base = createDatabase(parseRuntimePolicy(env)); databases.push(base);
    return { query: base.query.bind(base), transaction: (operation, options) => base.transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET timestamp = ${at / 1000}`);
      try { return await operation(tx); } finally { await tx.$executeRawUnsafe('SET timestamp = 0'); }
    }, options) };
  }
  try {
    await instance.executeAdmin(`CREATE USER 'publication_migration'@'127.0.0.1' IDENTIFIED BY '${migrationPassword}';
      CREATE USER 'publication_app'@'127.0.0.1' IDENTIFIED BY '${applicationPassword}';
      GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES ON goal_hint_test.* TO 'publication_migration'@'127.0.0.1';`);
    try { await execute(process.execPath, ['--conditions=react-server', script, 'deploy'], { cwd: workspace, env, windowsHide: true, timeout: 90_000 }); }
    catch (error) { t.diagnostic((await instance.executeAdmin('SELECT migration_name, LEFT(logs, 1800) FROM _prisma_migrations WHERE finished_at IS NULL')).stdout); throw error; }
    await instance.executeAdmin(catalogTables.map((name) => `GRANT SELECT, INSERT, UPDATE ON goal_hint_test.${name} TO 'publication_app'@'127.0.0.1';`).join('\n') +
      appendOnly.map((name) => `GRANT SELECT, INSERT ON goal_hint_test.${name} TO 'publication_app'@'127.0.0.1';`).join('\n') + `
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.PredictionCycle TO 'publication_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.DailyRun TO 'publication_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE (finishedAt, failure) ON goal_hint_test.DailyRunImport TO 'publication_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE (jobId, jobState, terminalReason) ON goal_hint_test.RunFixture TO 'publication_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE (consumedRunId) ON goal_hint_test.SelectionCycleEligibility TO 'publication_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.DurableJob TO 'publication_app'@'127.0.0.1';
      GRANT SELECT, UPDATE ON goal_hint_test.DurableJobEnqueueLock TO 'publication_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.DurableJobAttempt TO 'publication_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.DurableJobEvent TO 'publication_app'@'127.0.0.1';`);
    const a = replica(), b = replica(), catalog = createFootballCatalogStore(a), evidence = createMysqlEvidenceStore(a), history = createMysqlPredictionHistoryStore(a);
    const queue = createMysqlJobQueue(a), otherQueue = createMysqlJobQueue(b), model = modelVersion();
    await createMysqlModelVersionStore(a).save(model, modelAuthority());
    const publisher = (database = a, options = {}) => createRevisionPublicationService({ database,
      queue: database === a ? queue : otherQueue, policy: publicationPolicy(), authority: publicationAuthority(), ...options });
    const first = publisher(), second = publisher(b); let nextId = 2000;
    const cohorts = new Map();
    async function cohort(runDate) {
      if (cohorts.has(runDate)) return cohorts.get(runDate);
      const type = `test.publication-${runDate}`;
      const rows = Array.from({ length: 50 }, (_, index) => catalogFixture(2000 + index, { kickoff: '2026-10-12T12:00:00Z' }));
      const provider = createSyntheticCatalogAdapter({ respond: (url) => catalogResponse(url, rows.filter((row) => getReportingDate(Date.parse(row.fixture.date)) === url.searchParams.get('date'))) });
      const importer = createFootballCatalogImporter({ adapter: provider.adapter, store: catalog, authority: catalogSelectionAuthority, clock: provider.clock });
      const rawPolicy = selectionPolicy(); rawPolicy.refresh = { ...rawPolicy.refresh, type };
      const selection = createMysqlDailySelectionStore(a, queue);
      const service = createDailySelectionService({ policy: rawPolicy, authority: selectionAuthority(), store: selection, importer });
      const scheduledFor = SELECTION_FOR + (Number(runDate.slice(-2)) - 9) * 86_400_000;
      let selected;
      at = CATALOG_NOW;
      try { selected = await service.run(scheduledFor); } finally { at = PUBLICATION_NOW; }
      assert.equal(selected.total, 50);
      const manifest = (await selection.inspect(selected.runId)).manifest, leases = new Map();
      for (let index = 0; index < selected.total; index++) {
        const lease = await queue.claim(evidenceHash(`owner:${type}:${index}`), [{ type, handlerVersion: 1 }]);
        assert.ok(lease); leases.set(lease.job.envelope.refresh.fixtureId, lease);
      }
      const value = { selected, manifest, leases, provider }; cohorts.set(runDate, value); return value;
    }
    async function setup({ fixture, runDate = '2026-10-07' } = {}) {
      const externalId = fixture?.externalId ?? nextId++, { selected, manifest, leases, provider } = await cohort(runDate);
      fixture = await catalog.fixtureByProviderId(externalId);
      const entry = manifest.entries.find((value) => value.fixtureId === fixture.id);
      const cycle = await history.findCycle(entry.cycleId);
      const lease = leases.get(fixture.id);
      assert.ok(lease);
      const context = evidenceContext(fixture, { runId: selected.runId, cycleId: cycle.id });
      const approved = evidenceAuthority(), snapshot = buildEvidenceSnapshot({ context, policy: evidencePolicy(), sources: [evidenceSource(context)] }, approved);
      const evidenceId = evidenceHash(randomUUID()); await evidence.save(evidenceId, evidenceHash(`request:${evidenceId}`), snapshot, approved);
      const input = publicationInput(historyCandidate({ snapshot, model, jobId: lease.jobId }), evidenceId, cycle.scheduleVersion);
      return { fixture, cycle, entry, lease, input, snapshot, runId: selected.runId, provider };
    }
    async function newer(target, date, source = 'ai') {
      const state = await setup({ fixture: await catalog.fixtureByProviderId(target.fixture.externalId), runDate: date });
      if (source !== 'ai') state.input = { ...state.input, candidate: historyCandidate({ snapshot: state.snapshot, model, jobId: state.lease.jobId, source }) };
      return state;
    }
    async function counts(fixtureId) {
      return a.query(async (tx) => ({ sets: await tx.predictionSet.count({ where: { fixtureId } }),
        results: await tx.predictionRefreshResult.count({ where: { fixtureId } }), events: await tx.predictionChangeEvent.count({ where: { fixtureId } }) }));
    }
    await t.test('all migrations deploy without drift; clocks come from MySQL and new records are immutable', async () => {
      await execute(process.execPath, ['--conditions=react-server', script, 'verify'], { cwd: workspace, env, windowsHide: true, timeout: 60_000 });
      assert.equal((await a.transaction((tx) => tx.$queryRaw`SELECT UTC_TIMESTAMP(3) AS at`))[0].at.getTime(), at);
      const rows = await a.query((tx) => tx.$queryRaw`SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('PredictionRefreshResult','PredictionPublicationBarrier','PredictionChangeEvent')`);
      assert.equal(rows.length, 3); assert.ok(rows.every((row) => row.ENGINE === 'InnoDB'));
      await assert.rejects(a.query((tx) => tx.$executeRaw`CREATE TABLE forbidden_publication_ddl (id INT)`));
    });
    let original, state, fallback;
    await t.test('same-key jobs race across clients and commit one complete snapshot/reference/result/event', async () => {
      state = await setup();
      const before = await catalog.fixtureByProviderId(state.fixture.externalId);
      const values = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? first : second).publish(state.input, state.lease)));
      original = values[0]; assert.ok(values.every((value) => value.revision.id === original.revision.id));
      assert.equal(original.revision.publishedAt, at); assert.equal(original.refresh.at, at);
      assert.deepEqual(await counts(state.fixture.id), { sets: 1, results: 1, events: 1 });
      assert.equal((await history.currentRevision(state.cycle.id)).id, original.revision.id);
      assert.ok(original.refresh.fixtureVersion > before.dataVersion);
      assert.equal((await a.query((tx) => tx.marketPrediction.count({ where: { setId: original.revision.id } }))), 4);
      assert.deepEqual(await first.resultForAttempt(original.refresh.id), original);
    });
    await t.test('newer partial fallback replaces older AI; overlapping runs cannot roll current back', async () => {
      const old = await setup({ kickoff: '2026-10-12T12:00:00Z' });
      const olderAi = await first.publish(old.input, old.lease);
      const current = await newer(old, '2026-10-08', 'api-football');
      fallback = await first.publish(current.input, current.lease);
      assert.equal(fallback.refresh.outcome, 'published');
      assert.equal(fallback.revision.predecessorId, olderAi.revision.id);
      assert.equal(olderAi.revision.candidate.markets['total-goals'].available, true);
      assert.equal(fallback.revision.candidate.markets['total-goals'].available, false);
      assert.equal(fallback.revision.candidate.markets['match-result'].market.source, 'api-football');
      const late = await first.publish(old.input, old.lease);
      assert.deepEqual(late, olderAi);
      assert.equal((await history.currentRevision(current.cycle.id)).id, fallback.revision.id);
      assert.equal(fallback.revision.candidate.markets['match-result'].timestamps.generatedAt, null);
      assert.equal(fallback.revision.candidate.markets['match-result'].timestamps.providerUpdatedAt, null);
      const racingOld = await setup(), racingNew = await newer(racingOld, '2026-10-08', 'api-football');
      const raced = await Promise.all([first.publish(racingOld.input, racingOld.lease), second.publish(racingNew.input, racingNew.lease)]);
      assert.equal(raced[1].refresh.outcome, 'published');
      assert.ok(raced[0].refresh.outcome === 'published' || raced[0].refresh.reason === 'older-run');
      assert.equal((await history.currentRevision(racingOld.cycle.id)).id, raced[1].revision.id);
    });
    await t.test('zero valid families retain an eligible previous forecast with original timestamps, otherwise unavailable', async () => {
      const previous = await setup({ kickoff: '2026-10-11T12:00:00Z' });
      const published = await first.publish(previous.input, previous.lease);
      const empty = await newer(previous, '2026-10-06');
      // A backfilled run still uses chronology; use an unpublished fixture for honest unavailable.
      const unavailable = await setup();
      const noData = await first.publish({ ...unavailable.input, candidate: emptyCandidate(unavailable.input.candidate) }, unavailable.lease);
      assert.equal(noData.refresh.outcome, 'unavailable'); assert.equal(noData.revision, null);
      // For a newer daily run, its no-family decision can retain the previous snapshot.
      const next = await newer(previous, '2026-10-09');
      const retained = await first.publish({ ...next.input, candidate: emptyCandidate(next.input.candidate) }, next.lease);
      assert.equal(retained.refresh.outcome, 'retained-previous'); assert.equal(retained.updateDelayed, true);
      assert.deepEqual(retained.revision, published.revision);
      const display = await first.displayForFixture(previous.fixture.id);
      assert.equal(display.updateDelayed, true); assert.equal(display.revision.publishedAt, published.revision.publishedAt);
      assert.equal((await counts(previous.fixture.id)).sets, 1);
      assert.equal((await first.publish(empty.input, empty.lease)).refresh.reason, 'older-run');
    });
    await t.test('restart/acknowledgement returns the original publication even with changed model pin, timing or observation', async () => {
      await queue.acknowledge(state.lease);
      const retry = structuredClone(state.input); retry.generationCompletedAt++; retry.observation.retrievedAt--;
      const pin = createModelPin({ version: 1, jobId: retry.candidate.context.jobId,
        invocationId: evidenceHash('synthetic-retried-invocation'), modelVersionId: evidenceHash('synthetic-changed-model') });
      retry.candidate.context.pin = pin;
      for (const item of Object.values(retry.candidate.markets)) if (item.available && item.provenance.kind === 'ai') {
        item.provenance.pin = pin; item.provenance.modelVersionId = pin.modelVersionId;
      }
      const restarted = publisher(b), before = await counts(state.fixture.id);
      assert.deepEqual(await restarted.publish(retry, state.lease), original);
      assert.deepEqual(await counts(state.fixture.id), before);
      assert.equal((await first.displayForFixture(state.fixture.id)).fixtureVersion, original.refresh.fixtureVersion);
    });
    await t.test('an ambiguous response after commit is recoverable with immutable timestamps and provenance', async () => {
      const target = await setup(); let committed;
      const lostResponse = { query: a.query, transaction: async (operation, options) => {
        committed = await a.transaction(operation, options); throw new Error('synthetic-lost-commit-response');
      } };
      await assert.rejects(publisher(lostResponse).publish(target.input, target.lease), denied('unavailable'));
      assert.equal(committed.refresh.outcome, 'published');
      assert.deepEqual(await second.publish(target.input, target.lease), committed);
      assert.deepEqual(await counts(target.fixture.id), { sets: 1, results: 1, events: 1 });
    });
    await t.test('an unpublished no-family attempt can recover; accepted refreshes stay final', async () => {
      const target = await setup(), input = { ...target.input, candidate: emptyCandidate(target.input.candidate) };
      const missing = await first.publish(input, target.lease);
      assert.equal(missing.refresh.outcome, 'unavailable');
      assert.deepEqual(await second.publish(input, target.lease), missing);
      await assert.rejects(first.publish(target.input, target.lease), denied('conflicting-request'));
      const recovered = await first.publish({ ...target.input, attemptKey: evidenceHash('synthetic-recovered-attempt') }, target.lease);
      assert.equal(recovered.refresh.outcome, 'published');
      assert.deepEqual(await first.publish(input, target.lease), recovered);
      assert.deepEqual(await counts(target.fixture.id), { sets: 1, results: 2, events: 2 });
    });
    await t.test('exact cutoff and stale/future observations reject without creating a replacement', async () => {
      for (const kind of ['exact','after','stale','future']) {
        const target = await setup(); let input = target.input;
        if (kind === 'exact' || kind === 'after') {
          // Accepted schedule correction changes cutoff without changing the original job expiry.
          const kickoffAt = at + 300_000 - (kind === 'after' ? 1 : 0);
          await history.withFixtureTransaction(target.fixture.id, async (writer, tx) => {
            const cycle = await storedCycle(tx, target.cycle.id);
            await writer.changeCycle({ ...cycleChange(cycle, {}, kind), at,
              schedule: { kickoffAt, providerObservedAt: at, actualStartedAt: null } });
            await tx.footballFixture.update({ where: { id: target.fixture.id }, data: { kickoff: new Date(kickoffAt) } });
          });
          // No valid-family candidate requires no evidence write; the schedule gate runs first.
          input = { ...input, scheduleVersion: 2, candidate: { ...input.candidate, context: { ...input.candidate.context,
            context: { ...input.candidate.context.context, kickoffAt } } }, observation: { ...input.observation, kickoffAt } };
        } else input = { ...input, observation: { ...input.observation, retrievedAt: at + (kind === 'stale' ? -10_001 : 1) } };
        const result = await first.publish(input, target.lease);
        assert.equal(result.refresh.reason, kind === 'exact' || kind === 'after' ? 'cutoff-passed' : `${kind}-observation`);
        assert.equal((await counts(target.fixture.id)).sets, 0);
      }
    });
    await t.test('early play persists a barrier that a later scheduled response cannot reopen', async () => {
      const target = await setup();
      const early = { ...target.input, observation: { ...target.input.observation, status: 'live', actualStartedAt: at - 1000 } };
      const refused = await first.publish(early, target.lease);
      assert.equal(refused.refresh.reason, 'early-play');
      const fresh = { ...target.input, attemptKey: evidenceHash('synthetic-after-early-start') };
      assert.equal((await second.publish(fresh, target.lease)).refresh.reason, 'early-play');
      assert.equal((await counts(target.fixture.id)).sets, 0);
      assert.equal((await first.changesForFixture(target.fixture.id))[0].kind, 'eligibility-closed');
      await assert.rejects(a.query((tx) => tx.$executeRaw`DELETE FROM PredictionPublicationBarrier WHERE cycleId = ${target.cycle.id}`));
    });
    await t.test('canonical observed play also latches eligibility and the current rolling window is independent of the manifest', async () => {
      const target = await setup();
      await catalog.withFixtureTransaction(target.fixture.id, (tx) => tx.footballFixture.update({ where: { id: target.fixture.id },
        data: { status: 'live', retrievedAt: new Date(at) } }));
      assert.equal((await first.publish(target.input, target.lease)).refresh.reason, 'early-play');
      await catalog.withFixtureTransaction(target.fixture.id, (tx) => tx.footballFixture.update({ where: { id: target.fixture.id }, data: { status: 'scheduled' } }));
      assert.equal((await first.publish({ ...target.input, attemptKey: evidenceHash('canonical-play-retry') }, target.lease)).refresh.reason, 'early-play');
      const outside = await setup();
      at = Date.parse('2026-10-13T08:00:00Z');
      try { assert.equal((await first.publish(outside.input, outside.lease)).refresh.reason, 'outside-window'); }
      finally { at = PUBLICATION_NOW; }
    });
    await t.test('out-of-window, wrong-cycle, schedule changes and nonselected output cannot publish', async () => {
      const target = await setup();
      await history.withFixtureTransaction(target.fixture.id, async (writer, tx) => {
        const cycle = await storedCycle(tx, target.cycle.id), kickoffAt = Date.parse('2026-10-20T12:00:00Z');
        await writer.changeCycle({ ...cycleChange(cycle, {}, 'outside-window'), at,
          schedule: { kickoffAt, providerObservedAt: at, actualStartedAt: null } });
        await tx.footballFixture.update({ where: { id: target.fixture.id }, data: { kickoff: new Date(kickoffAt) } });
      });
      assert.equal((await first.publish(target.input, target.lease)).refresh.reason, 'schedule-changed');
      const adjusted = { ...target.input, attemptKey: evidenceHash('outside-window'), scheduleVersion: 2,
        candidate: { ...target.input.candidate, context: { ...target.input.candidate.context,
          context: { ...target.input.candidate.context.context, kickoffAt: Date.parse('2026-10-20T12:00:00Z') } } },
        observation: { ...target.input.observation, kickoffAt: Date.parse('2026-10-20T12:00:00Z') } };
      assert.equal((await first.publish(adjusted, target.lease)).refresh.reason, 'outside-window');
      const wrong = await setup();
      await history.withFixtureTransaction(wrong.fixture.id, async (writer, tx) => {
        const cycle = await storedCycle(tx, wrong.cycle.id);
        await writer.changeCycle({ ...cycleChange(cycle, { state: 'closed', closedAt: at }, 'close-for-next'), at });
      });
      await history.createCycle({ ...cycleCreation(wrong.fixture, 'synthetic-next-active'), openedAt: at });
      assert.equal((await first.publish(wrong.input, wrong.lease)).refresh.reason, 'wrong-cycle');
      const notSelected = structuredClone(wrong.input); notSelected.candidate.context.context.runId = randomUUID();
      await assert.rejects(first.publish(notSelected, wrong.lease), denied('invalid-request'));
    });
    await t.test('revalidates probabilities, pinned model/evidence, support receipts and authority without leaking diagnostics', async () => {
      const target = await setup();
      const invalid = structuredClone(target.input); invalid.candidate.markets['match-result'].market.probabilities.draw = 0.999;
      await assert.rejects(first.publish(invalid, target.lease), denied('invalid-request'));
      await assert.rejects(first.publish({ ...target.input, evidenceSnapshotId: state.input.evidenceSnapshotId }, target.lease), denied('invalid-request'));
      const revoked = publisher(a, { authority: publicationAuthority({ verifyCandidate: () => { throw new Error('synthetic-private-diagnostic'); } }) });
      await assert.rejects(revoked.publish(target.input, target.lease), (error) => denied('unauthorized')(error) && !error.message.includes('synthetic-private'));
      await assert.rejects(publisher(a, { authority: publicationAuthority({ verifyPolicy: async () => true }) }).publish(target.input, target.lease), denied('unauthorized'));
      const expired = { ...target.lease, fence: target.lease.fence + 1 };
      await assert.rejects(first.publish(target.input, expired), denied('lost-lease'));
      assert.deepEqual(await counts(target.fixture.id), { sets: 0, results: 0, events: 0 });
    });
    await t.test('stale source output cannot replace a forecast; mismatched AI attribution and unsupported fallback receipts fail', async () => {
      const target = await setup();
      const stale = publisher(a, { policy: publicationPolicy({ sources: { ...publicationPolicy().sources,
        ai: { ...publicationPolicy().sources.ai, maxAgeMs: 0 } } }) });
      assert.equal((await stale.publish(target.input, target.lease)).refresh.reason, 'stale-source');
      const changed = structuredClone(target.input); changed.attemptKey = evidenceHash('synthetic-attribution-conflict');
      for (const item of Object.values(changed.candidate.markets)) if (item.available && item.provenance.kind === 'ai') item.provenance.sources[0].publisher = 'Different attribution';
      await assert.rejects(first.publish(changed, target.lease), denied('invalid-request'));
      const provider = historyCandidate({ snapshot: target.snapshot, model, jobId: target.lease.jobId, source: 'api-football' });
      const unsupported = structuredClone(provider);
      for (const item of Object.values(unsupported.markets)) if (item.available) item.provenance.source.supportEvidenceRefs = {};
      await assert.rejects(first.publish({ ...target.input, attemptKey: evidenceHash('synthetic-missing-support'), candidate: unsupported }, target.lease), denied('invalid-request'));
      assert.equal((await counts(target.fixture.id)).sets, 0);
    });
    await t.test('publication races with cycle close under the shared transaction boundary', async () => {
      const target = await setup(); let release, began;
      const gate = new Promise((resolve) => { release = resolve; }), entered = new Promise((resolve) => { began = resolve; });
      const close = history.withFixtureTransaction(target.fixture.id, async (writer, tx) => {
        const cycle = await storedCycle(tx, target.cycle.id); began(); await gate;
        return writer.changeCycle({ ...cycleChange(cycle, { state: 'closed', closedAt: at }, 'racing-close'), at });
      });
      await entered;
      const pending = second.publish(target.input, target.lease); release(); await close;
      assert.equal((await pending).refresh.reason, 'closed-cycle');
      assert.equal((await counts(target.fixture.id)).sets, 0);
      assert.equal((await history.findCycle(target.cycle.id)).state, 'closed');
    });
    await t.test('publication races with schedule update and cannot use the superseded version', async () => {
      const target = await setup(); let release, began;
      const gate = new Promise((resolve) => { release = resolve; }), entered = new Promise((resolve) => { began = resolve; });
      const update = history.withFixtureTransaction(target.fixture.id, async (writer, tx) => {
        const cycle = await storedCycle(tx, target.cycle.id); began(); await gate;
        return writer.changeCycle({ ...cycleChange(cycle, {}, 'racing-schedule'), at,
          schedule: { kickoffAt: cycle.kickoffAt + 60_000, providerObservedAt: at, actualStartedAt: null } });
      });
      await entered; const pending = second.publish(target.input, target.lease); release(); await update;
      assert.equal((await pending).refresh.reason, 'schedule-changed');
      assert.equal((await counts(target.fixture.id)).sets, 0);
    });
    await t.test('a publication winning the shared lock is visible to the subsequent close decision', async () => {
      const target = await setup(); let release, began, calls = 0;
      const gate = new Promise((resolve) => { release = resolve; }), entered = new Promise((resolve) => { began = resolve; });
      const controlled = publisher(a, { queue: { assertOwned: async (tx, lease) => {
        if (++calls === 2) { began(); await gate; } return queue.assertOwned(tx, lease);
      } } });
      const pending = controlled.publish(target.input, target.lease); await entered;
      const closing = createMysqlPredictionHistoryStore(b).withFixtureTransaction(target.fixture.id, async (writer, tx) => {
        const cycle = await storedCycle(tx, target.cycle.id);
        return writer.changeCycle({ ...cycleChange(cycle, { state: 'closed', closedAt: at,
          lockedSetId: cycle.currentSetId, lockedAt: at }, 'publish-first-close'), at });
      });
      release(); const published = await pending, closed = await closing;
      assert.equal(published.refresh.outcome, 'published'); assert.equal(closed.lockedSetId, published.revision.id);
      assert.equal((await first.displayForFixture(target.fixture.id)).mode, 'locked');
      assert.deepEqual(await second.publish(target.input, target.lease), published);
    });
    await t.test('failure after reference/result/event writes rolls back everything; retry commits once', async () => {
      const target = await setup(), before = await catalog.fixtureByProviderId(target.fixture.externalId);
      let calls = 0;
      const rollback = publisher(a, { queue: { assertOwned: async (tx, lease) => {
        const time = await queue.assertOwned(tx, lease); if (++calls === 2) throw new Error('synthetic-precommit-crash'); return time;
      } } });
      await assert.rejects(rollback.publish(target.input, target.lease), denied('unavailable'));
      assert.deepEqual(await counts(target.fixture.id), { sets: 0, results: 0, events: 0 });
      assert.equal((await catalog.fixtureByProviderId(target.fixture.externalId)).dataVersion, before.dataVersion);
      assert.equal((await history.findCycle(target.cycle.id)).currentSetId, null);
      assert.equal((await history.auditHistory(target.cycle.id)).length, 1);
      const accepted = await second.publish(target.input, target.lease);
      assert.equal(accepted.refresh.outcome, 'published');
      for (const table of ['PredictionSet','MarketPrediction','PredictionRefreshResult','PredictionChangeEvent'])
        await assert.rejects(a.query((tx) => tx.$executeRawUnsafe(`DELETE FROM ${table}`)));
      const events = await first.changesForFixture(target.fixture.id);
      assert.equal(events.length, 1);
      assert.deepEqual(await first.changesForFixture(target.fixture.id, { afterVersion: events[0].version }), []);
    });
    await t.test('crossing cutoff during the transaction rolls back the provisional snapshot/reference/result/event', async () => {
      const target = await setup(), kickoffAt = at + 300_001;
      await history.withFixtureTransaction(target.fixture.id, async (writer, tx) => {
        const cycle = await storedCycle(tx, target.cycle.id);
        await writer.changeCycle({ ...cycleChange(cycle, {}, 'one-ms-before-cutoff'), at,
          schedule: { kickoffAt, providerObservedAt: at, actualStartedAt: null } });
        await tx.footballFixture.update({ where: { id: target.fixture.id }, data: { kickoff: new Date(kickoffAt) } });
      });
      const fixture = await catalog.fixtureByProviderId(target.fixture.externalId), context = evidenceContext(fixture, { runId: target.runId, cycleId: target.cycle.id });
      const approved = evidenceAuthority(), snapshot = buildEvidenceSnapshot({ context, policy: evidencePolicy(), sources: [evidenceSource(context)] }, approved);
      const evidenceId = evidenceHash(randomUUID()); await evidence.save(evidenceId, evidenceHash(`request:${evidenceId}`), snapshot, approved);
      const input = publicationInput(historyCandidate({ snapshot, model, jobId: target.lease.jobId }), evidenceId, 2);
      let calls = 0;
      const slow = publisher(a, { queue: { assertOwned: async (tx, lease) => {
        if (++calls === 2) await tx.$executeRawUnsafe(`SET timestamp = ${(at + 1) / 1000}`);
        return queue.assertOwned(tx, lease);
      } } });
      await assert.rejects(slow.publish(input, target.lease), denied('eligibility-expired'));
      assert.deepEqual(await counts(target.fixture.id), { sets: 0, results: 0, events: 0 });
      assert.equal((await history.findCycle(target.cycle.id)).currentSetId, null);
    });
  } finally {
    await Promise.all(databases.map((db) => db.disconnect().catch(() => {}))); await instance.stop();
  }
});
