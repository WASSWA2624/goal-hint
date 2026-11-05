import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { withPredictionPipeline } from './prediction-pipeline.mjs';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { createMysqlShadowStore, decodeShadowArchive } from '../src/server/intelligence/shadow-store.ts';
import { createShadowIntelligenceService } from '../src/server/intelligence/shadow-service.ts';
import { estimateLocalGoals } from '../src/server/intelligence/local-goals-model.ts';
import { validateIntelligenceForecast } from '../src/server/intelligence/forecast-validator.ts';
import { checkMarketConsistency } from '../src/domain/markets.ts';
import { shadowObservation, shadowForecast } from './helpers/intelligence-shadow-fixtures.mjs';
import { intelligenceHistory, INTELLIGENCE_NOW } from './helpers/intelligence-fixtures.mjs';
import { ownedMysqlSource } from '../src/server/backup/mysql-backup.mjs';
import { captureMysqlSnapshot, withRestoredMysql } from '../src/server/backup/backup-engine.mjs';
import { backupPolicy, backupAuthority } from './helpers/backup-fixtures.mjs';

test('disposable MySQL shadow checks are idempotent, retain immutable history and survive encrypted backup/restore', { timeout: 600_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    await p.instance.executeAdmin(`
      GRANT SELECT, INSERT, UPDATE ON goal_hint_test.IntelligenceShadowState TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.IntelligenceShadowRevision TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.IntelligenceShadowCheck TO 'cutoff_app'@'127.0.0.1';
    `);
    const fixture = await p.setup(3005), fixtureId = fixture.fixture.id, now = p.now();
    const store = createMysqlShadowStore(p.a), replica = createMysqlShadowStore(p.b);
    const service = createShadowIntelligenceService({ store, mode: 'shadow' });
    let evaluations = 0;
    const request = (index, delta = {}) => {
      const at = now + index * 60_000;
      return { checkId: evidenceFingerprint({ fixtureId, index }), fixtureId, checkedAt: at, modelVersion: 'synthetic-shadow-v1', dependencyHash: evidenceFingerprint('synthetic-history'),
        observation: shadowObservation({ fixtureId, receivedAt: at, observedAt: at, kickoffAt: fixture.cycle.kickoffAt, ...delta }),
        async evaluate() { evaluations++; return shadowForecast(fixtureId, at); } };
    };
    const beforePublic = await p.a.query((tx) => tx.predictionSet.count());
    const first = await service.observe(request(0)), original = await store.read(fixtureId);
    assert.ok(first.receipt.revisionId); assert.equal(original.checks, 1n);
    for (let i = 1; i <= 3; i++) await service.observe(request(i));
    assert.equal((await store.read(fixtureId)).latest.sequence, 1); assert.equal(evaluations, 1);
    const restarted = createShadowIntelligenceService({ store: replica, mode: 'shadow' });
    assert.deepEqual(await restarted.observe(request(0)), first);
    assert.equal((await store.read(fixtureId)).checks, 4n);
    await service.observe(request(4, { probabilities: { home: 0.66 } }));
    const second = await store.read(fixtureId); assert.equal(second.latest.sequence, 2);
    const old = await p.a.query((tx) => tx.$queryRaw`SELECT bodyJson, integrity FROM IntelligenceShadowRevision WHERE id = ${first.receipt.revisionId}`);
    const oldBody = decodeShadowArchive(old[0].bodyJson);
    assert.deepEqual(oldBody, original.latest.body);
    await service.observe(request(5, { status: 'postponed' }));
    await service.observe(request(6, { status: 'postponed' }));
    assert.equal((await store.read(fixtureId)).latest.sequence, 3); assert.equal(evaluations, 3);
    assert.equal((await store.read(fixtureId)).availability, 'suspended');
    assert.equal(await p.a.query((tx) => tx.predictionSet.count()), beforePublic);
    await assert.rejects(p.instance.executeAdmin(`UPDATE IntelligenceShadowRevision SET modelVersion='tampered' WHERE fixtureId='${fixtureId}'`));
    await assert.rejects(p.instance.executeAdmin(`DELETE FROM IntelligenceShadowRevision WHERE fixtureId='${fixtureId}'`));
    // Two independent connections racing the same durable check yield one receipt/count.
    const duplicate = request(7, { status: 'postponed' });
    const concurrent = await Promise.all([service.observe(duplicate), restarted.observe(duplicate)]);
    assert.deepEqual(concurrent[0], concurrent[1]); assert.equal((await store.read(fixtureId)).checks, 8n);
    const eligible = async () => shadowForecast(fixtureId, now, { decision: 'eligible-shadow' });
    await service.observe({ ...request(8), evaluate: eligible });
    const eligibleId = (await store.read(fixtureId)).latestEligibleRevisionId; assert.ok(eligibleId);
    await service.observe({ ...request(9), observation: null });
    assert.equal((await store.read(fixtureId)).latestEligibleRevisionId, null);
    await service.observe({ ...request(10), evaluate: eligible });
    assert.equal((await store.read(fixtureId)).latestEligibleRevisionId, eligibleId);
    assert.equal((await store.read(fixtureId)).latest.sequence, 4);
    assert.equal((await store.read(fixtureId)).checks, 11n);
    // A worker's actual execution deadline is rechecked under the database lock.
    await assert.rejects(service.observe({ ...request(11), executionDeadlineAt: now }));
    assert.equal((await store.read(fixtureId)).checks, 11n);

    // Exercise the actual model/validator JSON, including small score-grid floats.
    // The league history is synthetic; this proves persistence, never predictive accuracy.
    const canonical = await p.a.query((tx) => tx.footballFixture.findUniqueOrThrow({ where: { id: fixtureId }, include: { season: true } }));
    const forecastAt = now + 12 * 60_000, shift = forecastAt - INTELLIGENCE_NOW;
    const modelFixture = { fixtureId, competitionId: canonical.season.competitionId,
      homeTeamId: canonical.homeTeamId, awayTeamId: canonical.awayTeamId,
      kickoffAt: canonical.kickoff.getTime(), forecastAt };
    const teamId = (id) => id === 'team-0' ? modelFixture.homeTeamId : id === 'team-1' ? modelFixture.awayTeamId : id;
    const history = intelligenceHistory().map((row) => {
      const mapped = { ...row, competitionId: modelFixture.competitionId, homeTeamId: teamId(row.homeTeamId), awayTeamId: teamId(row.awayTeamId),
        kickoffAt: row.kickoffAt + shift, availableAt: row.availableAt + shift, evidenceRef: `synthetic-shadow-roundtrip:${row.fixtureId}` };
      return { ...mapped, observationHash: evidenceFingerprint(mapped) };
    });
    const local = estimateLocalGoals({ fixture: modelFixture, history });
    assert.equal(local.status, 'estimated'); assert.equal(local.diagnostics.converged, true);
    assert.equal(local.scoreDistribution.states.length, 441);
    assert.deepEqual(checkMarketConsistency(local.probabilities['match-result'], local.probabilities['total-goals'], local.probabilities['both-teams-to-score']), []);
    assert.ok(Math.abs(local.scoreDistribution.states.reduce((sum, state) => sum + state.probability, 0) + local.scoreDistribution.unrepresentedProbability - 1) < 1e-9);
    const forecast = validateIntelligenceForecast({ fixture: modelFixture, local, fixtureStatus: 'scheduled' });
    assert.equal(forecast.decision, 'eligible-shadow'); assert.equal(forecast.publish, false);
    const actual = await service.observe({ ...request(12, { probabilities: { home: local.probabilities['match-result']['home-win'] } }),
      modelVersion: local.modelVersion, dependencyHash: evidenceFingerprint({ fixture: modelFixture, history, configuration: local.configuration }),
      async evaluate() { return forecast; } });
    const actualStored = await store.read(fixtureId);
    assert.equal(actualStored.latest.sequence, 5); assert.equal(actualStored.checks, 12n);
    assert.deepEqual(actualStored.latest.body.forecast, forecast);
    const { hash: storedForecastHash, ...storedForecastBody } = actualStored.latest.body.forecast;
    const { hash: storedLocalHash, ...storedLocalBody } = actualStored.latest.body.forecast.components.local;
    assert.equal(evidenceFingerprint(storedForecastBody), storedForecastHash);
    assert.equal(evidenceFingerprint(storedLocalBody), storedLocalHash);
    assert.equal(actualStored.latest.modelVersion, local.modelVersion);
    assert.deepEqual(actualStored.latest.body.forecast.components.local.historyIds, history.map((row) => row.observationHash));
    assert.equal(await p.a.query((tx) => tx.predictionSet.count()), beforePublic);
    const source = await ownedMysqlSource(p.instance), tempRoot = path.resolve('.tmp');
    await mkdir(tempRoot, { recursive: true });
    const directory = await mkdtemp(path.join(tempRoot, 'intelligence-backup-'));
    try {
      const options = { source, directory: path.join(directory, 'artifacts'), key: randomBytes(32), policy: backupPolicy(), authority: backupAuthority() };
      const snapshot = await captureMysqlSnapshot(options);
      const inventory = snapshot.metadata.inventory.tables;
      assert.equal(Number(inventory.find((row) => row.table.toLowerCase() === 'intelligenceshadowrevision').count), 5);
      const migrationSecret = randomBytes(24).toString('hex');
      const restored = await withRestoredMysql({ ...options,
        async prepareTarget(instance) {
          await instance.executeAdmin(`CREATE USER 'cutoff_migration'@'127.0.0.1' IDENTIFIED BY '${migrationSecret}' ACCOUNT LOCK;
            GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES, TRIGGER ON goal_hint_test.* TO 'cutoff_migration'@'127.0.0.1';`);
        },
      }, async ({ target, quarantined }) => {
        assert.equal(quarantined, true);
        assert.equal((await target.query('SELECT COUNT(*) FROM IntelligenceShadowRevision'))[0], '5');
        assert.equal((await target.query('SELECT COUNT(*) FROM IntelligenceShadowCheck'))[0], '12');
        assert.equal((await target.query(`SELECT latestRevisionId FROM IntelligenceShadowState WHERE fixtureId='${fixtureId}'`))[0], (await store.read(fixtureId)).latest.id);
        assert.equal((await target.query(`SELECT integrity FROM IntelligenceShadowRevision WHERE id='${first.receipt.revisionId}'`))[0], old[0].integrity);
        const restoredBody = decodeShadowArchive((await target.query(`SELECT bodyJson FROM IntelligenceShadowRevision WHERE id='${actual.receipt.revisionId}'`))[0]);
        assert.deepEqual(restoredBody.forecast, forecast);
        assert.deepEqual(restoredBody.forecast.components.local.probabilities, local.probabilities);
        assert.deepEqual(restoredBody.forecast.components.local.scoreDistribution, local.scoreDistribution);
        assert.deepEqual(restoredBody.forecast.components.local.fixture, modelFixture);
        assert.deepEqual(restoredBody.forecast.components.local.historyIds, local.historyIds);
        assert.equal(restoredBody.forecast.components.local.historyHash, local.historyHash);
        assert.equal(restoredBody.forecast.components.local.modelVersion, local.modelVersion);
        assert.equal(evidenceFingerprint(restoredBody), evidenceFingerprint(actualStored.latest.body));
        const { hash: restoredForecastHash, ...restoredForecastBody } = restoredBody.forecast;
        assert.equal(evidenceFingerprint(restoredForecastBody), restoredForecastHash);
        await assert.rejects(target.query(`UPDATE IntelligenceShadowRevision SET modelVersion='tampered' WHERE fixtureId='${fixtureId}'`));
        return { shadowHistoryVerified: true, publicPublication: false };
      });
      assert.deepEqual(restored.result, { shadowHistoryVerified: true, publicPublication: false });
    } finally {
      const actual = await realpath(directory), parent = await realpath(tempRoot), relative = path.relative(parent, actual);
      assert.ok(relative.startsWith('intelligence-backup-') && !relative.includes(path.sep) && !path.isAbsolute(relative));
      await rm(actual, { recursive: true });
    }
  }, { binaryLog: true, migrationTimeoutMs: 240_000 });
});
