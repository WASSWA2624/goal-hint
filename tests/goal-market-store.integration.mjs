import assert from 'node:assert/strict';
import { execFile } from './helpers/command-runtime.mjs';
import { promisify } from 'node:util';
import test from 'node:test';
import { goalAsianHandicapMarket, goalResultMarket, goalHalfFullMarket } from '../src/domain/goal-market-definitions.ts';
import { SCORE_DISTRIBUTION_VERSION } from '../src/domain/score-distribution.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { resolveFallbackCandidate } from '../src/server/fallback/fallback-resolution.ts';
import { applyPredictorCalibration } from '../src/server/predictor/predictor-calibration.ts';
import { createModelPin } from '../src/server/predictor/predictor-input.ts';
import { createMysqlModelVersionStore } from '../src/server/predictor/predictor-mysql-store.ts';
import { validatePredictorOutput } from '../src/server/predictor/predictor-output.ts';
import { SCORE_PROMPT_VERSION, SCORE_SCHEMA_VERSION } from '../src/server/predictor/predictor-prompt.ts';
import { appendGoalMarketExtension, readGoalMarketExtension, planGoalMarketSettlements, persistGoalMarketSettlements } from '../src/server/predictions/goal-market-store.ts';
import { PredictionHistoryError } from '../src/server/predictions/history-contract.ts';
import { createRevisionPublicationService } from '../src/server/predictions/publication-service.ts';
import { RevisionPublicationError } from '../src/server/predictions/publication-contract.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { createMarketSettlementService } from '../src/server/settlement/settlement-service.ts';
import { createExtendedMarketPerformanceService } from '../src/server/performance/extended-market-performance.ts';
import { fallbackAuthority } from './helpers/fallback-fixtures.mjs';
import { modelAuthority, modelVersion } from './helpers/predictor-fixtures.mjs';
import { predictorOutputOptions, predictorRawOutput } from './helpers/predictor-output-fixtures.mjs';
import { publicationAuthority, publicationPolicy, PUBLICATION_NOW } from './helpers/publication-fixtures.mjs';
import { lifecycleAuthority, lifecycleInput, lifecyclePolicy } from './helpers/lifecycle-fixtures.mjs';
import { resultHash } from './helpers/result-sync-fixtures.mjs';
import { catalogFixture } from './helpers/catalog-fixtures.mjs';
import { normalizeFixture } from '../src/server/football/api-football-normalize.ts';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

const execute = promisify(execFile);
const distribution = () => ({ version: SCORE_DISTRIBUTION_VERSION, unrepresentedProbability: 0, states: [
  { home: 0, away: 0, halfHome: 0, halfAway: 0, probability: .1 },
  { home: 1, away: 0, halfHome: 0, halfAway: 0, probability: .2 },
  { home: 2, away: 1, halfHome: 1, halfAway: 0, probability: .3 },
  { home: 0, away: 2, halfHome: 0, halfAway: 1, probability: .4 },
] });

test('additive score extensions publish and settle atomically on genuine owned MySQL', { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    await p.instance.executeAdmin(`
      GRANT SELECT, INSERT ON goal_hint_test.GoalMarketExtension TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.ImpliedMarketExtension TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.ImpliedMarketResultEvidence TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.ExtendedMarketSettlementRevision TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT, UPDATE (revisionId) ON goal_hint_test.ExtendedMarketSettlement TO 'cutoff_app'@'127.0.0.1';`);
    const model = modelVersion({ promptVersion: SCORE_PROMPT_VERSION, schemaVersion: SCORE_SCHEMA_VERSION });
    await createMysqlModelVersionStore(p.a).save(model, modelAuthority());
    const definitions = [goalResultMarket(), goalResultMarket('half-time'), goalAsianHandicapMarket(-.25), goalAsianHandicapMarket(.25), goalAsianHandicapMarket(0),
      goalResultMarket('second-half'), goalHalfFullMarket()];
    let state, input, revision, originalCandidateHash;
    const trusted = new Set();
    const authority = publicationAuthority({ verifyGoalExtension: (value) => trusted.has(evidenceFingerprint(value.goalExtension)) });
    const publisher = createRevisionPublicationService({ database: p.a, queue: p.queue, policy: publicationPolicy(), authority });
    const settlement = createMarketSettlementService({ database: p.a, queue: p.queue, extendedMarketsEnabled: true });
    const legacySettlement = createMarketSettlementService({ database: p.a, queue: p.queue });
    const performance = createExtendedMarketPerformanceService({ database: p.a, enabled: true });
    const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
    const accountId = resultHash('synthetic-goal-extension-result-account');
    await p.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
    const results = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
    let sequence = 0;
    async function v2(id) {
      p.setTime(PUBLICATION_NOW); const target = await p.setup(id);
      const { groups: _groups, ...base } = predictorRawOutput(target.snapshot, model); void _groups;
      const pmf = distribution(), checked = validatePredictorOutput({ ...base, scoreDistribution: pmf }, predictorOutputOptions(target.snapshot, model));
      assert.equal(checked.valid, true, checked.reason);
      const calibrated = applyPredictorCalibration(checked.output, { model, authority: modelAuthority() });
      assert.equal(calibrated.valid, true);
      const pin = createModelPin({ version: 1, modelVersionId: model.id, jobId: target.lease.jobId, invocationId: resultHash(`score-extension:${id}`) });
      const expected = { context: target.snapshot.context, evidenceHash: target.snapshot.hash, jobId: target.lease.jobId, pin };
      const ai = { status: 'candidate', pin, output: calibrated.output, requestsDispatched: 1, requestCountUnknown: false };
      const resolved = resolveFallbackCandidate({ expected, ai, provider: null, now: target.snapshot.context.analysisAt + 2000 }, fallbackAuthority());
      assert.equal(resolved.status, 'candidate');
      const goalExtension = { scoreDistribution: pmf, definitions }; trusted.add(evidenceFingerprint(goalExtension));
      target.input = { ...target.input, candidate: resolved.candidate, goalExtension };
      return target;
    }
    async function observe(home, away, half = null) {
      p.setTime(Math.max(p.now() + 1000, state.cycle.kickoffAt + 7_200_000));
      const source = lifecycleInput(state, p.now(), { status: 'FT', raw: {
        goals: { home, away }, score: { fulltime: { home, away }, halftime: { home: 0, away: 0 } },
      } });
      if (half) {
        const row = catalogFixture(state.fixture.externalId, { kickoff: new Date(state.cycle.kickoffAt).toISOString(), status: 'FT',
          homeId: state.fixture.homeExternalIds[0], awayId: state.fixture.awayExternalIds[0], goals: { home, away },
          score: { fulltime: { home, away }, halftime: half } });
        const normalized = normalizeFixture(row, { retrievedAt: p.now(), endpoint: '/fixtures', verifyRegulationScore: () => true,
          verifyHalfTimeScore: () => true });
        assert.equal(normalized.valid, true); assert.equal(normalized.data.halfTimeScore.verified, true);
        source.fixture = normalized.data;
      }
      const observed = parseLifecycleInput(source);
      const id = resultHash(`goal-extension-result:${++sequence}`), lease = await results.acquire(resultHash(`goal-extension-owner:${sequence}`), 30_000);
      assert.ok(lease);
      const batch = { id, accountId, policyHash: resultHash('synthetic-goal-result-policy'), receivedAt: p.now(), channel: 'ids', date: null,
        requestedIds: [Number(state.fixture.externalId)], observations: [observed], error: null, requestsDispatched: 1 };
      try { await results.save(lease, batch); await results.apply(lease, batch); } finally { await results.release(lease); }
    }
    async function counts() {
      return p.a.query(async (tx) => ({ active: await tx.extendedMarketSettlement.count({ where: { fixtureId: state.fixture.id } }),
        revisions: await tx.extendedMarketSettlementRevision.count({ where: { fixtureId: state.fixture.id } }),
        batches: await tx.settlementBatch.count({ where: { fixtureId: state.fixture.id } }),
        version: (await tx.footballFixture.findUniqueOrThrow({ where: { id: state.fixture.id } })).dataVersion }));
    }
    await t.test('migration keeps legacy schema constraints and exposes additive immutable siblings without drift', async () => {
      await execute(process.execPath, ['--conditions=react-server', 'scripts/database.py', 'verify'], { env: p.env, windowsHide: true, timeout: 60_000 });
      const tables = await p.a.query((tx) => tx.$queryRaw`SELECT ENGINE, TABLE_COLLATION FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('GoalMarketExtension','ImpliedMarketExtension','ExtendedMarketSettlement','ExtendedMarketSettlementRevision')`);
      assert.equal(tables.length, 4); assert.ok(tables.every((row) => row.ENGINE === 'InnoDB' && row.TABLE_COLLATION === 'utf8mb4_bin'));
    });
    await t.test('unapproved same-marginal but changed joint output is rejected before any accepted revision', async () => {
      state = await v2(3005); input = state.input; originalCandidateHash = evidenceFingerprint(input.candidate);
      const forged = structuredClone(input); forged.goalExtension.scoreDistribution.states[2].halfHome = 0;
      await assert.rejects(publisher.publish(forged, state.lease), (error) => error instanceof RevisionPublicationError && error.reason === 'unauthorized');
      assert.equal(await p.a.query((tx) => tx.predictionSet.count({ where: { fixtureId: state.fixture.id } })), 0);
      assert.equal(await p.a.query((tx) => tx.goalMarketExtension.count({ where: { fixtureId: state.fixture.id } })), 0);
      assert.equal(await p.a.query((tx) => tx.extendedMarketPublishedPick.count({ where: { fixtureId: state.fixture.id } })), 0);
    });
    await t.test('publication and extension insertion roll back together on final authority failure', async () => {
      let checks = 0;
      const rejected = createRevisionPublicationService({ database: p.a, queue: p.queue, policy: publicationPolicy(),
        authority: publicationAuthority({ verifyGoalExtension: () => ++checks < 3 }) });
      await assert.rejects(rejected.publish(input, state.lease), (error) => error instanceof RevisionPublicationError && error.reason === 'unauthorized');
      assert.equal(await p.a.query((tx) => tx.predictionSet.count({ where: { fixtureId: state.fixture.id } })), 0);
      assert.equal(await p.a.query((tx) => tx.goalMarketExtension.count({ where: { fixtureId: state.fixture.id } })), 0);
    });
    await t.test('successful publication records one complete extension and original legacy bytes; retry is idempotent', async () => {
      const accepted = await publisher.publish(input, state.lease); assert.equal(accepted.refresh.outcome, 'published'); revision = accepted.revision;
      assert.equal(evidenceFingerprint(revision.candidate), originalCandidateHash);
      const saved = await p.a.query((tx) => readGoalMarketExtension(tx, revision.id));
      assert.equal(saved.revisionId, revision.id); assert.equal(saved.cycleId, state.cycle.id); assert.deepEqual(saved.scoreDistribution, distribution());
      assert.equal(saved.markets.length, definitions.length);
      const picks = await p.a.query((tx) => tx.extendedMarketPublishedPick.findMany({ where: { revisionId: revision.id } }));
      assert.equal(picks.length, definitions.length);
      assert.ok(picks.every((pick) => pick.cycleId === state.cycle.id && pick.fixtureId === state.fixture.id && pick.source === 'ai-score-distribution'));
      assert.ok(picks.every((pick) => !Object.hasOwn(pick.body, 'scoreDistribution') && !Object.hasOwn(pick.body, 'selections')));
      assert.equal((await publisher.publish(input, state.lease)).revision.id, revision.id);
      assert.equal(await p.a.query((tx) => tx.goalMarketExtension.count({ where: { fixtureId: state.fixture.id } })), 1);
      assert.equal(await p.a.query((tx) => tx.extendedMarketPublishedPick.count({ where: { revisionId: revision.id } })), definitions.length);
      await assert.rejects(p.history.withFixtureTransaction(state.fixture.id, (_writer, tx) => appendGoalMarketExtension(tx, { ...input.goalExtension, definitions: [goalResultMarket()],
        revisionId: revision.id, cycleId: state.cycle.id, fixtureId: state.fixture.id, recordedAt: p.now() })),
        (error) => error instanceof PredictionHistoryError && error.reason === 'conflicting-request');
    });
    await t.test('database rejects archive UPDATE/DELETE even with accidental broad grants', async () => {
      await p.instance.executeAdmin("GRANT UPDATE, DELETE ON goal_hint_test.GoalMarketExtension TO 'cutoff_app'@'127.0.0.1'; GRANT UPDATE, DELETE ON goal_hint_test.ExtendedMarketPublishedPick TO 'cutoff_app'@'127.0.0.1';");
      await assert.rejects(p.a.query((tx) => tx.$executeRaw`UPDATE GoalMarketExtension SET contentHash = ${'f'.repeat(64)} WHERE revisionId = ${revision.id}`));
      await assert.rejects(p.a.query((tx) => tx.$executeRaw`DELETE FROM GoalMarketExtension WHERE revisionId = ${revision.id}`));
      await assert.rejects(p.a.query((tx) => tx.$executeRaw`UPDATE ExtendedMarketPublishedPick SET sortOrder = sortOrder WHERE revisionId = ${revision.id}`));
      await assert.rejects(p.a.query((tx) => tx.$executeRaw`DELETE FROM ExtendedMarketPublishedPick WHERE revisionId = ${revision.id}`));
      await p.instance.executeAdmin("REVOKE UPDATE, DELETE ON goal_hint_test.GoalMarketExtension FROM 'cutoff_app'@'127.0.0.1'; REVOKE UPDATE, DELETE ON goal_hint_test.ExtendedMarketPublishedPick FROM 'cutoff_app'@'127.0.0.1';");
    });
    await t.test('new siblings cannot retrofit a legacy accepted publication or extend a closed cycle', async () => {
      const legacy = await p.setup(3006), receipt = await p.publisher.publish(legacy.input, legacy.lease);
      await assert.rejects(p.history.withFixtureTransaction(legacy.fixture.id, (_writer, tx) => appendGoalMarketExtension(tx, { ...input.goalExtension,
        revisionId: receipt.revision.id, cycleId: legacy.cycle.id, fixtureId: legacy.fixture.id, recordedAt: p.now() })),
        (error) => error instanceof PredictionHistoryError && error.reason === 'invalid-request');
      p.setTime(state.cycle.cutoffAt); await p.first.close(p.target(state));
      assert.equal((await p.history.findCycle(state.cycle.id)).lockedSetId, revision.id);
      p.setTime(legacy.cycle.cutoffAt); await p.first.close(p.target(legacy));
      await assert.rejects(p.history.withFixtureTransaction(legacy.fixture.id, (_writer, tx) => appendGoalMarketExtension(tx, { ...input.goalExtension,
        revisionId: receipt.revision.id, cycleId: legacy.cycle.id, fixtureId: legacy.fixture.id, recordedAt: p.now() })),
        (error) => error instanceof PredictionHistoryError && error.reason === 'invalid-request');
      const plans = await p.history.withFixtureTransaction(state.fixture.id, (_writer, tx) => planGoalMarketSettlements(tx, state.fixture.id));
      assert.ok(plans.every((plan) => plan.base.predictionRevisionId === revision.id && plan.base.status === 'pending'));
      assert.equal((await legacySettlement.settleFixture(state.fixture.id)).changed, 4);
      assert.equal((await counts()).active, 0, 'default legacy service never reads or writes extended tables');
    });
    await t.test('one atomic extended batch preserves quarter payouts, missing HT evidence and correction history', async () => {
      await observe(1, 0); assert.equal((await settlement.settleFixture(state.fixture.id)).changed, 11);
      const initial = await counts(), view = await settlement.extendedForFixture(state.fixture.id);
      assert.equal(view.markets.length, 7); assert.equal(initial.active, 7);
      const half = view.markets.find((entry) => entry.marketKey === goalResultMarket('half-time').key);
      assert.equal(half.settlement.status, 'pending'); assert.equal(half.settlement.reason, 'missing-verified-half-time-score');
      assert.equal((await settlement.settleFixture(state.fixture.id)).changed, 0); assert.deepEqual(await counts(), initial);
      await observe(0, 0);
      const stale = await performance.read({ from: state.cycle.kickoffAt - 1, to: state.cycle.kickoffAt + 1, source: 'ai-score-distribution' });
      assert.ok(stale.markets.every((entry) => entry.counts.correct === 0 && entry.binaryDenominator === 0),
        'the prior result cannot remain a reported winner before correction reconciliation');
      await settlement.settleFixture(state.fixture.id);
      const corrected = await settlement.extendedForFixture(state.fixture.id), byKey = new Map(corrected.markets.map((entry) => [entry.marketKey, entry]));
      assert.equal(byKey.get(goalAsianHandicapMarket(-.25).key).settlement.status, 'half-loss');
      assert.equal(byKey.get(goalAsianHandicapMarket(.25).key).settlement.status, 'half-win');
      assert.equal(byKey.get(goalAsianHandicapMarket(0).key).settlement.status, 'push');
      const audit = await settlement.extendedAudit(state.cycle.id, goalAsianHandicapMarket(-.25).key);
      assert.equal(audit.length, 2); assert.equal(audit[0].status, 'correct'); assert.equal(audit[1].kind, 'correction');
      assert.equal(audit[1].correctedAt, audit[1].at); assert.notEqual(audit[0].resultId, audit[1].resultId);
      assert.equal(audit[0].predictionRevisionId, audit[1].predictionRevisionId); assert.equal(audit[0].selection, audit[1].selection);
      assert.equal(evidenceFingerprint((await p.history.findRevision(revision.id)).candidate), originalCandidateHash);
      const report = await performance.read({ from: state.cycle.kickoffAt - 1, to: state.cycle.kickoffAt + 1, source: 'ai-score-distribution' });
      assert.equal(report.markets.length, 7); assert.ok(report.markets.every((entry) => entry.total === 1));
      for (const key of [goalAsianHandicapMarket(-.25).key, goalAsianHandicapMarket(.25).key, goalAsianHandicapMarket(0).key]) {
        const value = report.markets.find((entry) => entry.marketKey === key);
        assert.equal(value.binaryDenominator, 0); assert.equal(value.binaryHitRate, null);
      }
    });
    await t.test('separately verified sealed HT evidence settles HT/2H/HTFT, and same-FT half-time correction appends exact-pick history', async () => {
      const keys = [goalResultMarket('half-time').key, goalResultMarket('second-half').key, goalHalfFullMarket().key];
      await observe(0, 2, { home: 0, away: 2 }); await settlement.settleFixture(state.fixture.id);
      const first = await settlement.extendedForFixture(state.fixture.id), firstByKey = new Map(first.markets.map((entry) => [entry.marketKey, entry]));
      for (const key of keys) assert.equal(firstByKey.get(key).settlement.status, 'correct');
      await observe(0, 2, { home: 0, away: 0 }); await settlement.settleFixture(state.fixture.id);
      const latest = await settlement.extendedForFixture(state.fixture.id), byKey = new Map(latest.markets.map((entry) => [entry.marketKey, entry]));
      for (const key of keys) {
        const original = firstByKey.get(key).settlement, corrected = byKey.get(key).settlement;
        assert.equal(corrected.status, 'incorrect'); assert.equal(corrected.kind, 'correction');
        assert.equal(corrected.predictionRevisionId, original.predictionRevisionId); assert.equal(corrected.selection, original.selection);
        assert.notEqual(corrected.resultId, original.resultId); assert.equal(corrected.correctedAt, corrected.at);
        const history = await settlement.extendedAudit(state.cycle.id, key);
        assert.equal(history.at(-2).id, original.id); assert.equal(history.at(-1).id, corrected.id);
      }
    });
    await t.test('forged structural settlement plans cannot replace the locked pick or create audit history', async () => {
      const before = await counts();
      await assert.rejects(p.history.withFixtureTransaction(state.fixture.id, async (_writer, tx) => {
        const plans = structuredClone(await planGoalMarketSettlements(tx, state.fixture.id));
        plans[0].base.selection = 'away'; plans[0].inputHash = evidenceFingerprint(plans[0].base);
        await persistGoalMarketSettlements(tx, plans, resultHash('forged-batch'), p.now());
      }), (error) => error instanceof PredictionHistoryError && error.reason === 'invalid-state');
      assert.deepEqual(await counts(), before);
    });
  });
});
