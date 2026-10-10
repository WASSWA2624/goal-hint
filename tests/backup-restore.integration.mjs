import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { captureMysqlSnapshot, archiveOwnedMysqlLogs, withRestoredMysql } from '../scripts/lib/backup-engine.mjs';
import { ownedMysqlSource } from '../scripts/lib/mysql-backup.mjs';
import { backupPolicy, backupAuthority } from './helpers/backup-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';
import { evidenceHash, evidenceAuthority } from './helpers/evidence-fixtures.mjs';
import { recoveryHarness } from './helpers/recovery-fixtures.mjs';
import { lifecycleInput, lifecyclePolicy, lifecycleAuthority } from './helpers/lifecycle-fixtures.mjs';
import { publicationPolicy, publicationAuthority } from './helpers/publication-fixtures.mjs';
import { cutoffPolicy, cutoffAuthority } from './helpers/cutoff-fixtures.mjs';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { createMarketSettlementService } from '../src/server/settlement/settlement-service.ts';
import { createMysqlPredictionHistoryStore } from '../src/server/predictions/history-mysql-store.ts';
import { createRevisionPublicationService } from '../src/server/predictions/publication-service.ts';
import { createCutoffLockingService } from '../src/server/predictions/cutoff-service.ts';
import { createMysqlEvidenceStore } from '../src/server/evidence/evidence-mysql-store.ts';
import { assertPreparedEvidenceSnapshot, buildEvidenceSnapshot } from '../src/server/evidence/evidence-snapshot.ts';
import { createQuotaLimiter } from '../src/server/football/quota-limiter.ts';
import { createMysqlQuotaStore } from '../src/server/football/quota-mysql-store.ts';
import { createMysqlJobQueue } from '../src/server/jobs/job-mysql-store.ts';
import { createDatabase } from '../src/server/database/client.ts';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';

test('encrypted snapshot and multi-log PITR preserve representative durable history on owned genuine MySQL', { timeout: 600_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    await p.instance.executeAdmin("GRANT SELECT, INSERT, UPDATE ON goal_hint_test.ApiQuotaPeriod TO 'cutoff_app'@'127.0.0.1'; GRANT SELECT, INSERT, UPDATE ON goal_hint_test.ApiQuotaAttempt TO 'cutoff_app'@'127.0.0.1';");
    const locked = await p.setup(3000), current = await p.setup(3005), stale = await p.setup(3002);
    const publication = await p.publisher.publish(locked.input, locked.lease), currentPublication = await p.publisher.publish(current.input, current.lease);
    p.setTime(locked.cycle.cutoffAt); const lockReceipt = await p.first.close(p.target(locked));
    const h = await recoveryHarness(p);
    await h.repair([{ kind: 'job', jobId: locked.lease.jobId, expectedVersion: (await p.queue.inspect(locked.lease.jobId)).version }]);
    assert.equal(await p.a.query((tx) => tx.recoveryAudit.count()), 2);
    const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
    await lifecycle.observe(lifecycleInput(current, p.now(), { kickoffAt: current.cycle.kickoffAt + 60_000 }));
    assert.equal((await p.history.scheduleHistory(current.cycle.id)).length, 2);
    const accountId = evidenceHash('synthetic-restore-account'), periodId = evidenceHash('synthetic-restore-period');
    const limiter = createQuotaLimiter({ accountId, store: createMysqlQuotaStore(p.a), verifyEvidence: () => true });
    const period = { accountId, periodId, startsAt: p.now() - 1000, endsAt: p.now() + 86_400_000,
      subscriptionExpiresAt: p.now() + 2 * 86_400_000, providerDailyLimit: 150_000, dailyRemaining: 150_000,
      secondLimit: 15, minuteLimit: 900, evidenceRef: 'synthetic-current-capacity' };
    assert.equal((await limiter.initialize(period)).status, 'initialized');
    const resultStore = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
    const settlement = createMarketSettlementService({ database: p.a, queue: p.queue }); let sequence = 0;
    async function result(home, away) {
      p.setTime(Math.max(p.now() + 1000, locked.cycle.kickoffAt + 7_200_000));
      const observation = parseLifecycleInput(lifecycleInput(locked, p.now(), { status: 'FT', raw: {
        goals: { home, away }, score: { fulltime: { home, away }, extratime: null, penalty: null } } }));
      const lease = await resultStore.acquire(evidenceHash(`synthetic-restore-poller:${++sequence}`), 30_000); assert.ok(lease);
      const batch = { id: evidenceHash(`synthetic-restore-batch:${sequence}`), accountId, policyHash: evidenceHash('synthetic-result-policy'),
        receivedAt: p.now(), channel: 'ids', date: null, requestedIds: [Number(locked.fixture.externalId)], observations: [observation], error: null, requestsDispatched: 1 };
      try { await resultStore.save(lease, batch); await resultStore.apply(lease, batch); } finally { await resultStore.release(lease); }
      await settlement.settleFixture(locked.fixture.id);
    }
    await result(2, 1);
    const baselineResults = await p.a.query((tx) => tx.fixtureResult.count()), baselineSettlement = await settlement.forFixture(locked.fixture.id);
    const source = await ownedMysqlSource(p.instance); const root = path.resolve('.tmp'); await mkdir(root, { recursive: true });
    const directory = await mkdtemp(path.join(root, 'backup-drill-')), artifacts = path.join(directory, 'artifacts'), key = randomBytes(32), events = [];
    const options = { source, directory: artifacts, key, policy: backupPolicy(), authority: backupAuthority(), emit: (event) => events.push(event) };
    try {
      const snapshot = await captureMysqlSnapshot(options);
      assert.equal(snapshot.metadata.inventory.tables.length, 63); assert.ok(snapshot.metadata.inventory.tables.find((v) => v.table.toLowerCase() === 'predictionset').count >= 2);
      assert.ok(snapshot.metadata.inventory.tables.find((v) => v.table.toLowerCase() === 'predictionaudit').count > 0);
      assert.ok(snapshot.metadata.inventory.tables.find((v) => v.table.toLowerCase() === 'dailyrunmanifest').count > 0);
      // Commit a correction, rotate, then another correction and a counted launch.
      await result(1, 1); await source.query('FLUSH BINARY LOGS'); await result(0, 0);
      const request = { requestId: evidenceHash('synthetic-after-snapshot-request'), workKey: evidenceHash('synthetic-after-snapshot-work'),
        priority: 'daily-inputs', deadlineAt: p.now() + 60_000, timeoutMs: 1000 };
      const dispatch = await limiter.reserve(request); assert.equal(dispatch.status, 'reserved');
      assert.equal((await limiter.claimLaunch(dispatch.permit)).status, 'claimed');
      // An uncertain outbound dispatch must stay spent after recovery.
      const recoveryPoint = await archiveOwnedMysqlLogs({ ...options, snapshot }); assert.equal(recoveryPoint.metadata.files.length, 2);
      const finalSettlement = await settlement.forFixture(locked.fixture.id);
      const grants = (await p.instance.executeAdmin("SHOW GRANTS FOR 'cutoff_app'@'127.0.0.1'")).stdout.trim().split(/\r?\n/u);
      assert.ok(grants.every((sql) => sql.startsWith('GRANT USAGE ON *.*') || sql.includes('`goal_hint_test`.')));
      const migrationSecret = randomBytes(24).toString('hex'), appSecret = randomBytes(24).toString('hex');
      const prepareTarget = async (instance, grantsRef) => {
        assert.equal(grantsRef, options.policy.grantsRef);
        await instance.executeAdmin(`CREATE USER 'cutoff_migration'@'127.0.0.1' IDENTIFIED BY '${migrationSecret}' ACCOUNT LOCK;
          GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES, TRIGGER ON goal_hint_test.* TO 'cutoff_migration'@'127.0.0.1';`);
      };
      async function inspect({ instance, target, quarantined, recoveryPoint: restoredPoint }) {
        assert.equal(quarantined, true); assert.notEqual(instance.port, p.instance.port);
        assert.notEqual((await target.identity()).uuid, snapshot.metadata.identity.uuid);
        assert.equal((await target.query("SELECT COUNT(*) FROM mysql.user WHERE User='cutoff_app'"))[0], '0');
        assert.equal((await target.query('SELECT @@event_scheduler'))[0], 'OFF');
        await instance.executeAdmin(`CREATE USER 'cutoff_app'@'127.0.0.1' IDENTIFIED BY '${appSecret}'; ${grants.join(';')};`);
        const base = createDatabase(parseRuntimePolicy({ ...p.env, TEST_DATABASE_URL: `mysql://cutoff_app:${appSecret}@127.0.0.1:${instance.port}/goal_hint_test` }));
        const database = { query: base.query.bind(base), transaction: (operation, txOptions) => base.transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET timestamp=${p.now()/1000}`);
          try { return await operation(tx); } finally { await tx.$executeRawUnsafe('SET timestamp=0'); }
        }, txOptions) };
        try {
          const history = createMysqlPredictionHistoryStore(database), queue = createMysqlJobQueue(database);
          assert.deepEqual(await history.findRevision(publication.revision.id), publication.revision);
          assert.deepEqual(await history.findRevision(currentPublication.revision.id), currentPublication.revision);
          assert.equal((await history.findCycle(locked.cycle.id)).lockedSetId, publication.revision.id);
          assert.equal((await history.findCycle(current.cycle.id)).currentSetId, currentPublication.revision.id);
          assert.deepEqual(await history.auditHistory(locked.cycle.id), await p.history.auditHistory(locked.cycle.id));
          assert.deepEqual(await history.scheduleHistory(locked.cycle.id), await p.history.scheduleHistory(locked.cycle.id));
          assert.deepEqual(await history.scheduleHistory(current.cycle.id), await p.history.scheduleHistory(current.cycle.id));
          assert.equal(await database.query((tx) => tx.recoveryAudit.count()), 2);
          const results = await createMarketSettlementService({ database, queue }).forFixture(locked.fixture.id);
          assert.deepEqual(results, restoredPoint ? finalSettlement : baselineSettlement);
          assert.equal(await database.query((tx) => tx.fixtureResult.count()), baselineResults + (restoredPoint ? 2 : 0));
          // Reuse the actual source permission verifier after restore; hashes alone are not reuse rights.
          const evidence = await createMysqlEvidenceStore(database).find(locked.input.evidenceSnapshotId);
          assert.ok(evidence);
          let reuseAllowed = true, permissionNow = evidence.snapshot.context.analysisAt;
          const authority = evidenceAuthority({ verifyReuse: (source) => reuseAllowed && source.reuse.retainUntil >= permissionNow });
          const prepared = buildEvidenceSnapshot(evidence.snapshot, authority);
          assert.deepEqual(prepared, evidence.snapshot);
          assertPreparedEvidenceSnapshot(prepared, authority);
          reuseAllowed = false;
          assert.throws(() => assertPreparedEvidenceSnapshot(prepared, authority), { reason: 'not-authorized' });
          reuseAllowed = true; permissionNow += 2 * 86_400_000;
          assert.throws(() => assertPreparedEvidenceSnapshot(prepared, authority), { reason: 'not-authorized' });
          assert.deepEqual((await createMysqlEvidenceStore(database).find(locked.input.evidenceSnapshotId)).snapshot, evidence.snapshot);
          for (const table of ['PredictionSet','MarketPrediction','PredictionAudit','EvidenceSourceVersion','RecoveryAudit','FixtureResult','MarketSettlementRevision']) {
            await assert.rejects(database.query((tx) => tx.$executeRawUnsafe(`DELETE FROM ${table}`)));
          }
          await assert.rejects(database.query((tx) => tx.$executeRawUnsafe('CREATE TABLE forbidden_restore_ddl (id INT)')));
          await assert.rejects(database.query((tx) => tx.$queryRawUnsafe('SELECT * FROM _prisma_migrations')));
          // Restored receipts return the original forecast; a stale owner cannot acknowledge work.
          const publisher = createRevisionPublicationService({ database, queue, policy: publicationPolicy(), authority: publicationAuthority() });
          assert.deepEqual(await publisher.publish(locked.input, locked.lease), publication);
          const cutoff = createCutoffLockingService({ database, queue, policy: cutoffPolicy(), authority: cutoffAuthority() });
          assert.deepEqual(await cutoff.close(p.target(locked)), lockReceipt);
          await assert.rejects(queue.acknowledge(stale.lease));
          const staleJob = await queue.inspect(stale.lease.jobId);
          await database.transaction((tx) => queue.recoverInTransaction(tx, staleJob.id, staleJob.version, async () => 'expired'));
          assert.equal((await queue.inspect(staleJob.id)).state, 'expired');
          assert.equal(await database.query((tx) => tx.predictionSet.count()), 2);
          // Outside the lost database, inspect current capacity before granting any outbound identity.
          // This approved synthetic evidence accounts for the dispatch absent from the base snapshot.
          const restoredLimiter = createQuotaLimiter({ accountId, store: createMysqlQuotaStore(database), verifyEvidence: () => true });
          assert.equal((await restoredLimiter.initialize({ ...period, dailyRemaining: 0 })).status, 'initialized');
          assert.equal((await restoredLimiter.initialize(period)).status, 'initialized');
          const quota = await database.query((tx) => tx.apiQuotaPeriod.findUniqueOrThrow({ where: { accountId_id: { accountId, id: periodId } } }));
          assert.ok(quota.stateJson.used >= 150_000); assert.equal(quota.stateJson.dayRemaining, 0);
          assert.equal((await restoredLimiter.reserve({ ...request, requestId: evidenceHash('synthetic-resume-request'), workKey: evidenceHash('synthetic-resume-work') })).reason, 'daily-limit');
          p.setTime(period.endsAt);
          try { assert.equal((await restoredLimiter.reserve({ ...request, deadlineAt: p.now() + 60_000 })).reason, 'reset-unconfirmed'); }
          finally { p.setTime(locked.cycle.kickoffAt + 7_202_000); }
          return { tables: snapshot.metadata.inventory.tables.length, historyVerified: true, outboundEnabled: false };
        } finally { await base.disconnect(); }
      }
      let verificationError;
      const verify = async (context) => { verificationError = null; try { return await inspect(context); }
        catch (error) { verificationError = error; throw error; } };
      async function restore(pitr = false) {
        try { return await withRestoredMysql({ ...options, prepareTarget, pitr }, verify); }
        catch (error) { throw verificationError ?? error; }
      }
      await t.test('base snapshot restores independently and keeps original history, grants and safe resume semantics', async () => {
        const restored = await restore();
        assert.equal(restored.objective, 'unapproved'); assert.ok(restored.demonstratedLagMs >= 0);
      });
      await t.test('multi-log replay recovers corrections and spent requests through an exact committed position', async () => {
        const restored = await restore(true);
        assert.deepEqual(restored.recoverablePosition, { file: recoveryPoint.metadata.end.file, position: recoveryPoint.metadata.end.position });
        assert.equal(restored.objective, 'unapproved');
      });
      await t.test('tampered artifacts refuse before allocating a restore target or preparing accounts', async () => {
        const file = path.join(artifacts, 'snapshot.ghb'), original = await readFile(file), corrupted = Buffer.from(original); corrupted[corrupted.length - 1] ^= 1;
        await writeFile(file, corrupted); let prepared = false;
        try { await assert.rejects(withRestoredMysql({ ...options, prepareTarget: () => { prepared = true; } }, () => {})); assert.equal(prepared, false); }
        finally { await writeFile(file, original); }
      });
      const success = events.filter((event) => event.operation === 'restore' && event.status === 'succeeded'); assert.equal(success.length, 2);
      for (const event of success) t.diagnostic(`Local ${event.operation}: ${event.durationMs} ms; recoverable UTC ${new Date(event.recoverableAt).toISOString()}; objectives ${event.objective}.`);
      assert.ok(events.some((event) => event.status === 'failed'));
      assert.ok(events.every((event) => !JSON.stringify(event).includes(appSecret)));
    } finally {
      key.fill(0); const actual = await realpath(directory), parent = await realpath(root);
      assert.equal(path.relative(await realpath('.'), parent), '.tmp');
      assert.equal(path.dirname(actual), parent); assert.ok(path.basename(actual).startsWith('backup-drill-'));
      await rm(actual, { recursive: true });
    }
  }, { binaryLog: true });
});
