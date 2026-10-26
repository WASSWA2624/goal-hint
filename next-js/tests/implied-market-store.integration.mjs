import assert from 'node:assert/strict';
import test from 'node:test';
import { getReportingDate } from '../src/domain/calendar.ts';
import { nonGoalTotalsMarket } from '../src/domain/non-goal-market-definitions.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { createMysqlOddsStore } from '../src/server/odds/odds-mysql-store.ts';
import { createOddsImportService } from '../src/server/odds/odds-service.ts';
import { createExtendedMarketPerformanceService } from '../src/server/performance/extended-market-performance.ts';
import { readImpliedMarketExtension, publicImpliedMarketExtension, appendImpliedMarketExtension } from '../src/server/predictions/implied-market-store.ts';
import { createRevisionPublicationService } from '../src/server/predictions/publication-service.ts';
import { RevisionPublicationError } from '../src/server/predictions/publication-contract.ts';
import { PredictionHistoryError } from '../src/server/predictions/history-contract.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { appendImpliedResultEvidence, readImpliedResultEvidence } from '../src/server/settlement/implied-market-evidence.ts';
import { createMarketSettlementService } from '../src/server/settlement/settlement-service.ts';
import { planImpliedMarketSettlements, persistImpliedMarketSettlements } from '../src/server/settlement/implied-market-settlement.ts';
import { lifecycleAuthority, lifecycleInput, lifecyclePolicy } from './helpers/lifecycle-fixtures.mjs';
import { createSyntheticOddsAdapter, oddsAuthority, oddsBounds, oddsHash, oddsPolicy, oddsRequest, rawOddsRow, offsetTime } from './helpers/odds-fixtures.mjs';
import { publicationAuthority, publicationPolicy } from './helpers/publication-fixtures.mjs';
import { resultHash } from './helpers/result-sync-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

// All bet IDs, names, rules, approvals, responses and statistics are synthetic. No paid/public provider calls.
test('market-implied publication, missing evidence and statistic-only correction on owned genuine MySQL', { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const state = await p.setup(3005), accountId = oddsHash('synthetic-implied-account');
    await p.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
    const definitions = [nonGoalTotalsMarket('corners', 9.5), nonGoalTotalsMarket('corners', 10.5), nonGoalTotalsMarket('yellow-cards', 3.5)];
    const mappings = definitions.map((definition, index) => ({ betId: index < 2 ? 9001 : 9002,
      betName: index < 2 ? 'Synthetic corner totals' : 'Synthetic yellow card totals', definition,
      providerLabels: Object.fromEntries(definition.selections.map(({ key, label }) => [key, label])) }));
    const odds = createSyntheticOddsAdapter({ now: () => p.now() }), policy = oddsPolicy(), clock = { now: () => p.now() };
    const importService = createOddsImportService({ adapter: odds.adapter.odds, store: createMysqlOddsStore(p.a),
      authority: oddsAuthority({ publicDisplay: false }, policy), accountId: () => accountId, bounds: () => oddsBounds(p.now()), clock });
    odds.state.bets = [{ id: 9001, name: mappings[0].betName }, { id: 9002, name: mappings[2].betName }];
    const slot = () => Math.floor(p.now() / 10800000) * 10800000;
    await importService.importCatalog(oddsRequest('bets', slot(), { policy }));
    odds.state.rows = [rawOddsRow(Number(state.fixture.externalId), state.cycle.kickoffAt, { update: offsetTime(p.now() - 1000), bets: [
      { id: 9001, name: mappings[0].betName, values: mappings.slice(0, 2).flatMap((mapping) =>
        mapping.definition.selections.map(({ key }) => ({ value: mapping.providerLabels[key], odd: key === 'over' ? '1.50' : '3.00' }))) },
      { id: 9002, name: mappings[2].betName, values: mappings[2].definition.selections.map(({ key }) =>
        ({ value: mappings[2].providerLabels[key], odd: key === 'over' ? '1.50' : '3.00' })) },
    ] })];
    const prices = await importService.importDate(oddsRequest('prices', slot(), { policy, date: getReportingDate(state.cycle.kickoffAt) }));
    assert.equal(prices.status, 'complete'); assert.equal(prices.outcomes.changed, 1);
    const snapshots = await p.a.query((tx) => tx.providerOddsSnapshot.findMany({ where: { fixtureId: state.fixture.id } }));
    assert.equal(snapshots.length, 2);
    const impliedExtension = { bookmakerId: policy.bookmakerId, freshnessMs: policy.freshnessMs, snapshotIds: snapshots.map(({ id }) => id), mappings };
    const input = { ...state.input, impliedExtension }, originalCandidateHash = evidenceFingerprint(input.candidate);
    const trusted = new Set([evidenceFingerprint(impliedExtension)]);
    const authority = publicationAuthority({ verifyImpliedExtension: (value) => trusted.has(evidenceFingerprint(value.impliedExtension)) });
    const publisher = createRevisionPublicationService({ database: p.a, queue: p.queue, policy: publicationPolicy(), authority });
    const settlement = createMarketSettlementService({ database: p.a, queue: p.queue, extendedMarketsEnabled: true });
    const legacy = createMarketSettlementService({ database: p.a, queue: p.queue });
    const performance = createExtendedMarketPerformanceService({ database: p.a, enabled: true });
    let revision;
    await t.test('malformed rule changes are rejected before publication', async () => {
      const forged = structuredClone(input); forged.impliedExtension.mappings[0].definition.countingRule = 'unreviewed-rule';
      await assert.rejects(publisher.publish(forged, state.lease), (error) => error instanceof RevisionPublicationError && error.reason === 'invalid-request');
      assert.equal(await p.a.query((tx) => tx.predictionSet.count({ where: { fixtureId: state.fixture.id } })), 0);
    });
    await t.test('structurally valid unreviewed rules are rejected by publication authority', async () => {
      const forged = structuredClone(input);
      forged.impliedExtension.mappings[0].definition = nonGoalTotalsMarket('corners', 9.5, { countingRule: 'unreviewed-rule' });
      await assert.rejects(publisher.publish(forged, state.lease), (error) => error instanceof RevisionPublicationError && error.reason === 'unauthorized');
      assert.equal(await p.a.query((tx) => tx.predictionSet.count({ where: { fixtureId: state.fixture.id } })), 0);
    });
    await t.test('private stored snapshots publish once with the original legacy forecast and lean pick rows', async () => {
      const receipt = await publisher.publish(input, state.lease); revision = receipt.revision;
      assert.equal(receipt.refresh.outcome, 'published'); assert.equal(evidenceFingerprint(revision.candidate), originalCandidateHash);
      const extension = await p.a.query((tx) => readImpliedMarketExtension(tx, revision.id));
      assert.equal(extension.markets.length, 3); assert.ok(extension.markets.every(({ derivation }) => derivation.available));
      const publicValue = publicImpliedMarketExtension(extension, p.now());
      assert.ok(publicValue.every((market) => market.source === 'market-implied' && market.selection === 'over'));
      assert.equal((await publisher.publish(input, state.lease)).revision.id, revision.id);
      assert.equal(await p.a.query((tx) => tx.impliedMarketExtension.count({ where: { fixtureId: state.fixture.id } })), 1);
      assert.equal(await p.a.query((tx) => tx.extendedMarketPublishedPick.count({ where: { fixtureId: state.fixture.id } })), 3);
      await assert.rejects(p.history.withFixtureTransaction(state.fixture.id, (_writer, tx) => appendImpliedMarketExtension(tx, {
        ...impliedExtension, mappings: mappings.slice(0, 1), revisionId: revision.id, cycleId: state.cycle.id,
        fixtureId: state.fixture.id, recordedAt: p.now() })), (error) => error instanceof PredictionHistoryError && error.reason === 'conflicting-request');
    });
    p.setTime(state.cycle.cutoffAt); await p.first.close(p.target(state));
    await t.test('legacy mode reads no extended rows; enabled mode leaves missing verified statistics pending', async () => {
      await legacy.settleFixture(state.fixture.id);
      assert.equal(await p.a.query((tx) => tx.extendedMarketSettlement.count({ where: { fixtureId: state.fixture.id } })), 0);
      assert.equal((await settlement.settleFixture(state.fixture.id)).changed, 3);
      const view = await settlement.extendedForFixture(state.fixture.id);
      assert.ok(view.markets.every(({ settlement: value }) => value.source === 'market-implied' && value.status === 'pending'));
    });
    const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
    const results = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
    p.setTime(state.cycle.kickoffAt + 7200000);
    const observed = parseLifecycleInput(lifecycleInput(state, p.now(), { status: 'FT', raw: {
      goals: { home: 1, away: 0 }, score: { fulltime: { home: 1, away: 0 }, halftime: { home: 0, away: 0 } },
    } }));
    const lease = await results.acquire(resultHash('implied-result-owner'), 30000); assert.ok(lease);
    const batch = { id: resultHash('implied-final-result'), accountId, policyHash: resultHash('implied-final-result-policy'), receivedAt: p.now(),
      channel: 'ids', date: null, requestedIds: [Number(state.fixture.externalId)], observations: [observed], error: null, requestsDispatched: 1 };
    try { await results.save(lease, batch); await results.apply(lease, batch); } finally { await results.release(lease); }
    await settlement.settleFixture(state.fixture.id);
    const resultId = (await p.a.query((tx) => tx.fixtureResultState.findUniqueOrThrow({ where: { fixtureId: state.fixture.id } }))).resultId;
    const sourceBindings = new Set();
    const evidenceAuthority = { verify: async (_tx, value) => sourceBindings.has(evidenceFingerprint(value)) };
    async function recordCorners(home, away) {
      p.setTime(p.now() + 1000);
      const evidenceInput = { fixtureId: state.fixture.id, resultId, provider: 'api-football', externalFixtureId: String(state.fixture.externalId),
        homeTeamId: state.fixture.homeTeamId, awayTeamId: state.fixture.awayTeamId, contractVersion: 'verified-non-goal-result-v1',
        sources: [{ endpoint: 'fixtures/statistics', sourceRef: resultHash(`synthetic-corners:${home}:${away}`), retrievedAt: p.now(), providerUpdatedAt: null }],
        evidence: { counts: [{ metric: 'corners', period: 'full-time', scope: 'regulation-including-stoppage-time', countingRule: definitions[0].countingRule,
          verified: true, home, away }], events: [] } };
      sourceBindings.add(evidenceFingerprint(evidenceInput));
      return p.history.withFixtureTransaction(state.fixture.id, (_writer, tx) => appendImpliedResultEvidence(tx, evidenceInput, p.now(), evidenceAuthority));
    }
    let firstEvidence;
    await t.test('verified current result statistics settle only exact market definitions; missing cards remain pending', async () => {
      firstEvidence = await recordCorners(6, 4); assert.ok((await settlement.pending()).includes(state.fixture.id));
      await settlement.reconcile();
      const byKey = new Map((await settlement.extendedForFixture(state.fixture.id)).markets.map((market) => [market.marketKey, market]));
      assert.equal(byKey.get(definitions[0].key).settlement.status, 'correct');
      assert.equal(byKey.get(definitions[1].key).settlement.status, 'incorrect');
      assert.equal(byKey.get(definitions[2].key).settlement.status, 'pending');
      assert.equal(byKey.get(definitions[2].key).settlement.reason, 'missing-verified-statistic');
      const report = await performance.read({ from: state.cycle.kickoffAt - 1, to: state.cycle.kickoffAt + 1, source: 'market-implied' });
      assert.equal(report.markets.length, 3); assert.ok(report.markets.every(({ source, total }) => source === 'market-implied' && total === 1));
      assert.equal(report.markets.find(({ marketKey }) => marketKey === definitions[0].key).binaryCorrect, 1);
    });
    await t.test('same-score statistic correction is independently discovered, audits the same pick and increments one batch version', async () => {
      const before = await p.totals(state), evidence = await recordCorners(3, 2);
      assert.notEqual(evidence.id, firstEvidence.id); assert.equal(evidence.resultId, firstEvidence.resultId); assert.ok(evidence.sequence > firstEvidence.sequence);
      assert.ok((await settlement.pending()).includes(state.fixture.id));
      const staleReport = await performance.read({ from: state.cycle.kickoffAt - 1, to: state.cycle.kickoffAt + 1, source: 'market-implied' });
      assert.ok(staleReport.markets.every(({ binaryDenominator }) => binaryDenominator === 0));
      await settlement.reconcile(); const after = await p.totals(state); assert.equal(after.version, before.version + 1n);
      const audit = await settlement.extendedAudit(state.cycle.id, definitions[0].key), original = audit.at(-2), corrected = audit.at(-1);
      assert.equal(original.status, 'correct'); assert.equal(corrected.status, 'incorrect'); assert.equal(corrected.kind, 'correction');
      assert.equal(corrected.resultId, original.resultId); assert.notEqual(corrected.evidenceId, original.evidenceId);
      assert.equal(corrected.selection, original.selection); assert.equal(corrected.predictionRevisionId, original.predictionRevisionId);
      assert.equal(corrected.correctedAt, corrected.at);
      assert.equal((await settlement.settleFixture(state.fixture.id)).changed, 0);
      assert.equal((await p.a.query((tx) => readImpliedResultEvidence(tx, state.fixture.id, resultId))).id, evidence.id);
      assert.equal(evidenceFingerprint((await p.history.findRevision(revision.id)).candidate), originalCandidateHash);
    });
    await t.test('forged settlement plans and unverified result evidence cannot write audit history', async () => {
      const plans = await p.history.withFixtureTransaction(state.fixture.id, (_writer, tx) => planImpliedMarketSettlements(tx, state.fixture.id));
      const forged = structuredClone(plans); forged[0].base.selection = 'under'; forged[0].inputHash = evidenceFingerprint(forged[0].base);
      await assert.rejects(p.history.withFixtureTransaction(state.fixture.id, (_writer, tx) =>
        persistImpliedMarketSettlements(tx, forged, resultHash('forged-implied-batch'), p.now())),
      (error) => error instanceof PredictionHistoryError && error.reason === 'invalid-state');
      const evidence = await p.a.query((tx) => readImpliedResultEvidence(tx, state.fixture.id, resultId));
      const { id: _id, recordedAt: _recordedAt, contentHash: _contentHash, sequence: _sequence, ...raw } = evidence;
      void _id; void _recordedAt; void _contentHash; void _sequence;
      await assert.rejects(p.history.withFixtureTransaction(state.fixture.id, (_writer, tx) =>
        appendImpliedResultEvidence(tx, raw, p.now(), { verify: async () => false })),
      (error) => error instanceof PredictionHistoryError && error.reason === 'invalid-request');
    });
  });
});
