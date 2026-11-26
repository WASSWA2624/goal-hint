import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import mariadb from 'mariadb';
import { localFirstGoalMarketDefinitions, registeredForecastGoalMarkets } from '../src/domain/goal-market-definitions.ts';
import { binaryFeaturedSettlement, localFeaturedDecisionVersion } from '../src/domain/local-featured-decision.ts';
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
import { createMatchFeedHandler } from '../src/server/matches/feed-http.ts';
import { createMatchFeedService } from '../src/server/matches/feed-service.ts';
import { readStoredFeedMarkets } from '../src/server/matches/feed-markets-read.ts';
import { feedSql } from '../src/server/matches/feed-read.ts';
import { createMatchFeedSummaryService } from '../src/server/matches/feed-summary-service.ts';
import { createMatchDetailService } from '../src/server/matches/detail-service.ts';
import { projectRetrospectiveForecast } from '../src/server/matches/retrospective-picks.ts';
import { createMysqlOddsStore } from '../src/server/odds/odds-mysql-store.ts';
import { createOddsImportService } from '../src/server/odds/odds-service.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { createMysqlRefreshStore } from '../src/server/refresh/refresh-mysql-store.ts';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { createMarketSettlementService } from '../src/server/settlement/settlement-service.ts';
import { catalogFixture } from './helpers/catalog-fixtures.mjs';
import { fallbackAiDenied, fallbackFixture, fallbackProvider } from './helpers/fallback-fixtures.mjs';
import { lifecycleAuthority, lifecyclePolicy, lifecycleInput } from './helpers/lifecycle-fixtures.mjs';
import { createSyntheticOddsAdapter, launchBetCatalog, ODDS_BOOKMAKER, oddsAuthority, oddsBounds, oddsPolicy,
  oddsRequest, offsetTime, rawOddsRow } from './helpers/odds-fixtures.mjs';
import { historyCandidate } from './helpers/prediction-history-fixtures.mjs';
import { modelVersion } from './helpers/predictor-fixtures.mjs';
import { resultHash } from './helpers/result-sync-fixtures.mjs';
import { savePageScenarios } from './helpers/page-capture.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

function utcSqlDateTime(value) {
  return new Date(value).toISOString().replace('T', ' ').replace('Z', '');
}
function sqlDate(value) {
  return `'${utcSqlDateTime(value)}'`;
}
function sqlArchive(value) {
  return `JSON_EXTRACT(CONVERT(X'${Buffer.from(encodeShadowArchive(value)).toString('hex')}' USING utf8mb4), '$')`;
}

async function seedFeedReplays(instance, reference, definition, fixtures) {
  await instance.assertOwnership();
  const database = await mariadb.createConnection({ host: '127.0.0.1', port: instance.port, database: instance.databaseName,
    user: 'root', timezone: '+00:00', sessionVariables: { time_zone: '+00:00' } });
  try {
    const { homeTeamId, awayTeamId, seasonId } = reference;
    const selected = { marketKey: definition.key, selection: 'away', probability: 0.8 };
    const markets = [{ definition, selected: { selection: selected.selection, probability: selected.probability },
      selections: definition.selections.map(({ key }) => ({ key, outcomes: binaryFeaturedSettlement(key === 'away' ? 0.8 : 0.1) })) }];
    const rows = fixtures.map(({ id, kickoff, status, staleTeams }, index) => {
      const evidenceCutoffAt = kickoff - 20 * 60_000, generatedAt = kickoff + 15 * 60_000, activatedAt = kickoff + 20 * 60_000;
      const revisionId = resultHash(`feed-replay-batch:${index}`);
      const body = encodeShadowArchive({ fixtureId: id, revisionId, sourceRevisionId: null, cycleId: null,
        kickoffAt: kickoff, scheduleVersion: null, evidenceCutoffAt, generatedAt, activatedAt, markets, selected,
        featuredDecision: { ...selected, version: localFeaturedDecisionVersion, status: 'forecast-only', reason: 'no-verified-odds' },
        decisionAt: kickoff - 10 * 60_000, teams: staleTeams ? [awayTeamId, homeTeamId] : [homeTeamId, awayTeamId] });
      return { id, revisionId, kickoffAt: utcSqlDateTime(kickoff), evidenceCutoffAt: utcSqlDateTime(evidenceCutoffAt),
        generatedAt: utcSqlDateTime(generatedAt), activatedAt: utcSqlDateTime(activatedAt), status, body };
    });
    await database.batch(`INSERT INTO FootballFixture
      (id,provider,externalId,homeTeamId,awayTeamId,seasonId,kickoff,eatDate,status,providerStatus,retrievedAt,updatedAt)
      VALUES (?,'api-football',?,?,?,?,?,DATE(?),?,?,?,?)`, rows.map((row, index) => [row.id, 51_000 + index, homeTeamId, awayTeamId, seasonId,
      row.kickoffAt, row.kickoffAt, row.status, row.status === 'live' ? '1H' : 'FT', row.activatedAt, row.activatedAt]));
    // The replay revision supplies the foreign key. The HTTP reader uses the compact projection.
    await database.batch(`INSERT INTO NovemberReplayRevision
      (id,fixtureId,kickoffAt,evidenceCutoffAt,evidenceHash,generatedAt,stagedAt,status,integrity,body)
      VALUES (?,?,?,?,?,?,?,'estimated',SHA2(CAST(JSON_EXTRACT(?,'$') AS CHAR CHARACTER SET utf8mb4),256),JSON_EXTRACT(?,'$'))`,
    rows.map((row) => [row.revisionId, row.id, row.kickoffAt, row.evidenceCutoffAt, resultHash(`evidence:${row.revisionId}`),
      row.generatedAt, row.activatedAt, row.body, row.body]));
    await database.batch(`INSERT INTO NovemberReplayProjection
      (fixtureId,revisionId,kickoffAt,evidenceCutoffAt,activationOperationId,changedAt,integrity,body)
      VALUES (?,?,?,?,'feed-replay-batch',?,SHA2(CAST(JSON_EXTRACT(?,'$') AS CHAR CHARACTER SET utf8mb4),256),JSON_EXTRACT(?,'$'))`,
    rows.map((row) => [row.id, row.revisionId, row.kickoffAt, row.evidenceCutoffAt, row.activatedAt, row.body, row.body]));
  } finally {
    await database.end();
  }
}

test('published Matches windows can reference replay projections in any date range', () => {
  const today = '2026-11-20';
  function hasReplay(date, zone, publishedForecasts = true) {
    const query = parseFeedQuery({ date, tz: zone, marketPick: 'match-result:away-win' }, { today });
    const range = resolveFeedDates(query, today);
    return feedSql(query, range, [39], false, null, false, false, null, publishedForecasts).pageJoins.sql.includes('NovemberReplayProjection');
  }
  assert.equal(hasReplay('2026-10-31', 'Africa/Kampala'), true);
  assert.equal(hasReplay('2026-10-31', 'UTC'), true);
  assert.equal(hasReplay('2026-11-01', 'Africa/Kampala'), true);
  assert.equal(hasReplay('2026-11-30', 'Africa/Kampala'), true);
  assert.equal(hasReplay('2026-12-01', 'Africa/Kampala'), true);
  assert.equal(hasReplay('2026-11-18', 'Africa/Kampala', false), false);
});

test('replay hydration starts at the requested projection keys in bounded batches', async () => {
  const ids = Array.from({ length: 101 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
  const statements = [];
  const tx = { $queryRaw: async (statement) => { statements.push(statement); return []; } };
  const projections = await readNovemberReplayProjections(tx, [...ids, ids[0]]);
  assert.equal(projections.size, 0);
  assert.deepEqual(statements.map(({ values }) => values), [ids.slice(0, 100), ids.slice(100)]);
  for (const { sql } of statements) {
    assert.match(sql, /SELECT STRAIGHT_JOIN p\.\*,TRUE AS validIntegrity\s+FROM NovemberReplayProjection p FORCE INDEX \(PRIMARY\)/u);
    assert.match(sql, /WHERE p\.fixtureId IN \([^)]*\) AND p\.revisionId IS NOT NULL/u);
    assert.match(sql, /p\.integrity=SHA2\(CAST\(p\.body AS CHAR CHARACTER SET utf8mb4\),256\)/u);
    assert.match(sql, /LEFT JOIN JSON_TABLE\(JSON_UNQUOTE\(JSON_EXTRACT\(p\.body,'\$\.canonicalBody'\)\)/u);
    assert.equal(sql.match(/JSON_EXTRACT\(p\.body,'\$\.canonicalBody'\)/gu)?.length, 1);
  }
});

test('November replay has one display across feed, exact outcome and detail while originals remain reproducible', { timeout: 480_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const date = '2026-11-18', providerId = 41310;
    const selectionAt = Date.parse(`${date}T08:00:00Z`), publicationAt = selectionAt + 4000, kickoffAt = publicationAt + 301_000;
    const actualStartedAt = kickoffAt - 5000;
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
    const clock = { now: () => p.now() };
    const { adapter, state: oddsState } = createSyntheticOddsAdapter(clock);
    const policy = oddsPolicy();
    const oddsImporter = createOddsImportService({ adapter: adapter.odds, store: createMysqlOddsStore(p.a),
      authority: oddsAuthority({ publicDisplay: true }, policy), accountId: () => accountId,
      bounds: () => oddsBounds(p.now()), clock });
    const oddsRow = (bets, update = null) => rawOddsRow(providerId, kickoffAt, { bets, update });
    const bet = (id, name, values) => ({ id, name, values: Object.entries(values).map(([value, odd]) => ({ value, odd })) });
    const homeBet = (values) => bet(16, 'Total - Home', values);
    const awayBet = (values) => bet(17, 'Total - Away', values);
    const importPrices = async (raw, recovery = false) => {
      oddsState.rows = [raw];
      const request = oddsRequest('prices', p.now(), { date, policy, id: resultHash(`replay-odds:${p.now()}`) });
      const imported = recovery ? await oddsImporter.importHistoricalDate({ ...request, recovery }) : await oddsImporter.importDate(request);
      assert.equal(imported.status, 'complete');
      assert.equal(imported.outcomes[recovery ? 'recover' : 'apply'], 1);
    };
    const capturedAt = kickoffAt - 60_000;
    p.setTime(capturedAt - 1000);
    oddsState.bets = [...launchBetCatalog(), { id: 16, name: 'Total - Home' }, { id: 17, name: 'Total - Away' },
      { id: 6, name: 'Goals Over/Under First Half' }];
    assert.equal((await oddsImporter.importCatalog(oddsRequest('bets', p.now(), { policy }))).status, 'complete');
    p.setTime(capturedAt);
    await importPrices(oddsRow([
      bet(1, 'Match Winner', { Away: '3.90' }), bet(5, 'Goals Over/Under', { 'Under 5.5': '7.20' }),
      bet(6, 'Goals Over/Under First Half', { 'Under 5.5': '7.40' }),
      homeBet({ 'Under 5.5': '1.17', 'Over 5.5': '8.80' }), awayBet({ 'Under 4.5': '9.20', 'Over 5.5': '9.30' }),
    ]));
    // The delayed status arrives below. Odds may already have captured an apparent pre-match row after actual start.
    p.setTime(actualStartedAt + 1000);
    await importPrices(oddsRow([homeBet({ 'Under 5.5': '2.31' })]));
    const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
    const resultStore = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
    const settlement = createMarketSettlementService({ database: p.a, queue: p.queue });
    const applyResult = async (status, home, away) => {
      const observation = parseLifecycleInput(lifecycleInput(state, p.now(), { status, actualStartedAt,
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
    const lifecycleState = await p.a.query((tx) => tx.fixtureLifecycleState.findUnique({ where: { fixtureId } }));
    assert.equal(lifecycleState.actualStartedAt.getTime(), actualStartedAt);
    assert.equal(lifecycleState.issue, null);
    const cache = createMysqlPublicResponseCache(p.a, clock.now);
    const feed = createMatchFeedService({ database: p.a, competitionIds: [39], clock, cache, providerOdds: false });
    const detail = createMatchDetailService({ database: p.a, clock, cache, providerOdds: false });
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
    const homeGoals = definitions.find(({ key }) => key === 'goal:full-time:totals:home:5.5:binary');
    const awayGoals = definitions.find(({ key }) => key === 'goal:full-time:totals:away:5.5:binary');
    const result = definitions.find(({ key }) => key === 'goal:full-time:result');
    assert.ok(goals && homeGoals && awayGoals && result);
    const homeUnder = feedMarketPickId(homeGoals.key, 'under'), awayUnder = feedMarketPickId(awayGoals.key, 'under');
    const publishedMarkets = [homeUnder, awayUnder, 'match-result:away-win', 'total-goals:under-1.5'].sort();
    const probability = 0.8365637684146764;
    const selected = { marketKey: result.key, selection: 'away', probability };
    const projection = { fixtureId, revisionId, sourceRevisionId, cycleId, scheduleVersion: locked.scheduleVersion, kickoffAt,
      evidenceCutoffAt, generatedAt, activatedAt, selected, markets: [
        { definition: result, selected: { selection: selected.selection, probability } },
        { definition: goals, selected: { selection: 'under', probability: 0.71 } },
        { definition: homeGoals, selected: { selection: 'under', probability: 0.79 } },
        { definition: awayGoals, selected: { selection: 'under', probability: 0.77 } },
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
    assert.deepEqual(await readStoredFeedMarkets(p.a, [39], false), publishedMarkets);
    assert.deepEqual(await readStoredFeedMarkets(p.a, [39], true), []);
    assert.ok(matchFeedResponseSchema.parse(gateFeedResponse(live, free)).records[0].retrospective == null);
    const freeDetail = matchDetailResponseSchema.parse(gateDetailResponse(detailLive, free));
    assert.equal(freeDetail.fixture.retrospective, null);
    assert.equal(freeDetail.retrospectiveMarkets, undefined);
    const pricedDetail = createMatchDetailService({ database: p.a, clock, cache, providerOdds: true, allowLiveMatch: false });
    const pricedFeed = () => withPrices.query({ date }, scope);
    const pricedExact = async (marketPick) => (await withPrices.query({ date, marketPick }, scope)).records[0].retrospective.pick;
    const quote = (observedAt, providerUpdatedAt) => ({ bookmakerId: ODDS_BOOKMAKER, bookmakerName: 'Synthetic bookmaker', observedAt, providerUpdatedAt });
    const shownCapture = (await pricedFeed()).records[0].retrospective.pick;
    assert.ok(capturedAt > evidenceCutoffAt, 'a historic reference quote can postdate the forecast cutoff');
    assert.equal(shownCapture.odds, '3.9');
    assert.deepEqual(shownCapture.historicalOdds, quote(capturedAt, null));
    assert.equal((await pricedExact(homeUnder)).odds, '1.17', 'a later capture before scheduled kickoff came after verified actual start');
    assert.equal((await pricedExact(awayUnder)).odds, null, 'wrong team, direction, and line cannot supply a price');

    const providerUpdatedAt = kickoffAt - 10_000, recoveredAt = p.now() + 1000;
    p.setTime(recoveredAt);
    await importPrices(oddsRow([homeBet({ 'Under 5.5': '1.42' })], offsetTime(providerUpdatedAt)), true);
    for (const [update, price] of [[null, '4.20'], [actualStartedAt, '5.70'], [actualStartedAt + 1000, '5.80'],
      [kickoffAt, '5.90'], [kickoffAt + 1000, '6.50']]) {
      p.setTime(p.now() + 1000);
      await importPrices(oddsRow([homeBet({ 'Under 5.5': price }), awayBet({ 'Under 5.5': price })],
        update === null ? null : offsetTime(update)), true);
    }
    const homeReplay = await pricedExact(homeUnder), pricedLive = await pricedDetail.query(fixtureId);
    assert.equal(homeReplay.odds, '1.42', 'later unverified recovery cannot mask a valid recovered quote');
    assert.deepEqual(homeReplay.historicalOdds, quote(recoveredAt, providerUpdatedAt));
    assert.deepEqual(pricedLive.retrospectiveMarkets.find(({ key }) => key === homeGoals.key), homeReplay);
    assert.equal(pricedLive.retrospectiveMarkets.find(({ key }) => key === awayGoals.key).odds, null);
    assert.deepEqual(pricedLive.fixture.retrospective.pick, shownCapture);
    p.setTime(p.now() + 1000);
    await importPrices(oddsRow([awayBet({ 'Under 5.5': '1.52' })], offsetTime(providerUpdatedAt)), true);
    const awayReplay = await pricedExact(awayUnder);
    assert.equal(awayReplay.odds, '1.52');
    assert.deepEqual(awayReplay.historicalOdds, quote(p.now(), providerUpdatedAt));
    assert.deepEqual((await pricedDetail.query(fixtureId)).retrospectiveMarkets.find(({ key }) => key === awayGoals.key), awayReplay);
    assert.equal((await exact(homeUnder)).records[0].retrospective.pick.odds, null, 'disabled odds rights withhold prices');
    assert.equal(gateFeedResponse(await pricedFeed(), free).records[0].retrospective, null);
    assert.equal(gateDetailResponse(pricedLive, free).retrospectiveMarkets, undefined);
    for (const query of [`revision=${sourceRevisionId}`, `cycle=${cycleId}`]) {
      const history = await pricedDetail.query(fixtureId, new URLSearchParams(query));
      assert.equal(history.fixture.retrospective, undefined);
      assert.equal(history.retrospectiveMarkets, undefined);
      assert.equal(history.snapshot.revisionId, sourceRevisionId);
      assert.equal(history.snapshot.markets[0].market.selection, 'home-win');
      assert.deepEqual(history.fixture.prices, originalLive.records[0].prices);
    }
    assert.equal((await feed.query({ date })).records[0].retrospective, undefined, 'non-Matches consumers retain canonical reads');

    p.setTime(kickoffAt + 8_000_000);
    await applyResult('FT', 1, 0);
    await settlement.settleFixture(fixtureId);
    const finished = await data(), finishedDetail = await detail.query(fixtureId), performance = (await summary.query({ date }, scope)).performance;
    const unchanged = await feed.query({ date });
    assert.equal(unchanged.performance.won, 1, 'canonical archive performance keeps its own selection');
    assert.equal(finished.performance.won, 0);
    assert.equal(finished.performance.lost, 1, 'public performance settles the displayed replay selection');
    assert.deepEqual(performance, { cancelled: 0, ...finished.performance });
    assert.equal(finishedDetail.snapshot.outcomes[0].status, 'correct');
    assert.equal(finishedDetail.fixture.retrospective.pick.selection, 'away-win');
    assert.equal((await feed.query({ date, status: 'finished', result: 'lost' }, scope)).records[0].fixtureId, fixtureId);
    assert.equal((await feed.query({ date, status: 'finished', result: 'won' }, scope)).total, 0);
    const under15 = { date, status: 'finished', marketPick: 'total-goals:under-1.5' };
    assert.equal((await feed.query({ ...under15, result: 'won' }, scope)).records[0].fixtureId, fixtureId);
    assert.equal((await feed.query({ ...under15, result: 'lost' }, scope)).total, 0);
    assert.equal((await summary.query(under15, scope)).performance.won, 1);
    assert.equal((await feed.query({ date, status: 'live' }, scope)).total, 0);
    assert.deepEqual(await readStoredFeedMarkets(p.a, [39], true), publishedMarkets);
    const settledCapture = { ...shownCapture, settlementStatus: 'incorrect' };
    assert.deepEqual(gateFeedResponse(await pricedFeed(), free).records[0].retrospective.pick, settledCapture);
    assert.deepEqual(gateDetailResponse(await pricedDetail.query(fixtureId), free).fixture.retrospective.pick, settledCapture);
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
    assert.equal((await pricedFeed()).records[0].retrospective, undefined);
    assert.equal((await pricedDetail.query(fixtureId)).retrospectiveMarkets, undefined);
    assert.deepEqual(restoredDetail.snapshot, finishedDetail.snapshot);
    assert.deepEqual(restored.performance, unchanged.performance, 'rollback restores the active original performance scope');
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

    await t.test('bare 30-day and one-day HTTP lists keep exact replay-only membership across pages', async () => {
      p.setTime(Date.parse('2026-11-19T12:00:00Z'));
      const list = createMatchFeedService({ database: p.a, competitionIds: [39], clock, providerOdds: false, includePerformance: false });
      const handler = createMatchFeedHandler((parameters, context) => list.query(parameters, {
        ...context, publishedForecasts: true, predictedMatchesOnly: true,
      }), clock, async () => free);
      const read = async (search = '') => {
        const response = await handler(new Request(`https://example.test/api/matches${search}`));
        const body = await response.json();
        assert.equal(response.status, 200, JSON.stringify(body.error));
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
        assert.equal(response.headers.get('vary'), 'Cookie');
        return matchFeedResponseSchema.parse(body);
      };
      const before = await read();
      assert.equal(before.total, before.records.length);
      const history = Array.from({ length: 105 }, (_, index) => ({ id: randomUUID(),
        kickoff: Date.parse('2026-11-17T08:00:00Z') + index * 60_000, status: 'finished-regulation' }));
      const today = [{ id: randomUUID(), kickoff: Date.parse('2026-11-19T08:00:00Z'), status: 'finished-regulation' },
        { id: randomUUID(), kickoff: Date.parse('2026-11-19T10:00:00Z'), status: 'live' }];
      const excluded = [{ ...history[0], id: randomUUID(), staleTeams: true },
        { ...history[0], id: randomUUID(), kickoff: Date.parse('2026-10-20T08:00:00Z') }];
      const reference = await p.a.query((tx) => tx.footballFixture.findUniqueOrThrow({ where: { id: fixtureId } }));
      await seedFeedReplays(p.instance, reference, result, [...history, ...today, ...excluded]);
      const first = await read(), day = await read('?when=today');
      assert.deepEqual([first.range.from, first.range.to], ['2026-10-21', '2026-11-19']);
      assert.deepEqual([day.range.from, day.range.to], ['2026-11-19', '2026-11-19']);
      assert.equal(first.total, before.total + history.length + today.length);
      assert.equal(first.pageSize, 50);
      assert.equal(first.records.length, 50);
      assert.equal(first.nextPage, 2);
      assert.equal(first.performance, null);
      assert.equal(day.total, today.length);
      assert.deepEqual(day.records.map(({ fixtureId }) => fixtureId), [today[1].id, today[0].id]);
      assert.equal(day.records[0].retrospective, null, 'the guest cannot see a live replay pick');
      assert.equal(day.records[1].retrospective.pick.selection, 'away-win');

      const second = await read(new URL(first.links.next, 'https://example.test').search);
      const third = await read(new URL(second.links.next, 'https://example.test').search);
      const records = [...first.records, ...second.records, ...third.records];
      assert.equal(second.total, first.total);
      assert.equal(third.total, first.total);
      assert.equal(third.links.next, null);
      assert.equal(records.length, first.total);
      assert.deepEqual(new Set(records.map(({ fixtureId }) => fixtureId)),
        new Set([...before.records.map(({ fixtureId }) => fixtureId), ...history.map(({ id }) => id), ...today.map(({ id }) => id)]));
      assert.equal(third.records.find(({ fixtureId }) => fixtureId === history[0].id)?.retrospective?.pick.selection, 'away-win');
    });
  }, { migrationTimeoutMs: 300_000 });
});
