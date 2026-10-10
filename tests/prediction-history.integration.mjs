import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { createDatabase } from '../src/server/database/client.ts';
import { createFootballCatalogStore } from '../src/server/football/catalog-mysql-store.ts';
import { createFootballCatalogImporter } from '../src/server/football/catalog-service.ts';
import { createMysqlEvidenceStore } from '../src/server/evidence/evidence-mysql-store.ts';
import { buildEvidenceSnapshot } from '../src/server/evidence/evidence-snapshot.ts';
import { createMysqlModelVersionStore } from '../src/server/predictor/predictor-mysql-store.ts';
import { createMysqlPredictionHistoryStore } from '../src/server/predictions/history-mysql-store.ts';
import { PredictionHistoryError } from '../src/server/predictions/history-contract.ts';
import { storedCycle } from '../src/server/predictions/history-read.ts';
import { modelAuthority, modelVersion } from './helpers/predictor-fixtures.mjs';
import { evidenceContext, evidenceHash, evidenceAuthority, evidencePolicy, evidenceSource } from './helpers/evidence-fixtures.mjs';
import { CATALOG_NOW, catalogFixture, catalogRequest, createSyntheticCatalogAdapter } from './helpers/catalog-fixtures.mjs';
import { historyCandidate, cycleCreation, cycleChange, revisionInput } from './helpers/prediction-history-fixtures.mjs';
import { MysqlServerUnavailableError, startIsolatedMysql } from './helpers/mysql-instance.mjs';

const execute = promisify(execFile), workspace = fileURLToPath(new URL('../', import.meta.url));
const script = fileURLToPath(new URL('../scripts/database.mjs', import.meta.url));
const denied = (reason) => (error) => error instanceof PredictionHistoryError && error.reason === reason;
// Import receipts and audits are append-only, matching the application role.
const catalogAppendOnly = ['FootballFixtureAudit', 'FootballImport'];
const catalogTables = ['FootballCatalogLock', 'FootballTeam', 'FootballTeamProvider', 'FootballTeamAlias',
  'FootballCompetition', 'FootballCompetitionProvider', 'FootballCompetitionAlias', 'FootballSeason',
  'FootballFixture', 'FootballIdentityReview', ...catalogAppendOnly];
const immutableTables = ['EvidenceSourceVersion', 'FixtureEvidenceSnapshot', 'FixtureEvidenceSnapshotSource', 'ModelVersion',
  'DailyRun', 'PredictionSet', 'MarketPrediction', 'PredictionSchedule', 'PredictionAudit'];
function environment(applicationUrl, migrationUrl) {
  const env = { ...process.env }, credentials = new Set(['DATABASE_URL', 'TEST_DATABASE_URL', 'MIGRATION_DATABASE_URL', 'API_FOOTBALL_KEY', 'AI_API_KEY', 'RESEARCH_API_KEY']);
  for (const key of Object.keys(env)) if (key.startsWith('GOAL_HINT_') || key.startsWith('NEXT_PUBLIC_') || credentials.has(key)) delete env[key];
  return { ...env, NODE_ENV: 'test', DEBUG: '', GOAL_HINT_OPERATION_SCOPE: 'disabled', GOAL_HINT_DATABASE_ENABLED: 'true',
    TEST_DATABASE_URL: applicationUrl, MIGRATION_DATABASE_URL: migrationUrl, GOAL_HINT_DATABASE_CONNECTION_MODE: 'direct',
    GOAL_HINT_DATABASE_POOL_LIMIT: '4', GOAL_HINT_DATABASE_TLS_MODE: 'disabled', GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS: '1000',
    GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS: '10000' };
}
function catalogAuthority() {
  return { authorize() {}, authorizeMapping() {}, verifyRetention: () => true, verifyObservation: () => true,
    verifyLogo: () => true, verifyRegulationScore: () => true, verifyMapping: () => false,
    regulationEvidenceRef: () => 'synthetic-regulation-proof', verifyKnownSubset: () => true };
}

test('immutable prediction history on isolated genuine MySQL', { timeout: 300000 }, async (t) => {
  let instance;
  try { instance = await startIsolatedMysql(); }
  catch (error) {
    if (!(error instanceof MysqlServerUnavailableError)) throw error;
    t.skip(`${error.message} Prediction-history database acceptance remains pending.`); return;
  }
  t.diagnostic(`Owned throwaway server: ${instance.version}. All forecasts, permissions, lifecycle decisions and times are synthetic; no provider requests.`);
  t.beforeEach(() => instance.assertOwnership());
  const migrationPassword = randomBytes(24).toString('hex'), applicationPassword = randomBytes(24).toString('hex');
  const env = environment(`mysql://history_application:${applicationPassword}@127.0.0.1:${instance.port}/goal_hint_test`,
    `mysql://history_migration:${migrationPassword}@127.0.0.1:${instance.port}/goal_hint_test`);
  const databases = [], clock = { now: () => CATALOG_NOW + 120_000 };
  const replica = () => { const db = createDatabase(parseRuntimePolicy(env)); databases.push(db); return db; };
  try {
    await instance.executeAdmin(`CREATE USER 'history_migration'@'127.0.0.1' IDENTIFIED BY '${migrationPassword}';
      CREATE USER 'history_application'@'127.0.0.1' IDENTIFIED BY '${applicationPassword}';
      GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES, TRIGGER ON goal_hint_test.* TO 'history_migration'@'127.0.0.1';`);
    await execute(process.execPath, ['--conditions=react-server', script, 'deploy'], { cwd: workspace, env, windowsHide: true, timeout: 60000 });
    await instance.executeAdmin(catalogTables.map((name) => `GRANT ${catalogAppendOnly.includes(name) ? 'SELECT, INSERT' : 'SELECT, INSERT, UPDATE, DELETE'} ON goal_hint_test.${name} TO 'history_application'@'127.0.0.1';`).join('\n') +
      immutableTables.map((name) => `GRANT SELECT, INSERT ON goal_hint_test.${name} TO 'history_application'@'127.0.0.1';`).join('\n') +
      `GRANT SELECT, INSERT ON goal_hint_test.PredictionCycle TO 'history_application'@'127.0.0.1';
       GRANT UPDATE (version, scheduleVersion, kickoffAt, cutoffAt, state, currentSetId, lockedSetId, closedAt, lockedAt, voidedAt, voidReason)
         ON goal_hint_test.PredictionCycle TO 'history_application'@'127.0.0.1';`);
    const a = replica(), b = replica();
    const catalog = createFootballCatalogStore(a), evidence = createMysqlEvidenceStore(a, { catalog });
    const first = createMysqlPredictionHistoryStore(a, { catalog, clock }), second = createMysqlPredictionHistoryStore(b, { clock });
    const model = modelVersion(); await createMysqlModelVersionStore(a).save(model, modelAuthority());
    async function seed(id = 101) {
      const fake = createSyntheticCatalogAdapter({ rows: [catalogFixture(id)] });
      const importer = createFootballCatalogImporter({ adapter: fake.adapter, store: catalog, authority: catalogAuthority(), clock: { now: () => CATALOG_NOW } });
      assert.equal((await importer.import(catalogRequest({ kind: 'fixtures', query: { fixtureId: id } }))).status, 'complete');
      return catalog.fixtureByProviderId(id);
    }
    async function prepare(fixture, cycle, run, options = {}) {
      const latest = await catalog.fixtureByProviderId(fixture.externalId);
      const context = evidenceContext(latest, { cycleId: cycle.id, runId: run.id });
      const approved = evidenceAuthority(), snapshot = buildEvidenceSnapshot({ context, policy: evidencePolicy(), sources: [evidenceSource(context)] }, approved);
      const evidenceId = evidenceHash(randomUUID());
      await evidence.save(evidenceId, evidenceHash(`request:${evidenceId}`), snapshot, approved);
      return revisionInput(historyCandidate({ snapshot, model, ...options }), evidenceId, cycle.scheduleVersion);
    }
    async function publish(store, input) {
      return store.withFixtureTransaction(input.candidate.context.context.fixtureId, async (writer, transaction) => {
        const revision = await writer.appendRevision(input), cycle = await storedCycle(transaction, revision.cycleId);
        if (cycle.currentSetId !== revision.id) await writer.changeCycle(cycleChange(cycle, { currentSetId: revision.id }, `publish:${revision.runId}`));
        return revision;
      });
    }
    const fixture = await seed(); let cycle, oldRun, run, original, newer;
    await t.test('all migrations deploy on InnoDB without drift or application DDL', async () => {
      await execute(process.execPath, ['--conditions=react-server', script, 'verify'], { cwd: workspace, env, windowsHide: true, timeout: 60000 });
      const rows = await a.query((tx) => tx.$queryRaw`SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('DailyRun','PredictionCycle','PredictionSet','MarketPrediction','PredictionSchedule','PredictionAudit')`);
      assert.equal(rows.length, 6); assert.ok(rows.every((row) => row.ENGINE === 'InnoDB'));
      await assert.rejects(a.query((tx) => tx.$executeRaw`CREATE TABLE forbidden_history_ddl (id INT)`));
      await assert.rejects(a.query((tx) => tx.$queryRaw`SELECT migration_name FROM _prisma_migrations`));
    });
    await t.test('concurrent EAT run identity is idempotent and run order is chronological even when dates are backfilled', async () => {
      const values = await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? first : second).createRun('2026-10-09', CATALOG_NOW)));
      run = values[0]; assert.ok(values.every((value) => value.id === run.id));
      oldRun = await first.createRun('2026-10-08', CATALOG_NOW);
      assert.ok(oldRun.sequence < run.sequence);
      assert.equal((await a.query((tx) => tx.$queryRaw`SELECT COUNT(*) AS count FROM DailyRun`))[0].count, 2n);
    });
    await t.test('concurrent cycle creation shares one identity/schedule/audit and does not infer postponement', async () => {
      const input = cycleCreation(fixture);
      const values = await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? first : second).createCycle(input)));
      cycle = values[0]; assert.ok(values.every((value) => value.id === cycle.id));
      assert.equal((await first.scheduleHistory(cycle.id)).length, 1);
      assert.equal((await first.auditHistory(cycle.id)).length, 1);
      assert.equal((await first.auditHistory(cycle.id))[0].after.activeCycleId, cycle.id);
      assert.equal((await first.displayForFixture(fixture.id)).revision, null);
      await assert.rejects(second.createCycle({ ...input, kickoffAt: input.kickoffAt + 1000 }), denied('conflicting-request'));
    });
    await t.test('concurrent duplicate refreshes create one complete immutable revision and publication reference atomically', async () => {
      const input = await prepare(fixture, cycle, oldRun);
      const revisions = await Promise.all(Array.from({ length: 6 }, (_, i) => publish(i % 2 ? first : second, input)));
      original = revisions[0]; assert.ok(revisions.every((value) => value.id === original.id));
      assert.deepEqual(await second.findRevision(original.id), original);
      assert.deepEqual(original.candidate, input.candidate); assert.equal(original.predecessorId, null);
      assert.equal((await first.displayForFixture(fixture.id)).revision.id, original.id);
      assert.equal((await first.currentRevision(cycle.id)).id, original.id); assert.equal(await first.lockedRevision(cycle.id), null);
      assert.equal((await a.query((tx) => tx.$queryRaw`SELECT COUNT(*) AS count FROM PredictionSet WHERE cycleId = ${cycle.id}`))[0].count, 1n);
      await assert.rejects(publish(second, { ...input, generationCompletedAt: input.generationCompletedAt + 1 }), denied('conflicting-request'));
      cycle = await first.findCycle(cycle.id);
    });
    await t.test('newer partial fallback snapshots do not inherit unsupported older families or invent provider timestamps', async () => {
      const input = await prepare(fixture, cycle, run, { source: 'api-football' });
      newer = await publish(first, input);
      const current = (await second.displayForCycle(cycle.id)).revision;
      assert.equal(current.id, newer.id); assert.equal(current.predecessorId, original.id);
      assert.equal(current.cycleRevision, 2); assert.ok(current.runSequence > original.runSequence);
      assert.equal(current.candidate.markets['total-goals'].available, false);
      assert.equal(original.candidate.markets['total-goals'].available, true);
      assert.equal(current.candidate.markets['match-result'].market.source, 'api-football');
      assert.equal(current.candidate.markets['double-chance'].market.source, 'api-football');
      assert.equal(current.candidate.markets['match-result'].timestamps.providerUpdatedAt, null);
      assert.equal(current.candidate.markets['match-result'].timestamps.generatedAt, null);
      assert.equal(current.candidate.markets['match-result'].fallback.detail, 'unconfigured');
      assert.equal(current.publishedAt, input.publishedAt); assert.equal(current.evidenceCutoffAt, input.candidate.context.context.cutoffAt);
      cycle = await first.findCycle(cycle.id);
    });
    await t.test('binary64 precision, unknown clocks, source provenance and original explanations survive round trip', async () => {
      const preciseFixture = await seed(102), preciseCycle = await first.createCycle(cycleCreation(preciseFixture));
      const exactVersion = 9_007_199_254_740_993n;
      await a.query((tx) => tx.footballFixture.update({ where: { id: preciseFixture.id }, data: { dataVersion: exactVersion } }));
      const input = await prepare(preciseFixture, preciseCycle, run, { probabilities: {
        'match-result': { period: 'regulation-including-stoppage-time', probabilities: { 'home-win': 0.3333333333333333, draw: 0.3333333333333333, 'away-win': 0.3333333333333333 } },
        'total-goals': null, 'both-teams-to-score': null } });
      const revision = await publish(first, input), archived = await second.findRevision(revision.id);
      assert.deepEqual(archived.candidate, input.candidate);
      assert.equal(archived.fixtureVersion, exactVersion);
      assert.equal(archived.candidate.context.context.fixtureVersion, exactVersion);
      assert.equal(archived.candidate.markets['match-result'].market.probabilities['home-win'], 0.3333333333333333);
      assert.equal(archived.modelVersionId, model.id); assert.equal(archived.candidate.markets['match-result'].provenance.evidenceHash, input.candidate.context.evidenceHash);
    });
    await t.test('invalid probabilities, mismatched evidence/fixture/cycle identities and older runs cannot append', async () => {
      const early = await first.createRun('2026-10-07', CATALOG_NOW), input = await prepare(fixture, cycle, early);
      await assert.rejects(publish(first, input), denied('out-of-order'));
      await assert.rejects(publish(first, { ...input, scheduleVersion: cycle.scheduleVersion + 1 }), denied('stale-version'));
      await assert.rejects(first.withFixtureTransaction(fixture.id, (writer) => writer.changeCycle(
        cycleChange({ ...cycle, version: cycle.version - 1 }, {}, 'stale-version'))), denied('stale-version'));
      const invalid = structuredClone(input); invalid.candidate.markets['match-result'].market.probabilities['home-win'] = 1;
      await assert.rejects(publish(first, invalid), denied('invalid-request'));
      const mismatch = structuredClone(input); mismatch.candidate.context.context.cycleId = randomUUID();
      await assert.rejects(publish(first, mismatch), denied('not-found'));
      await assert.rejects(publish(first, { ...input, evidenceSnapshotId: original.evidenceSnapshotId }), denied('invalid-request'));
      await assert.rejects(first.withFixtureTransaction(fixture.id, (writer) => writer.appendRevision({ ...input,
        candidate: { ...input.candidate, context: { ...input.candidate.context, context: { ...input.candidate.context.context, fixtureId: randomUUID() } } } })), denied('invalid-request'));
    });
    await t.test('native checks and composite foreign keys reject malformed payloads and cross-cycle references', async () => {
      await assert.rejects(instance.executeAdmin(`UPDATE MarketPrediction SET probability1 = 0.9, selectedProbability = 0.9,
        payloadJson = JSON_SET(payloadJson, '$.market.probabilities."home-win"', 0.9, '$.market.selectedProbability', 0.9),
        integrity = SHA2(CAST(payloadJson AS CHAR), 256) WHERE setId = '${original.id}' AND family = 'match-result'`));
      const otherFixture = await seed(103), otherCycle = await first.createCycle(cycleCreation(otherFixture));
      await assert.rejects(instance.executeAdmin(`UPDATE PredictionCycle SET currentSetId = '${original.id}' WHERE id = '${otherCycle.id}'`));
      await assert.rejects(instance.executeAdmin(`UPDATE FootballFixture SET activeCycleId = '${otherCycle.id}' WHERE id = '${fixture.id}'`));
      assert.deepEqual(await second.findRevision(original.id), original);
    });
    await t.test('application permissions refuse immutable payload mutation, deletion and cycle identity edits', async () => {
      await assert.rejects(a.query((tx) => tx.$executeRaw`UPDATE PredictionSet SET publishedAt = NOW(3) WHERE id = ${original.id}`));
      await assert.rejects(a.query((tx) => tx.$executeRaw`UPDATE MarketPrediction SET probability1 = 0.9 WHERE setId = ${original.id}`));
      await assert.rejects(a.query((tx) => tx.$executeRaw`DELETE FROM PredictionSet WHERE id = ${original.id}`));
      await assert.rejects(a.query((tx) => tx.$executeRaw`UPDATE PredictionSchedule SET reason = 'changed' WHERE cycleId = ${cycle.id}`));
      await assert.rejects(a.query((tx) => tx.$executeRaw`UPDATE PredictionAudit SET reason = 'changed' WHERE cycleId = ${cycle.id}`));
      await assert.rejects(a.query((tx) => tx.$executeRaw`UPDATE PredictionCycle SET ordinal = 999 WHERE id = ${cycle.id}`));
      assert.deepEqual(await second.findRevision(newer.id), newer);
    });
    await t.test('callback failure rolls back revision, markets, reference, audit and fixture version together', async () => {
      const nextRun = await first.createRun('2026-10-10', CATALOG_NOW), input = await prepare(fixture, cycle, nextRun);
      const before = await catalog.fixtureByProviderId(fixture.externalId), audits = await first.auditHistory(cycle.id);
      let escaped;
      await assert.rejects(first.withFixtureTransaction(fixture.id, async (writer, tx) => {
        escaped = writer; const revision = await writer.appendRevision(input), value = await storedCycle(tx, cycle.id);
        await writer.changeCycle(cycleChange(value, { currentSetId: revision.id }, 'rollback'));
        throw new Error('synthetic-private-diagnostic');
      }), (error) => denied('unavailable')(error) && !error.message.includes('synthetic-private-diagnostic'));
      assert.equal((await catalog.fixtureByProviderId(fixture.externalId)).dataVersion, before.dataVersion);
      assert.equal((await first.earlierRevisions(cycle.id)).length, 2); assert.equal((await first.auditHistory(cycle.id)).length, audits.length);
      await assert.rejects(escaped.appendRevision(input), denied('invalid-state'));
      assert.equal((await first.displayForCycle(cycle.id)).revision.id, newer.id);
    });
    await t.test('history is stable and read-only; bounded cursors preserve chronological order', async () => {
      const before = await catalog.fixtureByProviderId(fixture.externalId);
      assert.deepEqual((await first.earlierRevisions(cycle.id)).map((value) => value.id), [newer.id, original.id]);
      assert.deepEqual((await second.earlierRevisions(cycle.id, { beforeRevision: 2, limit: 1 })).map((value) => value.id), [original.id]);
      await first.findRevision(original.id);
      assert.equal((await catalog.fixtureByProviderId(fixture.externalId)).dataVersion, before.dataVersion);
      assert.equal((await first.displayForCycle(cycle.id)).revision.id, newer.id);
      assert.throws(() => first.earlierRevisions(cycle.id, { limit: 101 }));
    });
    await t.test('catching a write failure inside the callback cannot commit an earlier partial mutation', async () => {
      const futureRun = await first.createRun('2026-10-11', CATALOG_NOW), input = await prepare(fixture, cycle, futureRun);
      const before = await catalog.fixtureByProviderId(fixture.externalId);
      await assert.rejects(first.withFixtureTransaction(fixture.id, async (writer) => {
        await writer.appendRevision(input);
        try { await writer.appendRevision({ ...input, publishedAt: input.publishedAt + 1 }); } catch { /* Deliberately caught to test transaction poisoning. */ }
      }), denied('conflicting-request'));
      assert.equal((await first.earlierRevisions(cycle.id)).length, 2);
      assert.equal((await catalog.fixtureByProviderId(fixture.externalId)).dataVersion, before.dataVersion);
    });
    await t.test('closed cycles read only their locked revision and cannot reopen or substitute a more favorable pick', async () => {
      cycle = await first.findCycle(cycle.id);
      const command = cycleChange(cycle, { state: 'closed', closedAt: CATALOG_NOW + 60_000, lockedAt: CATALOG_NOW + 60_000, lockedSetId: newer.id }, 'lock');
      cycle = await first.withFixtureTransaction(fixture.id, (writer) => writer.changeCycle(command));
      assert.equal((await second.displayForFixture(fixture.id)).revision.id, newer.id);
      assert.equal((await second.displayForCycle(cycle.id)).mode, 'locked');
      assert.equal((await second.lockedRevision(cycle.id)).id, newer.id);
      await assert.rejects(first.withFixtureTransaction(fixture.id, (writer) => writer.changeCycle(cycleChange(cycle,
        { lockedSetId: original.id }, 'substitute'))), denied('closed-cycle'));
      await assert.rejects(first.withFixtureTransaction(fixture.id, (writer) => writer.changeCycle(cycleChange(cycle,
        { state: 'open', lockedSetId: null, lockedAt: null, closedAt: null }, 'reopen'))), denied('closed-cycle'));
      assert.equal((await first.withFixtureTransaction(fixture.id, (writer) => writer.changeCycle(command))).version, cycle.version);
    });
    await t.test('schedule corrections append observations and audit while preserving a closed locked forecast', async () => {
      const command = { ...cycleChange(cycle, { state: 'void', voidedAt: CATALOG_NOW + 60_000, voidReason: 'Synthetic earlier-start correction' }, 'schedule-correction'),
        schedule: { kickoffAt: cycle.kickoffAt - 60_000, providerObservedAt: CATALOG_NOW + 50_000, actualStartedAt: CATALOG_NOW + 55_000 } };
      cycle = await first.withFixtureTransaction(fixture.id, (writer) => writer.changeCycle(command));
      const view = await second.displayForCycle(cycle.id);
      assert.equal(view.mode, 'void'); assert.equal(view.revision.id, newer.id); assert.equal(view.cycle.voidReason, command.next.voidReason);
      const schedules = await first.scheduleHistory(cycle.id);
      assert.deepEqual(schedules.map((value) => value.version), [1, 2]);
      assert.equal((await first.scheduleHistory(cycle.id, { afterVersion: 1 }))[0].actualStartedAt, CATALOG_NOW + 55_000);
      const audits = await first.auditHistory(cycle.id, { limit: 2 });
      assert.equal(audits[0].kind, 'cycle-changed'); assert.ok(audits[0].version > audits[1].version);
      assert.equal((await first.auditHistory(cycle.id, { beforeVersion: audits[0].version, limit: 1 }))[0].version, audits[1].version);
    });
    await t.test('closure without a lock is unavailable, then void retains the last prediction and its reason', async () => {
      const target = await seed(104); let value = await first.createCycle(cycleCreation(target));
      const saved = await publish(first, await prepare(target, value, run)); value = await first.findCycle(value.id);
      value = await first.withFixtureTransaction(target.id, (writer) => writer.changeCycle(cycleChange(value,
        { state: 'closed', closedAt: CATALOG_NOW + 60_000 }, 'no-lock')));
      assert.equal((await first.displayForFixture(target.id)).revision, null);
      value = await first.withFixtureTransaction(target.id, (writer) => writer.changeCycle(cycleChange(value,
        { state: 'void', voidedAt: CATALOG_NOW + 60_000, voidReason: 'Synthetic postponement without a locked set' }, 'void-without-lock')));
      assert.equal((await second.displayForCycle(value.id)).revision.id, saved.id);
      const next = await first.createCycle(cycleCreation(target, 'next-cycle', true));
      assert.equal(next.ordinal, 2); assert.equal((await first.displayForFixture(target.id)).cycle.id, next.id);
      assert.deepEqual((await first.cyclesForFixture(target.id)).map((v) => v.id), [next.id, value.id]);
      assert.equal((await first.auditHistory(next.id))[0].before.activeCycleId, value.id);
      assert.equal((await first.displayForFixture(target.id)).revision, null);
      assert.equal((await first.displayForCycle(value.id)).revision.id, saved.id);
    });
    await t.test('empty cycles can close and void honestly without inventing a revision', async () => {
      const target = await seed(105); let value = await first.createCycle(cycleCreation(target));
      value = await first.withFixtureTransaction(target.id, (writer) => writer.changeCycle(cycleChange(value,
        { state: 'closed', closedAt: CATALOG_NOW + 60_000 }, 'empty-close')));
      assert.equal((await first.displayForCycle(value.id)).revision, null);
      value = await first.withFixtureTransaction(target.id, (writer) => writer.changeCycle(cycleChange(value,
        { state: 'void', voidedAt: CATALOG_NOW + 60_000, voidReason: 'Synthetic canceled fixture' }, 'empty-void')));
      assert.equal((await first.displayForCycle(value.id)).revision, null);
      assert.match((await second.displayForCycle(value.id)).cycle.voidReason, /canceled/);
    });
  } finally {
    await Promise.all(databases.map((db) => db.disconnect().catch(() => {}))); await instance.stop();
  }
});
