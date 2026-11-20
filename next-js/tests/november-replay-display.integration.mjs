import assert from 'node:assert/strict';
import test from 'node:test';
import { localFirstGoalMarketDefinitions, registeredForecastGoalMarkets } from '../src/domain/goal-market-definitions.ts';
import { sameCardFixture } from '../src/domain/match-card.ts';
import { currentFeaturedOutcome } from '../src/domain/match-details.ts';
import { feedMarketPickId, feedMarketPickIdentity } from '../src/domain/feed-market-picks.ts';
import { parseFeedQuery, resolveFeedDates } from '../src/domain/feed-query.ts';
import { matchFeedResponseSchema } from '../src/domain/match-feed.ts';
import { matchDetailResponseSchema } from '../src/domain/match-detail.ts';
import { mergeLiveDetail } from '../src/domain/live-refresh.ts';
import { gateDetailResponse, gateFeedResponse } from '../src/domain/paywall.ts';
import { createMysqlPublicResponseCache } from '../src/server/cache/mysql-public-cache.ts';
import { LOCAL_FIRST_FORECAST_CASCADE } from '../src/server/fallback/fallback-contract.ts';
import { resolveFallbackCandidate } from '../src/server/fallback/fallback-resolution.ts';
import { readNovemberReplayProjections } from '../src/server/intelligence/november-replay-store.ts';
import { encodeShadowArchive } from '../src/server/intelligence/shadow-store.ts';
import { createMatchFeedService } from '../src/server/matches/feed-service.ts';
import { readStoredFeedMarkets } from '../src/server/matches/feed-markets-read.ts';
import { feedSql } from '../src/server/matches/feed-read.ts';
import { createMatchFeedSummaryService } from '../src/server/matches/feed-summary-service.ts';
import { createMatchDetailService } from '../src/server/matches/detail-service.ts';
import { projectRetrospectiveForecast } from '../src/server/matches/retrospective-picks.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { createMysqlRefreshStore } from '../src/server/refresh/refresh-mysql-store.ts';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { createMarketSettlementService } from '../src/server/settlement/settlement-service.ts';
import { catalogFixture } from './helpers/catalog-fixtures.mjs';
import { fallbackAiDenied, fallbackFixture, fallbackProvider } from './helpers/fallback-fixtures.mjs';
import { lifecycleAuthority, lifecyclePolicy, lifecycleInput } from './helpers/lifecycle-fixtures.mjs';
import { historyCandidate } from './helpers/prediction-history-fixtures.mjs';
import { modelVersion } from './helpers/predictor-fixtures.mjs';
import { resultHash } from './helpers/result-sync-fixtures.mjs';
import { savePageScenarios } from './helpers/page-capture.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

function sqlDate(value) {
  return `'${new Date(value).toISOString().replace('T', ' ').replace('Z', '')}'`;
}
function sqlArchive(value) {
  return `JSON_EXTRACT(CONVERT(X'${Buffer.from(encodeShadowArchive(value)).toString('hex')}' USING utf8mb4), '$')`;
}

test('only Matches windows intersecting the Kampala replay month reference the projection', () => {
  const today = '2026-11-20';
  function hasReplay(date, zone, publishedForecasts = true) {
    const query = parseFeedQuery({ date, tz: zone, marketPick: 'match-result:away-win' }, { today });
    const range = resolveFeedDates(query, today);
    return feedSql(query, range, [39], false, null, false, false, null, publishedForecasts).pageJoins.sql.includes('NovemberReplayProjection');
  }
  assert.equal(hasReplay('2026-10-31', 'Africa/Kampala'), false);
  assert.equal(hasReplay('2026-10-31', 'UTC'), true);
  assert.equal(hasReplay('2026-11-01', 'Africa/Kampala'), true);
  assert.equal(hasReplay('2026-11-30', 'Africa/Kampala'), true);
  assert.equal(hasReplay('2026-12-01', 'Africa/Kampala'), false);
  assert.equal(hasReplay('2026-11-18', 'Africa/Kampala', false), false);
});

test('November replay has one display across feed, exact outcome and detail while originals remain reproducible', { timeout: 360_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const date = '2026-11-18', providerId = 41310;
    const selectionAt = Date.parse(`${date}T08:00:00Z`), publicationAt = selectionAt + 4000, kickoffAt = publicationAt + 301_000;
    await p.cohort(date, p.first, { rows: [catalogFixture(providerId, { kickoff: new Date(kickoffAt).toISOString() })], selectionAt, afterSelectionAt: publicationAt });
    const state = await p.setup(providerId, date, { publicationAt });
    state.input.candidate = historyCandidate({ snapshot: state.snapshot, model: modelVersion(), jobId: state.lease.jobId, source: 'api-football' });
    const published = await p.publisher.publish(state.input, state.lease);
    assert.equal(published.refresh.outcome, 'published');
    await p.queue.acknowledge(state.lease);
    const fixtureId = state.fixture.id, cycleId = state.cycle.id, sourceRevisionId = published.revision.id;
    p.setTime(state.cycle.cutoffAt);
    await p.first.close(p.target(state));
    const accountId = resultHash('november-display-results');
    await p.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
    const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
    const resultStore = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
    const settlement = createMarketSettlementService({ database: p.a, queue: p.queue });
    const applyResult = async (status, home, away) => {
      const observation = parseLifecycleInput(lifecycleInput(state, p.now(), { status, actualStartedAt: kickoffAt,
        raw: { goals: { home, away }, ...(status === 'FT' ? { score: { fulltime: { home, away } } } : {}) } }));
      const lease = await resultStore.acquire(resultHash('november-display-result-owner'), 30_000); assert.ok(lease);
      const batch = { id: resultHash(`november-display-result:${status}`), accountId, policyHash: resultHash('november-display-result-policy'),
        receivedAt: p.now(), channel: 'ids', date: null, requestedIds: [providerId], observations: [observation], error: null, requestsDispatched: 1 };
      try { await resultStore.save(lease, batch); await resultStore.apply(lease, batch); } finally { await resultStore.release(lease); }
    };
    p.setTime(kickoffAt + 30_000);
    await applyResult('1H', 1, 0);
    const locked = await p.history.findCycle(cycleId);
    assert.equal(locked.state, 'closed');
    assert.equal(locked.lockedSetId, sourceRevisionId);
    const clock = { now: () => p.now() }, cache = createMysqlPublicResponseCache(p.a, clock.now);
    const feed = createMatchFeedService({ database: p.a, competitionIds: [39], clock, cache });
    const detail = createMatchDetailService({ database: p.a, clock, cache });
    const summary = createMatchFeedSummaryService({ database: p.a, competitionIds: [39], clock, cache });
    const scope = { publishedForecasts: true }, data = () => feed.query({ date }, scope), free = { tier: 'free', signedIn: false };
    const exact = (marketPick) => feed.query({ date, marketPick }, scope);
    const originalLive = await data();
    assert.equal(originalLive.total, 1);
    assert.equal(originalLive.records[0].forecast.markets[0].market.source, 'api-football');
    assert.equal(originalLive.records[0].status, 'live');
    assert.equal((await exact('total-goals:under-1.5')).total, 0);
    assert.equal((await detail.query(fixtureId)).fixture.retrospective, undefined);

    // Supply only the compact active read fixture. Replay evidence and authorizing it are tested by the separate writer acceptance.
    const revisionId = resultHash('november-display-replay'), evidenceCutoffAt = state.snapshot.context.cutoffAt;
    const generatedAt = p.now(), activatedAt = p.now() + 1000;
    const definitions = [...registeredForecastGoalMarkets(true).map(({ definition }) => definition), ...localFirstGoalMarketDefinitions];
    const goals = definitions.find(({ key }) => key === 'goal:full-time:totals:total:1.5:binary');
    const result = definitions.find(({ key }) => key === 'goal:full-time:result');
    assert.ok(goals && result);
    const probability = 0.8365637684146764;
    const selected = { marketKey: result.key, selection: 'away', probability };
    const projection = { fixtureId, revisionId, sourceRevisionId, cycleId, scheduleVersion: locked.scheduleVersion, kickoffAt,
      evidenceCutoffAt, generatedAt, activatedAt, selected, markets: [
        { definition: result, selected: { selection: selected.selection, probability } },
        { definition: goals, selected: { selection: 'under', probability: 0.71 } },
      ] };
    const archived = sqlArchive(projection), placeholder = sqlArchive({ purpose: 'private reader permission fixture' });
    await p.instance.executeAdmin(`INSERT INTO NovemberReplayRevision (id,fixtureId,kickoffAt,cycleId,scheduleVersion,sourceRevisionId,
      evidenceCutoffAt,evidenceHash,generatedAt,stagedAt,status,integrity,body) VALUES ('${revisionId}','${fixtureId}',${sqlDate(kickoffAt)},'${cycleId}',
      ${locked.scheduleVersion},'${sourceRevisionId}',${sqlDate(evidenceCutoffAt)},'${resultHash('november-display-evidence')}',
      ${sqlDate(generatedAt)},${sqlDate(activatedAt)},'estimated',SHA2(CAST(${placeholder} AS CHAR CHARACTER SET utf8mb4),256),${placeholder});
      INSERT INTO NovemberReplayProjection (fixtureId,changedAt) VALUES ('${fixtureId}',${sqlDate(activatedAt)});
      UPDATE NovemberReplayProjection SET revisionId='${revisionId}',sourceRevisionId='${sourceRevisionId}',cycleId='${cycleId}',
      scheduleVersion=${locked.scheduleVersion},kickoffAt=${sqlDate(kickoffAt)},evidenceCutoffAt=${sqlDate(evidenceCutoffAt)},
      activationOperationId='display-test',body=${archived},integrity=SHA2(CAST(${archived} AS CHAR CHARACTER SET utf8mb4),256) WHERE fixtureId='${fixtureId}';`);
    p.setTime(activatedAt + 1000);
    await assert.rejects(p.a.query((tx) => tx.$queryRaw`SELECT body FROM NovemberReplayRevision`));
    const active = (await p.a.query((tx) => readNovemberReplayProjections(tx, [fixtureId]))).get(fixtureId);
    if (!active) {
      const { stdout } = await p.instance.executeAdmin(`SELECT f.activeCycleId=p.cycleId, f.kickoff=p.kickoffAt,
        c.state,c.lockedSetId=p.sourceRevisionId,c.scheduleVersion=p.scheduleVersion,c.kickoffAt=p.kickoffAt,
        c.closedAt>=p.evidenceCutoffAt,l.issue,l.actualStartedAt>=p.evidenceCutoffAt,b.closedAt>=p.evidenceCutoffAt,
        JSON_UNQUOTE(JSON_EXTRACT(s.candidateJson,'$.context.context.home.teamId'))=f.homeTeamId,
        JSON_UNQUOTE(JSON_EXTRACT(s.candidateJson,'$.context.context.away.teamId'))=f.awayTeamId,
        p.integrity=SHA2(CAST(p.body AS CHAR CHARACTER SET utf8mb4),256),f.provider,f.status
        FROM NovemberReplayProjection p JOIN FootballFixture f ON f.id=p.fixtureId
        LEFT JOIN PredictionCycle c ON c.id=p.cycleId LEFT JOIN FixtureLifecycleState l ON l.fixtureId=f.id
        LEFT JOIN PredictionPublicationBarrier b ON b.cycleId=c.id LEFT JOIN PredictionSet s ON s.id=p.sourceRevisionId
        WHERE p.fixtureId='${fixtureId}'`);
      assert.fail(`No active pointer despite sealed write. Current occurrence checks: ${stdout.trim()}`);
    }
    assert.ok(projectRetrospectiveForecast(originalLive.records[0], active, 'en'));
    const live = await data(), revised = live.records[0], detailLive = await detail.query(fixtureId);
    assert.notEqual(live.paginationVersion, originalLive.paginationVersion, 'activation invalidates existing public cache entries');
    assert.deepEqual(revised.forecast, originalLive.records[0].forecast);
    assert.deepEqual(revised.prices, originalLive.records[0].prices);
    assert.equal(revised.dataVersion, originalLive.records[0].dataVersion);
    assert.equal(revised.retrospective.pick.selection, 'away-win');
    assert.equal(revised.retrospective.pick.probability, probability);
    assert.equal(revised.retrospective.pick.odds, null);
    assert.deepEqual(detailLive.fixture.retrospective, revised.retrospective);
    assert.equal(detailLive.currentRevisionId, sourceRevisionId);
    assert.equal(currentFeaturedOutcome(detailLive).selection, 'away-win');
    assert.equal((await exact('match-result:away-win')).total, 1);
    assert.equal((await exact('match-result:home-win')).total, 0);
    assert.equal((await exact('total-goals:under-1.5')).records[0].retrospective.pick.selection, 'under');
    assert.equal((await exact('total-goals:over-1.5')).total, 0);
    const marketScope = { date, market: 'total-goals', prob: '70-71', picks: 'only', sort: 'probability' };
    assert.equal((await feed.query(marketScope, scope)).records[0].retrospective.pick.probability, 0.71);
    assert.equal((await feed.query({ ...marketScope, marketPick: 'total-goals:under-1.5' }, scope)).total, 1);
    assert.equal((await feed.query({ ...marketScope, prob: '72-100' }, scope)).total, 0);
    assert.equal((await feed.query({ date, market: 'match-result', marketPick: 'total-goals:under-1.5' }, scope)).total, 0);
    const withPrices = createMatchFeedService({ database: p.a, competitionIds: [39], clock, providerOdds: true });
    assert.equal((await withPrices.query({ date, marketPick: 'total-goals:under-1.5', odds: '1.50-3.00' }, scope)).total, 0);
    assert.deepEqual(await readStoredFeedMarkets(p.a, [39], false), ['match-result:away-win', 'total-goals:under-1.5']);
    assert.deepEqual(await readStoredFeedMarkets(p.a, [39], true), []);
    assert.ok(matchFeedResponseSchema.parse(gateFeedResponse(live, free)).records[0].retrospective == null);
    const freeDetail = matchDetailResponseSchema.parse(gateDetailResponse(detailLive, free));
    assert.equal(freeDetail.fixture.retrospective, null);
    assert.equal(freeDetail.retrospectiveMarkets, undefined);
    for (const query of [`revision=${sourceRevisionId}`, `cycle=${cycleId}`]) {
      const history = await detail.query(fixtureId, new URLSearchParams(query));
      assert.equal(history.fixture.retrospective, undefined);
      assert.equal(history.retrospectiveMarkets, undefined);
      assert.equal(history.snapshot.revisionId, sourceRevisionId);
      assert.equal(history.snapshot.markets[0].market.selection, 'home-win');
    }
    assert.equal((await feed.query({ date })).records[0].retrospective, undefined, 'non-Matches consumers retain canonical reads');

    p.setTime(kickoffAt + 8_000_000);
    await applyResult('FT', 1, 0);
    await settlement.settleFixture(fixtureId);
    const finished = await data(), finishedDetail = await detail.query(fixtureId), performance = (await summary.query({ date }, scope)).performance;
    const unchanged = await feed.query({ date });
    assert.deepEqual(finished.performance, unchanged.performance);
    assert.deepEqual(performance, { cancelled: 0, ...unchanged.performance });
    assert.equal(finishedDetail.snapshot.outcomes[0].status, 'correct');
    assert.equal(finishedDetail.fixture.retrospective.pick.selection, 'away-win');
    assert.equal((await feed.query({ date, status: 'finished', result: 'won' }, scope)).records[0].fixtureId, fixtureId);
    assert.equal((await feed.query({ date, status: 'finished', result: 'lost' }, scope)).total, 0);
    assert.equal((await feed.query({ date, status: 'live' }, scope)).total, 0);
    assert.deepEqual(await readStoredFeedMarkets(p.a, [39], true), ['match-result:away-win', 'total-goals:under-1.5']);
    const capturedFeed = matchFeedResponseSchema.parse(gateFeedResponse(finished, free));
    const capturedDetail = matchDetailResponseSchema.parse(gateDetailResponse(finishedDetail, free));
    await savePageScenarios(t, 'MATCH_FEED_PAGE_CAPTURE', { 'november-replay': { query: parseFeedQuery({ date }, { today: date }),
      today: date, result: { data: capturedFeed, error: null } } });
    await savePageScenarios(t, 'MATCH_DETAIL_PAGE_CAPTURE', { 'november-replay': { data: capturedDetail, error: null } });

    // A stale projection with a nonmatching schedule is never presented, even with a valid integrity seal.
    await p.instance.executeAdmin(`UPDATE NovemberReplayProjection SET scheduleVersion=scheduleVersion+1 WHERE fixtureId='${fixtureId}'`);
    const uncached = createMatchFeedService({ database: p.a, competitionIds: [39], clock });
    assert.equal((await uncached.query({ date }, scope)).records[0].retrospective, undefined);
    assert.equal((await uncached.query({ date, marketPick: 'total-goals:under-1.5' }, scope)).total, 0);
    await p.instance.executeAdmin(`UPDATE NovemberReplayProjection SET revisionId=NULL,sourceRevisionId=NULL,cycleId=NULL,scheduleVersion=NULL,
      kickoffAt=NULL,evidenceCutoffAt=NULL,activationOperationId=NULL,integrity=NULL,body=NULL,changedAt=${sqlDate(p.now() + 1000)}
      WHERE fixtureId='${fixtureId}'`);
    p.setTime(p.now() + 2000);
    const restored = await data(), restoredDetail = await detail.query(fixtureId);
    assert.notEqual(restored.paginationVersion, finished.paginationVersion);
    assert.equal(restored.records[0].retrospective, undefined);
    assert.equal(restoredDetail.fixture.retrospective, undefined);
    assert.deepEqual(restoredDetail.snapshot, finishedDetail.snapshot);
    assert.deepEqual(restored.performance, finished.performance);
    assert.equal((await exact('total-goals:under-1.5')).total, 0);
    assert.deepEqual(await readStoredFeedMarkets(p.a, [39], false), [], 'unqualified legacy upstream picks do not enter exact filters');
    assert.equal(sameCardFixture(finished.records[0], restored.records[0]), false);
    assert.equal(mergeLiveDetail(gateDetailResponse(finishedDetail, free), gateDetailResponse(restoredDetail, free)).fixture.retrospective, null);

    const archiveDate = '2026-10-20';
    const selectedAt = Date.parse(`${archiveDate}T08:00:00Z`), publishedAt = selectedAt + 4000;
    const archiveIds = [41320, 41321, 41322, 41323];
    await p.cohort(archiveDate, p.first, { rows: archiveIds.map((id) => catalogFixture(id, {
      kickoff: new Date(publishedAt + 301_000).toISOString(),
    })), selectionAt: selectedAt, afterSelectionAt: publishedAt });
    const full65 = feedMarketPickId('goal:full-time:totals:total:6.5:binary', 'over');
    const half15 = feedMarketPickId('goal:half-time:totals:total:1.5:binary', 'over');
    assert.ok(full65 && half15);

    for (const [index, selectionId, probability] of [[0, full65, 0.875], [1, half15, 0.75], [2, full65, 0.625]]) {
      const archive = await p.setup(archiveIds[index], archiveDate, { publicationAt: publishedAt });
      const revision = await p.publisher.publish(archive.input, archive.lease);
      assert.equal(revision.refresh.outcome, 'published');
      await p.queue.acknowledge(archive.lease);
      const identity = feedMarketPickIdentity(selectionId);
      const { marketKey, selection, definition } = identity;
      const { id: archiveFixture } = archive.fixture, { id: archiveCycle } = archive.cycle, { id: revisionId } = revision.revision;
      const { period, label, code } = definition;
      const source = 'ai-score-distribution', ruleVersion = 'score-distribution-goals-v1';
      const body = JSON.stringify({ version: 1, revisionId, cycleId: archiveCycle, fixtureId: archiveFixture, key: marketKey,
        source, ruleVersion, period, selection, selectedProbability: probability, sortOrder: 0,
        extensionHash: resultHash(`exact-feed:${revisionId}`), label, code, sourceLabel: 'AI score distribution',
        probabilityBasis: 'model-event', selectionLabel: definition.selections.find(({ key }) => key === selection).label });
      await p.a.query((tx) => tx.$executeRaw`INSERT INTO ExtendedMarketPublishedPick
        (revisionId,cycleId,fixtureId,marketKey,source,ruleVersion,period,selection,selectedProbability,sortOrder,integrity,body)
        VALUES (${revisionId},${archiveCycle},${archiveFixture},${marketKey},${source},${ruleVersion},${period},${selection},
          ${probability},0,SHA2(CAST(JSON_EXTRACT(${body},'$') AS CHAR),256),JSON_EXTRACT(${body},'$'))`);
    }
    const archiveFeed = (filter) => uncached.query({ date: archiveDate, ...filter }, scope);
    const firstPage = await archiveFeed({ marketPick: full65, sort: 'probability', pageSize: '1' });
    const secondPage = await archiveFeed({ marketPick: full65, sort: 'probability', pageSize: '1', page: '2' });
    assert.equal(firstPage.total, 2);
    assert.equal(secondPage.total, 2);
    assert.equal(firstPage.records[0].filteredPrediction.probability, 0.875);
    assert.equal(secondPage.records[0].filteredPrediction.probability, 0.625);
    assert.equal((await archiveFeed({ marketPick: half15 })).records[0].filteredPrediction.probability, 0.75);
    assert.equal((await archiveFeed({ marketPick: 'total-goals:over-1.5' })).total, 0, 'similar full-time label stays a separate known identity');
    const archivedOptions = await readStoredFeedMarkets(p.a, [39], false);
    assert.ok(archivedOptions.includes(full65) && archivedOptions.includes(half15));
    assert.equal(archivedOptions.includes('total-goals:over-1.5'), false);
    assert.deepEqual(await readStoredFeedMarkets(p.a, [39], true), []);

    const provider = await p.setup(archiveIds[3], archiveDate, { publicationAt: publishedAt });
    const trial = fallbackFixture({ snapshot: provider.snapshot, model: modelVersion(), jobId: provider.lease.jobId });
    const expected = { ...trial.expected, pin: null };
    const qualified = resolveFallbackCandidate({ expected, ai: fallbackAiDenied(), provider: fallbackProvider(expected),
      now: trial.now, qualification: { verifyLocalNumericalBasis: () => false }, cascade: LOCAL_FIRST_FORECAST_CASCADE }, trial.authority);
    assert.equal(qualified.status, 'candidate');
    const refresh = createMysqlRefreshStore(p.a, p.queue);
    assert.equal(await refresh.start(provider.lease, 'fallback'), true);
    await refresh.complete(provider.lease, 'fallback', qualified);
    const trusted = await p.publisher.publish({ ...provider.input, candidate: qualified.candidate, generationCompletedAt: p.now() }, provider.lease);
    assert.equal(trusted.refresh.outcome, 'published');
    assert.equal(trusted.refresh.forecastDecision.markets.find(({ marketKey }) => marketKey === 'goal:full-time:result').confidence.status, 'provider-trusted');
    const trustedMatch = await uncached.query({ date: archiveDate, marketPick: 'match-result:home-win', prob: '50-50' }, scope);
    assert.equal(trustedMatch.total, 1);
    assert.equal(trustedMatch.records[0].fixtureId, provider.fixture.id);
    assert.equal(trustedMatch.records[0].filteredPrediction.source, 'api-football');
  }, { migrationTimeoutMs: 240_000 });
});
