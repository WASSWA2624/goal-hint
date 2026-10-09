import assert from 'node:assert/strict';
import { execFile, fork } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { createDatabase } from '../src/server/database/client.ts';
import { JobQueueError } from '../src/server/jobs/job-contract.ts';
import { durableJobId } from '../src/server/jobs/job-input.ts';
import { createMysqlJobQueue } from '../src/server/jobs/job-mysql-store.ts';
import { createJobWorker } from '../src/server/jobs/job-worker.ts';
import { runJobWorkerCommand } from '../src/server/jobs/job-command.ts';
import { createFootballCatalogStore } from '../src/server/football/catalog-mysql-store.ts';
import { createFootballCatalogImporter } from '../src/server/football/catalog-service.ts';
import { createMysqlPredictionHistoryStore } from '../src/server/predictions/history-mysql-store.ts';
import { CATALOG_NOW, catalogFixture, catalogRequest, createSyntheticCatalogAdapter } from './helpers/catalog-fixtures.mjs';
import { cycleCreation } from './helpers/prediction-history-fixtures.mjs';
import { jobEnvelope, jobTestEnvironment, jobTestHash, jobTestRegistry } from './helpers/job-fixtures.mjs';
import { MysqlServerUnavailableError, startIsolatedMysql } from './helpers/mysql-instance.mjs';

const execute = promisify(execFile), workspace = fileURLToPath(new URL('../', import.meta.url));
const script = fileURLToPath(new URL('../scripts/database.mjs', import.meta.url));
const childScript = fileURLToPath(new URL('./helpers/job-worker-child.mjs', import.meta.url));
const denied = (reason) => (error) => error instanceof JobQueueError && error.reason === reason;
const owner = jobTestHash('worker-a'), other = jobTestHash('worker-b');
const types = (type) => [{ type, handlerVersion: 1 }];
const catalogTables = ['FootballCatalogLock','FootballTeam','FootballTeamProvider','FootballTeamAlias','FootballCompetition',
  'FootballCompetitionProvider','FootballCompetitionAlias','FootballSeason','FootballFixture','FootballFixtureAudit','FootballImport','FootballIdentityReview'];
function waitMessage(child, kind) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(`Owned child did not report ${kind}`)), 20_000);
    const message = (value) => { if (value.kind === kind) finish(null, value); };
    const exited = () => finish(new Error(`Owned child exited before ${kind}`));
    function finish(error, value) { clearTimeout(timeout); child.off('message', message); child.off('exit', exited); if (error) reject(error); else resolve(value); }
    child.on('message', message); child.once('exit', exited);
  });
}
async function exitWithin(child) {
  let timer;
  try { return await Promise.race([once(child, 'exit'), new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Owned test worker failed to shut down within ten seconds')), 10_000);
  })]); } finally { clearTimeout(timer); }
}
test('durable job execution on isolated genuine MySQL', { timeout: 300000 }, async (t) => {
  let instance;
  try { instance = await startIsolatedMysql(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(`${error.message} Durable job acceptance remains pending.`); return; }
  t.diagnostic(`Owned server: ${instance.version}. All workloads, approvals, identities and effects are synthetic; no provider requests.`);
  t.beforeEach(() => instance.assertOwnership());
  const migrationPassword = randomBytes(24).toString('hex'), applicationPassword = randomBytes(24).toString('hex');
  const env = jobTestEnvironment(`mysql://jobs_application:${applicationPassword}@127.0.0.1:${instance.port}/goal_hint_test`,
    `mysql://jobs_migration:${migrationPassword}@127.0.0.1:${instance.port}/goal_hint_test`);
  const databases = [], children = [];
  const replica = () => { const database = createDatabase(parseRuntimePolicy(env)); databases.push(database); return database; };
  const expireLease = async (id) => instance.executeAdmin(`UPDATE goal_hint_test.DurableJob SET leaseExpiresAt = UTC_TIMESTAMP(3) - INTERVAL 1 MICROSECOND WHERE id = '${id}'`);
  const due = async (id) => instance.executeAdmin(`UPDATE goal_hint_test.DurableJob SET availableAt = UTC_TIMESTAMP(3) WHERE id = '${id}'`);
  try {
    await instance.executeAdmin(`CREATE USER 'jobs_migration'@'127.0.0.1' IDENTIFIED BY '${migrationPassword}';
      CREATE USER 'jobs_application'@'127.0.0.1' IDENTIFIED BY '${applicationPassword}';
      GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES ON goal_hint_test.* TO 'jobs_migration'@'127.0.0.1';`);
    await execute(process.execPath, ['--conditions=react-server', script, 'deploy'], { cwd: workspace, env, windowsHide: true, timeout: 60000 });
    await instance.executeAdmin(`GRANT SELECT, INSERT ON goal_hint_test.DurableJob TO 'jobs_application'@'127.0.0.1';
      GRANT SELECT, UPDATE ON goal_hint_test.DurableJobEnqueueLock TO 'jobs_application'@'127.0.0.1';
      GRANT UPDATE (state, version, availableAt, updatedAt, attemptCount, fence, ownerId, leaseExpiresAt, attemptDeadlineAt, finishedAt, terminalReason)
        ON goal_hint_test.DurableJob TO 'jobs_application'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.DurableJobAttempt TO 'jobs_application'@'127.0.0.1';
      GRANT UPDATE (outcome, reason, finishedAt) ON goal_hint_test.DurableJobAttempt TO 'jobs_application'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.DurableJobEvent TO 'jobs_application'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.DurableJobUsage TO 'jobs_application'@'127.0.0.1';`);
    const a = replica(), b = replica(), first = createMysqlJobQueue(a), second = createMysqlJobQueue(b);
    await t.test('all migrations deploy without drift on InnoDB and application DDL is denied', async () => {
      await execute(process.execPath, ['--conditions=react-server', script, 'verify'], { cwd: workspace, env, windowsHide: true, timeout: 60000 });
      const rows = await a.query((tx) => tx.$queryRaw`SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('DurableJobEnqueueLock','DurableJob','DurableJobAttempt','DurableJobEvent','DurableJobUsage')`);
      assert.equal(rows.length, 5); assert.ok(rows.every((row) => row.ENGINE === 'InnoDB'));
      await assert.rejects(a.query((tx) => tx.$executeRaw`CREATE TABLE forbidden_jobs_ddl (id INT)`));
    });
    await instance.executeAdmin(`CREATE TABLE goal_hint_test.JobTestEffect (jobId CHAR(64) PRIMARY KEY, value INT NOT NULL) ENGINE=InnoDB;
      GRANT SELECT, INSERT ON goal_hint_test.JobTestEffect TO 'jobs_application'@'127.0.0.1';`);
    await t.test('six independent duplicate enqueues share one durable job and event; changed input conflicts', async () => {
      const envelope = jobEnvelope({ type: 'test.duplicates' });
      const results = await Promise.all(Array.from({ length: 6 }, () => createMysqlJobQueue(replica()).enqueue(envelope)));
      assert.equal(new Set(results.map((job) => job.id)).size, 1); assert.equal((await first.history(results[0].id)).length, 1);
      await assert.rejects(first.enqueue({ ...envelope, payload: { value: 2 } }), denied('conflicting-request'));
    });
    await t.test('two competing workers acquire one attempt and only its valid owner can finish', async () => {
      const job = await first.enqueue(jobEnvelope({ type: 'test.competing' }));
      const leases = await Promise.all([first.claim(owner, types('test.competing')), second.claim(other, types('test.competing'))]);
      assert.equal(leases.filter(Boolean).length, 1); const lease = leases.find(Boolean);
      assert.equal(lease.jobId, job.id); assert.equal(lease.fence, 1);
      await assert.rejects(second.acknowledge({ ...lease, ownerId: lease.ownerId === owner ? other : owner }), denied('lost-lease'));
      await assert.rejects(first.renew({ ...lease, attemptId: jobTestHash('fake-attempt') }), denied('lost-lease'));
      assert.equal((await first.acknowledge(lease)).state, 'succeeded');
      await assert.rejects(first.acknowledge(lease), denied('lost-lease')); assert.equal(await second.claim(other, types('test.competing')), null);
    });
    await t.test('renewal extends the lease but never the hard attempt deadline', async () => {
      await first.enqueue(jobEnvelope({ type: 'test.renew' })); const lease = await first.claim(owner, types('test.renew'));
      await sleep(80); const renewed = await first.renew(lease);
      assert.ok(renewed.leaseExpiresAt > lease.leaseExpiresAt); assert.equal(renewed.deadlineAt, lease.deadlineAt);
      assert.ok(renewed.leaseExpiresAt <= renewed.deadlineAt); await first.acknowledge(renewed);
    });
    await t.test('expired ownership is fenced before recovery and retries retain the business job identity', async () => {
      const envelope = jobEnvelope({ type: 'test.expiry' }); await first.enqueue(envelope);
      const old = await first.claim(owner, types(envelope.type)); await expireLease(old.jobId);
      for (const operation of [() => first.renew(old), () => first.acknowledge(old), () => first.retry(old, 'handler-failed', true)]) await assert.rejects(operation(), denied('lost-lease'));
      assert.equal(await second.claim(other, types(envelope.type)), null); await due(old.jobId);
      const next = await second.claim(other, types(envelope.type)); assert.equal(next.jobId, old.jobId);
      assert.notEqual(next.attemptId, old.attemptId); assert.equal(next.fence, 2);
      await assert.rejects(first.acknowledge(old), denied('lost-lease')); await second.acknowledge(next);
      assert.equal((await first.attempts(old.jobId))[0].reason, 'lease-expired');
    });
    await t.test('enqueue and caller effects commit together, including a caught writer error', async () => {
      const envelope = jobEnvelope({ type: 'test.atomic' }), id = durableJobId(envelope);
      await assert.rejects(first.withTransaction(async (enqueue, tx) => {
        await tx.$executeRaw`INSERT INTO JobTestEffect (jobId, value) VALUES (${id}, 1)`;
        await enqueue(envelope); try { await enqueue({ ...envelope, payload: { value: 2 } }); } catch { /* cannot permit partial commit */ }
      }), denied('conflicting-request'));
      assert.equal(await first.inspect(id), null);
      assert.equal((await a.query((tx) => tx.$queryRaw`SELECT * FROM JobTestEffect WHERE jobId = ${id}`)).length, 0);
      let escaped; await first.withTransaction(async (enqueue) => { escaped = enqueue; await enqueue(envelope); });
      await assert.rejects(escaped(envelope), denied('invalid-request'));
      assert.equal((await second.inspect(id)).state, 'pending');
    });
    await t.test('fenced acknowledgement and business effects roll back together and reject stale owners', async () => {
      const job = await first.enqueue(jobEnvelope({ type: 'test.finalize' })), lease = await first.claim(owner, types('test.finalize'));
      await assert.rejects(a.transaction(async (tx) => {
        await first.assertOwned(tx, lease); await tx.$executeRaw`INSERT INTO JobTestEffect (jobId, value) VALUES (${job.id}, 1)`;
        await first.completeInTransaction(tx, lease); throw new Error('synthetic rollback');
      }));
      assert.equal((await first.inspect(job.id)).state, 'running');
      assert.equal((await a.query((tx) => tx.$queryRaw`SELECT * FROM JobTestEffect WHERE jobId = ${job.id}`)).length, 0);
      await expireLease(job.id);
      await assert.rejects(a.transaction(async (tx) => { await first.assertOwned(tx, lease); await tx.$executeRaw`INSERT INTO JobTestEffect (jobId, value) VALUES (${job.id}, 1)`; }));
      assert.equal((await a.query((tx) => tx.$queryRaw`SELECT * FROM JobTestEffect WHERE jobId = ${job.id}`)).length, 0);
    });
    await t.test('bounded retries, non-retryable outcomes and expiry become structured terminal records', async () => {
      const job = await first.enqueue(jobEnvelope({ type: 'test.cap', maxAttempts: 2 }));
      let lease = await first.claim(owner, types('test.cap')), retry = await first.retry(lease, 'rate-limited', true);
      assert.equal(retry.state, 'pending'); assert.ok(retry.availableAt > retry.updatedAt); await due(job.id);
      lease = await first.claim(owner, types('test.cap')); assert.equal((await first.retry(lease, 'handler-failed', true)).terminalReason, 'attempts-exhausted');
      const deniedJob = await first.enqueue(jobEnvelope({ type: 'test.nonretry' }));
      lease = await first.claim(owner, types('test.nonretry')); assert.equal((await first.retry(lease, 'invalid-output', false)).terminalReason, 'invalid-output');
      assert.equal((await first.attempts(deniedJob.id)).length, 1);
      const expired = await first.enqueue(jobEnvelope({ type: 'test.expired', notBefore: Date.now() - 1000, expiresAt: Date.now() - 1 }));
      assert.equal(await first.claim(owner, types('test.expired')), null); assert.equal((await first.inspect(expired.id)).terminalReason, 'eligibility-expired');
    });
    await t.test('actual usage references append idempotently and history inspection does not mutate work', async () => {
      const job = await first.enqueue(jobEnvelope({ type: 'test.usage' })), lease = await first.claim(owner, types('test.usage'));
      const usage = { provider: 'ai', requestReference: jobTestHash('actual-request'), costReference: jobTestHash('cost-ledger-attempt'), phase: 'completed', requests: 1, durationMs: 25 };
      await first.recordUsage(lease, usage); await first.recordUsage(lease, usage);
      await assert.rejects(first.recordUsage(lease, { ...usage, requests: 2 }), denied('conflicting-request'));
      const rows = await first.usage(job.id); assert.equal(rows.length, 1); assert.equal(rows[0].costReference, usage.costReference);
      const before = await first.inspect(job.id), events = await first.history(job.id);
      assert.deepEqual(await first.history(job.id, events[0].version, 1), [events[1]]);
      assert.deepEqual(await first.inspect(job.id), before); await first.acknowledge(lease);
    });
    await t.test('worker heartbeat, fallback budget, eligibility stop and redacted handler failures', async () => {
      let remaining, primary; const logs = [], type = 'test.runner';
      await first.enqueue(jobEnvelope({ type }));
      const registry = jobTestRegistry(async (_payload, context) => {
        remaining = context.remainingMs(); primary = context.remainingMs(true);
        await sleep(1250); await context.checkpoint(); return { status: 'succeeded' };
      }, { type });
      const worker = createJobWorker({ queue: first, registry, ownerId: owner, onEvent: (event) => logs.push(event) });
      assert.equal(await worker.runOnce(), true); assert.ok(remaining - primary >= 1999);
      assert.deepEqual(logs.map((item) => item.kind), ['claimed','succeeded']);
      let handled = 0; await first.enqueue(jobEnvelope({ type: 'test.ineligible' }));
      await createJobWorker({ queue: first, ownerId: owner, registry: jobTestRegistry(async () => { handled++; return { status: 'succeeded' }; },
        { type: 'test.ineligible', eligible: () => false }) }).runOnce(); assert.equal(handled, 0);
      const privateValue = 'private-provider-key-raw-body', failed = await first.enqueue(jobEnvelope({ type: 'test.redacted' }));
      await createJobWorker({ queue: first, ownerId: owner, registry: jobTestRegistry(async () => { throw new Error(privateValue); }, { type: 'test.redacted' }),
        onEvent: (event) => logs.push(event) }).runOnce();
      assert.ok(!JSON.stringify(logs).includes(privateValue)); assert.ok(!JSON.stringify(await first.history(failed.id)).includes(privateValue));
      assert.equal((await first.attempts(failed.id))[0].reason, 'handler-failed');
      const invalid = await first.enqueue(jobEnvelope({ type: 'test.malformed', payload: { value: 0 } }));
      await createJobWorker({ queue: first, ownerId: owner, registry: jobTestRegistry(undefined, { type: 'test.malformed' }) }).runOnce();
      assert.equal((await first.inspect(invalid.id)).terminalReason, 'invalid-payload');
    });
    await t.test('timeouts are bounded and graceful shutdown leaves durable retryable work', async () => {
      const job = await first.enqueue(jobEnvelope({ type: 'test.timeout', timeoutMs: 200, fallbackReserveMs: 50 }));
      const worker = createJobWorker({ queue: first, ownerId: owner, registry: jobTestRegistry(async () => new Promise(() => {}), { type: 'test.timeout' }) });
      const started = Date.now(); await worker.runOnce(); assert.ok(Date.now() - started < 2000);
      await second.claim(other, types('test.timeout')); assert.equal((await first.attempts(job.id))[0].reason, 'timeout');
      const controller = new AbortController(), stopping = await first.enqueue(jobEnvelope({ type: 'test.shutdown' }));
      const run = createJobWorker({ queue: first, ownerId: owner, registry: jobTestRegistry(async (_payload, context) => {
        controller.abort(); await sleep(5); assert.equal(context.signal.aborted, true); return { status: 'succeeded' };
      }, { type: 'test.shutdown' }) }).runOnce(controller.signal);
      await run; assert.equal((await first.inspect(stopping.id)).state, 'pending');
      assert.equal((await first.attempts(stopping.id))[0].reason, 'worker-stopping');
    });
    await t.test('connection restart resumes a committed enqueue without any external send', async () => {
      const database = replica(), queue = createMysqlJobQueue(database), job = await queue.enqueue(jobEnvelope({ type: 'test.restart' }));
      await database.disconnect(); const restarted = createMysqlJobQueue(replica());
      assert.equal((await restarted.inspect(job.id)).state, 'pending'); const lease = await restarted.claim(other, types('test.restart'));
      assert.equal(lease.jobId, job.id); await restarted.acknowledge(lease);
    });
    await t.test('process death after a committed effect resumes in another process without a second effect', async () => {
      const type = 'test.death', job = await first.enqueue(jobEnvelope({ type }));
      const start = (mode) => {
        const child = fork(childScript, [mode, type], { cwd: workspace, env, execArgv: ['--conditions=react-server'], windowsHide: true, stdio: ['ignore','pipe','pipe','ipc'] });
        children.push(child); child.stdout.resume(); child.stderr.resume(); return child;
      };
      const dead = start('die'); await waitMessage(dead, 'effect');
      const original = (await first.attempts(job.id))[0], exited = once(dead, 'exit'); dead.kill('SIGKILL'); await exited;
      await expireLease(job.id); await second.claim(other, types(type)); await due(job.id);
      const recovered = start('recover'); await waitMessage(recovered, 'succeeded');
      const stopped = once(recovered, 'exit'); recovered.send('stop'); await stopped;
      const attempts = await first.attempts(job.id); assert.equal(attempts.length, 2);
      assert.equal(attempts[0].id, original.id); assert.notEqual(attempts[1].id, original.id);
      assert.equal((await first.inspect(job.id)).state, 'succeeded');
      const effects = await a.query((tx) => tx.$queryRaw`SELECT * FROM JobTestEffect WHERE jobId = ${job.id}`);
      assert.equal(effects.length, 1); assert.equal(effects[0].value, 1);
    });
    await t.test('refresh uniqueness and composite fixture-cycle bindings survive changed job/model keys', async () => {
      await instance.executeAdmin(catalogTables.map((name) => `GRANT SELECT, INSERT, UPDATE, DELETE ON goal_hint_test.${name} TO 'jobs_application'@'127.0.0.1';`).join('\n') +
        `GRANT SELECT, INSERT, UPDATE ON goal_hint_test.PredictionCycle TO 'jobs_application'@'127.0.0.1';
         GRANT SELECT, INSERT ON goal_hint_test.DailyRun TO 'jobs_application'@'127.0.0.1';
         GRANT SELECT, INSERT ON goal_hint_test.PredictionSchedule TO 'jobs_application'@'127.0.0.1';
         GRANT SELECT, INSERT ON goal_hint_test.PredictionAudit TO 'jobs_application'@'127.0.0.1';`);
      const catalog = createFootballCatalogStore(a), fake = createSyntheticCatalogAdapter({ rows: [catalogFixture(501)] });
      const authority = { authorize() {}, authorizeMapping() {}, verifyRetention: () => true, verifyObservation: () => true,
        verifyLogo: () => true, verifyRegulationScore: () => true, verifyMapping: () => false, regulationEvidenceRef: () => 'synthetic-proof', verifyKnownSubset: () => true };
      await createFootballCatalogImporter({ adapter: fake.adapter, store: catalog, authority, clock: { now: () => CATALOG_NOW } })
        .import(catalogRequest({ kind: 'fixtures', query: { fixtureId: 501 } }));
      const fixture = await catalog.fixtureByProviderId(501), history = createMysqlPredictionHistoryStore(a, { catalog, clock: { now: () => CATALOG_NOW + 1000 } });
      const cycle = await history.createCycle(cycleCreation(fixture)), run = await history.createRun('2026-10-09', CATALOG_NOW);
      const refresh = { fixtureId: fixture.id, cycleId: cycle.id, runId: run.id }, envelope = jobEnvelope({ type: 'test.refresh', refresh });
      await first.enqueue(envelope);
      await assert.rejects(first.enqueue({ ...envelope, idempotencyKey: jobTestHash('changed-model-key') }), denied('conflicting-request'));
      await assert.rejects(first.enqueue({ ...jobEnvelope({ type: 'test.badbinding' }), refresh: { ...refresh, fixtureId: randomUUID() } }));
    });
    await t.test('immutable operational payloads, attempts and audit/usage records resist application edits', async () => {
      await assert.rejects(a.query((tx) => tx.$executeRaw`UPDATE DurableJob SET envelopeJson = JSON_OBJECT()`));
      await assert.rejects(a.query((tx) => tx.$executeRaw`UPDATE DurableJobAttempt SET ownerId = ${other}`));
      await assert.rejects(a.query((tx) => tx.$executeRaw`DELETE FROM DurableJob`));
      for (const table of ['DurableJobEvent','DurableJobUsage']) {
        await assert.rejects(a.query((tx) => tx.$executeRawUnsafe(`DELETE FROM ${table}`)));
        await assert.rejects(a.query((tx) => tx.$executeRawUnsafe(`UPDATE ${table} SET jobId = '${jobTestHash('wrong')}'`)));
      }
      const job = await first.enqueue(jobEnvelope({ type: 'test.native' }));
      await assert.rejects(instance.executeAdmin(`UPDATE goal_hint_test.DurableJob SET attemptCount = 17, fence = 17 WHERE id = '${job.id}'`));
    });
    await t.test('standalone runner rejects missing trusted bindings without silently starting an empty worker', async () => {
      await assert.rejects(runJobWorkerCommand([], { signal: AbortSignal.abort() }), denied('invalid-request'));
      const result = await execute(process.execPath, ['--conditions=react-server','src/workers/jobs.ts'], { cwd: workspace, env, windowsHide: true, timeout: 10000 }).catch((error) => error);
      assert.equal(result.code, 1); assert.match(result.stderr, /private configuration and handler diagnostics are withheld/);
      assert.ok(!result.stderr.includes(applicationPassword));
    });
    await t.test('standalone Node TypeScript entry starts with a trusted binding and gracefully drains on shutdown', async () => {
      const job = await first.enqueue(jobEnvelope({ type: 'test.command' }));
      const child = fork(fileURLToPath(new URL('../src/workers/jobs.ts', import.meta.url)), ['--binding','tests/helpers/job-command-binding.mjs'],
        { cwd: workspace, env, execArgv: ['--conditions=react-server'], windowsHide: true, stdio: ['ignore','pipe','pipe','ipc'] });
      children.push(child); let output = ''; child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.resume();
      await waitMessage(child, 'handled');
      for (let index = 0; index < 60 && (await first.inspect(job.id)).state !== 'succeeded'; index++) await sleep(50);
      assert.equal((await first.inspect(job.id)).state, 'succeeded'); assert.match(output, /Durable job worker ready/);
      const stopped = exitWithin(child); child.send('stop'); const [code] = await stopped; assert.equal(code, 0);
    });
  } finally {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
    await Promise.all(databases.map((database) => database.disconnect().catch(() => {}))); await instance.stop();
  }
});
