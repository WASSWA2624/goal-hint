import assert from "node:assert/strict";
import test from "node:test";
import { legacyLocalFirstGoalMarketDefinitions } from "../src/domain/goal-market-definitions.ts";
import { legacyLocalFeaturedDecisionVersion, localFeaturedDecisionVersion, previousLocalFeaturedDecisionVersion } from "../src/domain/local-featured-decision.ts";
import { LEGACY_LOCAL_FIRST_MARKET_REGISTRY_VERSION, LOCAL_FIRST_MARKET_REGISTRY_VERSION } from "../src/domain/market-registry.ts";
import { marketSelections } from "../src/domain/markets.ts";
import { compareForecastPicks } from "../src/domain/recommendation.ts";
import { deriveLocalGoalMarket } from "../src/domain/score-distribution-markets.ts";
import { evidenceFingerprint } from "../src/server/evidence/evidence-input.ts";
import { createFootballCatalogStore } from "../src/server/football/catalog-mysql-store.ts";
import { createFootballCatalogImporter } from "../src/server/football/catalog-service.ts";
import { localGoalModelVersion } from "../src/server/intelligence/local-goals-model.ts";
import { loadNovemberReplayEvidence } from "../src/server/intelligence/november-replay-evidence.ts";
import { preparePricedNovemberReplay } from "../src/server/intelligence/november-replay-featured.ts";
import { buildNovemberReplayMarkets } from "../src/server/intelligence/november-replay-model.ts";
import { createMysqlNovemberReplayStore, readNovemberReplayProjections } from "../src/server/intelligence/november-replay-store.ts";
import { encodeShadowArchive } from "../src/server/intelligence/shadow-store.ts";
import { legacyForecastMarketKey } from "../src/server/predictions/forecast-market-evaluator.ts";
import { parseLifecycleInput } from "../src/server/predictions/lifecycle-input.ts";
import { createScheduleLifecycleService } from "../src/server/predictions/lifecycle-service.ts";
import { createMysqlResultSyncStore } from "../src/server/results/result-sync-mysql-store.ts";
import { catalogFixture, catalogRequest, createSyntheticCatalogAdapter } from "./helpers/catalog-fixtures.mjs";
import { lifecycleAuthority, lifecycleInput, lifecyclePolicy } from "./helpers/lifecycle-fixtures.mjs";
import { historyCandidate } from "./helpers/prediction-history-fixtures.mjs";
import { modelVersion } from "./helpers/predictor-fixtures.mjs";
import { catalogSelectionAuthority } from "./helpers/selection-fixtures.mjs";
import { withPredictionPipeline } from "./prediction-pipeline.mjs";

async function archiveLegacyDraft(database, current, expectedGoals) {
  const present = new Set(current.markets.map(({ definition }) => definition.key));
  const legacyKeys = new Set([...legacyLocalFirstGoalMarketDefinitions.map(({ key }) => key),
    ...Object.keys(marketSelections).map(legacyForecastMarketKey)]);
  const legacyOnly = legacyLocalFirstGoalMarketDefinitions.filter(({ key }) => !present.has(key));
  assert.ok(legacyOnly.some(({ selections }) => selections.some(({ rule }) =>
    (rule.kind === "total" || rule.kind === "asian-total") && rule.metric !== "total" && rule.line === 6.5)));
  const inferred = legacyOnly.map((definition) => {
    const result = deriveLocalGoalMarket(expectedGoals, definition, "outright-win");
    assert.ok(result.available);
    const selections = result.market.selections.map(({ key, outcomes }) => ({ key, outcomes }));
    const best = selections.map(({ key: selection, outcomes }) =>
      ({ key: definition.key, selection, probability: outcomes.win, odds: null })).sort(compareForecastPicks)[0];
    return { definition, selected: { selection: best.selection, probability: best.probability }, selections };
  });
  const markets = [...current.markets.filter(({ definition }) => legacyKeys.has(definition.key)), ...inferred];
  const winner = markets.map(({ definition, selected }) => ({ key: definition.key, ...selected, odds: null })).sort(compareForecastPicks)[0];
  const selected = { marketKey: winner.key, selection: winner.selection, probability: winner.probability };
  const draft = { ...current, registryVersion: LEGACY_LOCAL_FIRST_MARKET_REGISTRY_VERSION, markets, selected };
  const { fixtureId, kickoffAt, cycleId, scheduleVersion, sourceRevisionId, evidenceCutoffAt, evidenceHash, engineVersion, registryVersion, generatedAt } = draft;
  const id = evidenceFingerprint({ cohort: "2026-11-africa-kampala", fixtureId, kickoffAt, cycleId, scheduleVersion,
    sourceRevisionId, engineVersion, registryVersion, evidenceHash });
  const body = encodeShadowArchive(draft);
  // Read a sealed v4 row as it existed before v5. The current writer cannot create it.
  await database.query((tx) => tx.$executeRaw`INSERT INTO NovemberReplayRevision
    (id,fixtureId,kickoffAt,cycleId,scheduleVersion,sourceRevisionId,evidenceCutoffAt,evidenceHash,generatedAt,stagedAt,status,integrity,body)
    VALUES (${id},${fixtureId},${new Date(kickoffAt)},${cycleId},${scheduleVersion},${sourceRevisionId},${new Date(evidenceCutoffAt)},
      ${evidenceHash},${new Date(generatedAt)},${new Date(generatedAt)},'estimated',
      SHA2(CAST(JSON_EXTRACT(${body},'$') AS CHAR CHARACTER SET utf8mb4),256),JSON_EXTRACT(${body},'$'))`);
  return { id, draft, selected };
}

test("reviewed replay persists verified evidence and only its owner can reverse the display", { timeout: 480_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    await p.instance.executeAdmin(`
      GRANT SELECT, INSERT ON goal_hint_test.NovemberReplayRevision TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT ON goal_hint_test.NovemberReplayAction TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT ON goal_hint_test.OddsImportBatch TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT ON goal_hint_test.ProviderOddsSnapshot TO 'cutoff_app'@'127.0.0.1';
      GRANT SELECT, INSERT (fixtureId,changedAt), UPDATE (revisionId,sourceRevisionId,cycleId,scheduleVersion,kickoffAt,
        evidenceCutoffAt,activationOperationId,changedAt,integrity,body) ON goal_hint_test.NovemberReplayProjection TO 'cutoff_app'@'127.0.0.1';
    `);
    const clock = { now: () => p.now() };
    const historicDate = "2026-11-17", date = "2026-11-18", providerId = 54000;
    p.setTime(Date.parse(`${historicDate}T14:00:00Z`));
    const training = Array.from({ length: 36 }, (_, index) => {
      const goals = { home: index % 4, away: index % 3 };
      return catalogFixture(60000 + index, { kickoff: `${historicDate}T09:00:00Z`, status: "FT", goals, score: { fulltime: goals },
        homeId: [10, 30, 20][index % 3], awayId: [20, 10, 10][index % 3] });
    });
    const trainingSource = createSyntheticCatalogAdapter({ rows: training });
    trainingSource.clock.value = p.now();
    const trainingCatalog = createFootballCatalogStore(p.a, { clock, sealTeamHistory: true });
    const importer = createFootballCatalogImporter({ adapter: trainingSource.adapter, store: trainingCatalog, authority: catalogSelectionAuthority, clock });
    const imported = await importer.import(catalogRequest({ kind: "fixtures", query: { teamId: 10, from: "2026-11-01", to: historicDate } }, p.now()));
    assert.equal(imported.importedCount, training.length);

    const selectionAt = Date.parse(`${date}T08:00:00Z`), publicationAt = selectionAt + 4000, kickoffAt = publicationAt + 301_000;
    await p.cohort(date, p.first, { rows: [catalogFixture(providerId, { kickoff: new Date(kickoffAt).toISOString() })],
      selectionAt, afterSelectionAt: publicationAt });
    const state = await p.setup(providerId, date, { publicationAt });
    state.input.candidate = historyCandidate({ snapshot: state.snapshot, model: modelVersion(), jobId: state.lease.jobId, source: "api-football" });
    const published = await p.publisher.publish(state.input, state.lease);
    assert.equal(published.refresh.outcome, "published");
    const sourceRevisionId = published.revision.id, fixtureId = state.fixture.id, cycleId = state.cycle.id;
    p.setTime(state.cycle.cutoffAt);
    await p.first.close(p.target(state));

    p.setTime(kickoffAt + 30_000);
    const accountId = evidenceFingerprint("replay-writer-results");
    await p.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
    const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
    const resultStore = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
    const observation = parseLifecycleInput(lifecycleInput(state, p.now(), { status: "1H", raw: { goals: { home: 0, away: 0 } } }));
    const lease = await resultStore.acquire(evidenceFingerprint("replay-writer-results-owner"), 30_000);
    assert.ok(lease);
    const batch = { id: evidenceFingerprint("replay-writer-results-batch"), accountId, policyHash: evidenceFingerprint("replay-writer-results-policy"),
      receivedAt: p.now(), channel: "ids", date: null, requestedIds: [providerId], observations: [observation], error: null, requestsDispatched: 1 };
    try { await resultStore.save(lease, batch); await resultStore.apply(lease, batch); } finally { await resultStore.release(lease); }

    const canonical = await p.a.query((tx) => tx.footballFixture.findUniqueOrThrow({ where: { id: fixtureId }, include: { season: true } }));
    const occurrence = { fixtureId, externalId: canonical.externalId, fixtureVersion: canonical.dataVersion, kickoffAt,
      competitionId: canonical.season.competitionId, competitionName: null, homeTeamId: canonical.homeTeamId, homeTeamName: null,
      awayTeamId: canonical.awayTeamId, awayTeamName: null, status: canonical.status, cycleId, originalRevisionId: sourceRevisionId,
      applicable: true };
    const evidence = await loadNovemberReplayEvidence(p.a, occurrence, p.now());
    assert.equal(evidence.status, "qualified", `${evidence.reason} (${evidence.historyMatches} results)`);
    assert.equal(evidence.historyMatches, training.length);
    assert.ok(evidence.scheduleVersion > published.revision.scheduleVersion, "first play appends proof after the published schedule");
    const model = buildNovemberReplayMarkets(evidence.forecast);
    assert.ok(model);
    const store = createMysqlNovemberReplayStore(p.a);
    const common = { fixtureId, kickoffAt, cycleId, scheduleVersion: evidence.scheduleVersion, sourceRevisionId,
      evidenceCutoffAt: evidence.cutoffAt, engineVersion: localGoalModelVersion(), registryVersion: LOCAL_FIRST_MARKET_REGISTRY_VERSION,
      generatedAt: p.now() };
    const abstention = await store.stage({ ...common, evidenceHash: evidenceFingerprint("unavailable-at-lock"),
      status: "abstained", reason: "insufficient-point-in-time-history", markets: [], selected: null, evidenceReceiptIds: [], artifactHash: null });
    const stage = { ...common, ...model, evidenceHash: evidence.evidenceHash, evidenceReceiptIds: evidence.evidenceReceiptIds,
      status: "estimated", reason: null, artifactHash: evidence.forecast.hash };
    assert.ok(stage.markets.every(({ definition }) => definition.selections.every(({ rule }) =>
      rule.kind !== "total" && rule.kind !== "asian-total" || rule.line >= 1.5 && rule.line <= 5.5)));
    const staged = await store.stage(stage);
    const archived = await archiveLegacyDraft(p.a, stage, evidence.forecast.expectedGoals);
    const denied = (reason) => (error) => error.reason === reason;
    await assert.rejects(store.stage(archived.draft), denied("invalid-input"));
    await assert.rejects(store.stage({ ...archived.draft, registryVersion: LOCAL_FIRST_MARKET_REGISTRY_VERSION }), denied("invalid-input"));
    p.setTime(p.now() + 1);
    assert.deepEqual(await store.stage({ ...stage, generatedAt: p.now() }), staged);
    const tampered = await store.stage({ ...stage, evidenceHash: evidenceFingerprint("not-the-approved-reconstruction") });
    const diff = await store.activationDiff([abstention.id, tampered.id, staged.id, archived.id]);
    assert.deepEqual(diff.map(({ reason }) => reason), ["abstained", "evidence-changed", "eligible", "registry-superseded"]);
    assert.deepEqual(diff[3].selected, archived.selected);
    const readProjection = () => p.a.query((tx) => readNovemberReplayProjections(tx, [fixtureId]));
    assert.equal((await readProjection()).size, 0);
    const generation = async () => (await p.a.query((tx) => tx.$queryRaw`SELECT generation FROM PublicCacheTag WHERE tag='global:catalog'`))[0]?.generation ?? 0n;
    const originalGeneration = await generation();
    await assert.rejects(store.activate({ operationId: "denied-legacy-registry", revisionId: archived.id }), denied("registry-superseded"));
    assert.equal((await readProjection()).size, 0);
    assert.equal(await generation(), originalGeneration);
    await assert.rejects(store.activate({ operationId: "denied-reconstruction", revisionId: tampered.id }), denied("evidence-changed"));
    const input = { operationId: "original-reviewed-activation", revisionId: staged.id };
    const replicas = [store, createMysqlNovemberReplayStore(p.b), createMysqlNovemberReplayStore(p.replica())];
    const [activated, ...retries] = await Promise.all(replicas.map((replica) => replica.activate(input)));
    assert.deepEqual(retries, [activated, activated]);
    assert.deepEqual((await readProjection()).get(fixtureId)?.selected, model.selected);
    assert.equal(await generation(), originalGeneration + 1n);
    assert.deepEqual(await p.history.findRevision(sourceRevisionId), published.revision);
    assert.equal((await p.history.findCycle(cycleId)).lockedSetId, sourceRevisionId);
    assert.equal((await store.activationDiff([archived.id]))[0].reason, "registry-superseded");
    await assert.rejects(store.activate({ ...input, operationId: "different-operation" }), denied("projection-owned"));
    const rollback = { fixtureId, operationId: "reviewed-rollback", activationOperationId: input.operationId };
    const [rolledBack, ...rollbacks] = await Promise.all(replicas.map((replica) => replica.rollback(rollback)));
    assert.equal(rolledBack.kind, "rollback");
    assert.deepEqual(rollbacks, [rolledBack, rolledBack]);
    assert.equal((await readProjection()).size, 0);
    assert.equal(await generation(), originalGeneration + 2n);
    const restarted = createMysqlNovemberReplayStore({ transaction: p.a.transaction,
      query: () => assert.fail("a sealed activation receipt must not require another membership scan") });
    assert.deepEqual(await restarted.activate(input), activated, "a receipt retry cannot reactivate a rolled back pointer");
    assert.equal((await readProjection()).size, 0);
    const later = await store.activate({ ...input, operationId: "later-reviewed-activation" });
    await assert.rejects(store.rollback({ ...rollback, operationId: "stale-rollback" }), denied("projection-owned"));
    assert.equal((await readProjection()).get(fixtureId)?.revisionId, later.revisionId);
    const originalPointer = (await readProjection()).get(fixtureId);
    const replayAsOf = p.now();
    const { evidence: pricedEvidence, result: pricedResult } = await p.a.query((tx) =>
      preparePricedNovemberReplay(tx, occurrence, replayAsOf, undefined, legacyLocalFeaturedDecisionVersion));
    assert.ok(pricedResult, pricedEvidence.reason);
    assert.equal(pricedResult.featuredDecision.status, "abstained");
    assert.equal(pricedResult.selected, null);
    assert.ok(pricedResult.decisionAt < kickoffAt);
    const revised = await store.stage({ ...stage, ...pricedResult, replayAsOf, generatedAt: p.now(),
      teams: [occurrence.homeTeamId, occurrence.awayTeamId], evidenceCutoffAt: pricedEvidence.cutoffAt,
      evidenceHash: pricedEvidence.evidenceHash, evidenceReceiptIds: pricedEvidence.evidenceReceiptIds });
    const [revisedDiff] = await store.activationDiff([revised.id]);
    assert.equal(revisedDiff.previousProjectionRevisionId, later.revisionId);
    assert.equal(revisedDiff.eligible, true, revisedDiff.reason);
    const replacement = { revisionId: revised.id, operationId: "suppress-unpriced" };
    await assert.rejects(store.activate(replacement), denied("projection-owned"));
    await store.activate({ ...replacement, expectedProjectionRevisionId: later.revisionId });
    const active = (await readProjection()).get(fixtureId);
    assert.equal(active?.selected, null);
    assert.deepEqual(active?.featuredDecision, pricedResult.featuredDecision);
    assert.equal(active?.markets.length, originalPointer?.markets.length);
    const unchangedDelta = await store.stage({ ...stage, ...pricedResult, replayAsOf, generatedAt: p.now(),
      teams: [occurrence.homeTeamId, occurrence.awayTeamId], evidenceCutoffAt: pricedEvidence.cutoffAt,
      evidenceHash: pricedEvidence.evidenceHash, evidenceReceiptIds: pricedEvidence.evidenceReceiptIds,
      featuredDecision: { ...pricedResult.featuredDecision, version: previousLocalFeaturedDecisionVersion },
      policyDelta: { baselineRevisionId: revised.id, expectedProjectionRevisionId: revised.id } });
    assert.equal((await store.activationDiff([unchangedDelta.id]))[0].reason, "no-featured-display-change");
    await assert.rejects(store.activate({ revisionId: unchangedDelta.id, operationId: "unchanged-policy-delta",
      expectedProjectionRevisionId: revised.id }), denied("no-featured-display-change"));
    assert.deepEqual((await readProjection()).get(fixtureId), active);
    const { evidence: v3Evidence, result: forecastOnly } = await p.a.query((tx) =>
      preparePricedNovemberReplay(tx, occurrence, replayAsOf, undefined, localFeaturedDecisionVersion));
    assert.equal(forecastOnly.featuredDecision.status, "forecast-only");
    assert.ok(forecastOnly.selected.probability >= 0.6);
    assert.equal(forecastOnly.featuredDecision.quote, undefined);
    const v3 = await store.stage({ ...stage, ...forecastOnly, replayAsOf, generatedAt: p.now(),
      teams: [occurrence.homeTeamId, occurrence.awayTeamId], evidenceCutoffAt: v3Evidence.cutoffAt,
      evidenceHash: v3Evidence.evidenceHash, evidenceReceiptIds: v3Evidence.evidenceReceiptIds });
    await store.activate({ revisionId: v3.id, operationId: "forecast-only-policy", expectedProjectionRevisionId: revised.id });
    const v3Projection = (await readProjection()).get(fixtureId);
    assert.deepEqual(v3Projection?.selected, forecastOnly.selected);
    assert.deepEqual(v3Projection?.featuredDecision, forecastOnly.featuredDecision);
    await store.rollback({ fixtureId, operationId: "restore-before-forecast-only-policy", activationOperationId: "forecast-only-policy" });
    assert.deepEqual((await readProjection()).get(fixtureId), active);
    assert.deepEqual(await p.history.findRevision(sourceRevisionId), published.revision);
    await store.rollback({ fixtureId, operationId: "restore-older-projection", activationOperationId: replacement.operationId });
    assert.deepEqual((await readProjection()).get(fixtureId), originalPointer);
    await assert.rejects(p.instance.executeAdmin(`UPDATE NovemberReplayRevision SET stagedAt=stagedAt WHERE id='${staged.id}';`));
    assert.deepEqual(await p.history.findRevision(sourceRevisionId), published.revision);

    // Exercise the new storage constraint independently from occurrence-proof
    // checks. The locked November fixture above used the legacy CHECK branch.
    const owner = await p.a.query((tx) => tx.footballFixture.findFirstOrThrow({
      where: { externalId: 60000n }, select: { id: true, homeTeamId: true, awayTeamId: true },
    }));
    const laterKickoffAt = Date.parse("2027-01-01T15:00:00Z");
    p.setTime(laterKickoffAt + 30_000);
    const times = { kickoffAt: laterKickoffAt, evidenceCutoffAt: laterKickoffAt - 600_000,
      decisionAt: laterKickoffAt - 300_001, generatedAt: p.now() };
    const withoutSource = { fixtureId: owner.id, cycleId: null, sourceRevisionId: null, scheduleVersion: null,
      teams: [owner.homeTeamId, owner.awayTeamId] };
    const outsideNovember = await store.stage({ ...stage, ...pricedResult, ...times, ...withoutSource, replayAsOf: p.now() });
    const body = encodeShadowArchive({ ...withoutSource, ...times, revisionId: outsideNovember.id, activatedAt: p.now(),
      selected: null, markets: active.markets, featuredDecision: pricedResult.featuredDecision });
    await p.a.transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO NovemberReplayProjection (fixtureId,changedAt) VALUES (${owner.id},${new Date(p.now())})`;
      assert.equal(await tx.$executeRaw`UPDATE NovemberReplayProjection SET revisionId=${outsideNovember.id},kickoffAt=${new Date(times.kickoffAt)},
        evidenceCutoffAt=${new Date(times.evidenceCutoffAt)},activationOperationId='outside-november-test',
        integrity=SHA2(CAST(JSON_EXTRACT(${body},'$') AS CHAR CHARACTER SET utf8mb4),256),body=JSON_EXTRACT(${body},'$')
        WHERE fixtureId=${owner.id}`, 1);
    });
  }, { migrationTimeoutMs: 300_000 });
});
