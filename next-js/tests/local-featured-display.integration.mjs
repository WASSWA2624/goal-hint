import assert from 'node:assert/strict';
import test from 'node:test';
import { getReportingDate } from '../src/domain/calendar.ts';
import { bestSlipPublicationHour } from '../src/domain/best-slip-publication-hour.ts';
import { LOCAL_FIRST_GOAL_EVALUATION_PROFILE, localFirstGoalMarketDefinitions } from '../src/domain/goal-market-definitions.ts';
import { currentFeaturedOutcome, featuredFamily } from '../src/domain/match-details.ts';
import { matchDetailResponseSchema } from '../src/domain/match-detail.ts';
import { matchFeedResponseSchema } from '../src/domain/match-feed.ts';
import { marketRules, validateMarketSnapshot } from '../src/domain/markets.ts';
import { gateDetailResponse, gateFeedResponse } from '../src/domain/paywall.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { LOCAL_FIRST_FORECAST_CASCADE } from '../src/server/fallback/fallback-contract.ts';
import { goalProbabilities } from '../src/server/intelligence/local-goals-model.ts';
import { createMatchDetailService } from '../src/server/matches/detail-service.ts';
import { createMatchFeedService } from '../src/server/matches/feed-service.ts';
import { readFrozenLocalFeaturedPicks } from '../src/server/matches/frozen-featured-picks.ts';
import { createMysqlOddsStore } from '../src/server/odds/odds-mysql-store.ts';
import { createOddsImportService } from '../src/server/odds/odds-service.ts';
import { createSlipOddsRefreshCandidates } from '../src/server/odds/slip-odds-refresh-candidates.ts';
import { createCutoffLockingService } from '../src/server/predictions/cutoff-service.ts';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { createRevisionPublicationService } from '../src/server/predictions/publication-service.ts';
import { createMysqlRefreshStore } from '../src/server/refresh/refresh-mysql-store.ts';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { cutoffAuthority, cutoffPolicy } from './helpers/cutoff-fixtures.mjs';
import { lifecycleAuthority, lifecycleInput, lifecyclePolicy } from './helpers/lifecycle-fixtures.mjs';
import { createSyntheticOddsAdapter, launchBetCatalog, oddsAuthority, oddsBounds, oddsHash, oddsPolicy, oddsRequest, rawOddsRow } from './helpers/odds-fixtures.mjs';
import { publicationAuthority, publicationPolicy } from './helpers/publication-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

async function publishLocalForecast(p, target) {
  const rates = { home: 1.4, away: 1.1 }, base = target.input.candidate;
  const probabilities = goalProbabilities(rates.home, rates.away);
  const resolved = validateMarketSnapshot({
    'match-result': { source: 'local-engine', period: marketRules.period, probabilities: probabilities['match-result'] },
    'total-goals': { source: 'local-engine', period: marketRules.period, line: marketRules.totalGoalsLine, probabilities: probabilities['total-goals'] },
    'both-teams-to-score': { source: 'local-engine', period: marketRules.period, probabilities: probabilities['both-teams-to-score'] },
  });
  const at = target.snapshot.context.analysisAt + 1000;
  const provenance = { kind: 'local-engine', modelVersion: 'synthetic-featured-local-model', historyHash: oddsHash('featured-model-history'),
    evidenceHash: target.snapshot.hash, rates, sample: { matches: 200, homeEffectiveMatches: 20, awayEffectiveMatches: 24 },
    numericalBasis: 'qualified-local-model' };
  const entries = Object.entries(resolved.markets);
  const transitions = Object.fromEntries(entries.map(([family]) => [family,
    { selected: 'local-engine', ai: 'not-requested', local: 'candidate', provider: 'not-requested' }]));
  const candidate = { ...base, context: { ...base.context, pin: null },
    markets: Object.fromEntries(entries.map(([family, market]) => [family, market.available ? { ...market, provenance,
      fallback: null, timestamps: { generatedAt: at, retrievedAt: at, providerUpdatedAt: null }, flags: ['unknown-provider-update-time'],
    } : market])), issues: resolved.issues,
    audit: { aiStatus: 'denied', aiReason: 'unconfigured', providerStatus: 'not-requested', providerReason: null,
      sourceCascade: LOCAL_FIRST_FORECAST_CASCADE, localStatus: 'candidate', transitions } };
  const refresh = createMysqlRefreshStore(p.a, p.queue);
  assert.equal(await refresh.start(target.lease, 'fallback'), true);
  await refresh.complete(target.lease, 'fallback', { status: 'candidate', candidate });
  const staged = await refresh.stage(target.lease.jobId, 'fallback', 'completed');
  const policy = publicationPolicy();
  const goalExtension = { evaluationProfile: LOCAL_FIRST_GOAL_EVALUATION_PROFILE, localPoisson: rates, definitions: localFirstGoalMarketDefinitions };
  const publisher = createRevisionPublicationService({ database: p.a, queue: p.queue,
    policy: publicationPolicy({ sources: { ...policy.sources, 'local-engine': policy.sources.ai } }),
    authority: publicationAuthority({ verifyGoalExtension: (value) => evidenceFingerprint(value.goalExtension) === evidenceFingerprint(goalExtension) }) });
  return publisher.publish({ ...target.input, candidate, generationCompletedAt: staged.at, goalExtension }, target.lease);
}

test('Matches and Match Details preserve one exact Local Engine featured quote and settle its locked selection', { timeout: 480_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const providerId = 3005, target = await p.setup(providerId);
    const published = await publishLocalForecast(p, target);
    assert.equal(published.refresh.outcome, 'published');
    await p.queue.acknowledge(target.lease);
    const canceledTarget = await p.setup(3006);
    const canceledForecast = await publishLocalForecast(p, canceledTarget);
    assert.equal(canceledForecast.refresh.outcome, 'published');
    await p.queue.acknowledge(canceledTarget.lease);
    const { fixture: { id }, cycle: { kickoffAt } } = target, date = getReportingDate(kickoffAt);
    const accountId = oddsHash('local-featured-display');
    await p.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
    const clock = { now: p.now }, policy = oddsPolicy({ bookmakerScope: 'all' });
    const { adapter, state } = createSyntheticOddsAdapter(clock);
    state.bets = [...launchBetCatalog(), { id: 16, name: 'Total - Home' }, { id: 17, name: 'Total - Away' }];
    const importer = createOddsImportService({ adapter: adapter.odds, store: createMysqlOddsStore(p.a), clock, accountId: () => accountId,
      authority: oddsAuthority({ publicDisplay: true }, policy), bounds: () => oddsBounds(p.now()) });
    assert.equal((await importer.importCatalog(oddsRequest('bets', p.now(), { policy }))).status, 'complete');
    const book = (bookmakerId, bookmakerName, id, name, value, odd) =>
      rawOddsRow(providerId, kickoffAt, { bookmakerId, bookmakerName, bets: [{ id, name, values: [{ value, odd }] }] }).bookmakers[0];
    async function store(bookmakers) {
      p.setTime(p.now() + 1000);
      state.rows = [{ ...rawOddsRow(providerId, kickoffAt), bookmakers }];
      const result = await importer.importDate(oddsRequest('prices', p.now(), { date, policy }));
      assert.equal(result.outcomes.apply, 1);
      return p.now();
    }
    const preferredBooks = [
      book(8, 'Primary synthetic book', 16, 'Total - Home', 'Under 4.5', '1.15'),
      book(6, 'Other synthetic book', 16, 'Total - Home', 'Under 4.5', '1.1543'),
      book(7, 'Different side synthetic book', 17, 'Total - Away', 'Under 0.5', '7.00'),
    ];
    const { hourAt: publicationSlot } = bestSlipPublicationHour(kickoffAt - 3_600_000);
    p.setTime(publicationSlot - 300_000);
    const candidates = createSlipOddsRefreshCandidates({ database: p.a, competitionIds: [39], policy, now: p.now });
    assert.deepEqual(await candidates(publicationSlot + 86_400_000, 12), []);
    assert.deepEqual((await candidates(publicationSlot, 12)).map(({ fixtureId }) => fixtureId).sort(), [3005, 3006]);
    const empty = await importer.importFixture({ ...oddsRequest('prices', publicationSlot,
      { date, policy, id: oddsHash('empty-targeted-featured-odds') }), fixtureId: 3006 });
    assert.equal(empty.status, 'complete');
    assert.deepEqual(await candidates(publicationSlot, 1), [{ fixtureId: providerId, date }]);
    assert.deepEqual(await candidates(publicationSlot, 12), [{ fixtureId: providerId, date }, { fixtureId: 3006, date }]);
    const observedAt = await store(preferredBooks);
    assert.deepEqual(await candidates(publicationSlot, 12), [{ fixtureId: 3006, date }]);
    const readFeed = (providerOdds = true, database = p.a, filters = {}) => createMatchFeedService({ database, competitionIds: [39], clock, providerOdds })
      .query({ date, ...filters }, { publishedForecasts: true });
    const readDetail = (providerOdds = true, database = p.a, parameters) => createMatchDetailService({ database, clock, providerOdds }).query(id, parameters);
    const record = (feed) => feed.records.find(({ fixtureId }) => fixtureId === id);
    const [feed, detail] = await Promise.all([readFeed(), readDetail()]);
    const pick = record(feed).featuredPrediction;
    assert.deepEqual([pick.key, pick.selection, pick.odds], ['goal:full-time:totals:home:4.5:binary', 'under', '1.1543']);
    assert.equal(pick.tier, 'standard');
    assert.deepEqual(pick.featuredQuote, { bookmakerId: 6, bookmakerName: 'Other synthetic book', betId: 16, betName: 'Total - Home',
      providerSelection: 'Under 4.5', decimal: '1.1543', observedAt, checkedAt: observedAt, providerUpdatedAt: null });
    assert.deepEqual(pick, detail.fixture.featuredPrediction);
    const full = { tier: 'full', signedIn: true }, free = { tier: 'free', signedIn: false };
    assert.deepEqual(currentFeaturedOutcome(matchDetailResponseSchema.parse(gateDetailResponse(detail, full))), pick);
    assert.equal(record(matchFeedResponseSchema.parse(gateFeedResponse(feed, free))).featuredPrediction, null);
    assert.equal(matchDetailResponseSchema.parse(gateDetailResponse(detail, free)).fixture.featuredPrediction, null);
    const noRights = record(await readFeed(false)).featuredPrediction;
    assert.equal(noRights.tier, 'forecast-only');
    assert.equal(noRights.forecastOnlyReason, 'odds-not-permitted');
    assert.equal(noRights.odds, null);
    assert.deepEqual((await readDetail(false)).fixture.featuredPrediction, noRights);
    const unavailableQuotes = { query: p.a.query, transaction(operation, options) {
      if (options?.timeout === 5000) return Promise.reject(new Error('Synthetic current quotes timeout'));
      return p.a.transaction(operation, options);
    } };
    const noQuotes = record(await readFeed(true, unavailableQuotes)).featuredPrediction;
    assert.equal(noQuotes.tier, 'forecast-only');
    assert.equal(noQuotes.forecastOnlyReason, 'no-verified-odds');
    assert.deepEqual((await readDetail(true, unavailableQuotes)).fixture.featuredPrediction, noQuotes);

    const newRungAt = await store([book(7, 'Synthetic away book', 17, 'Total - Away', 'Under 1.5', '1.6001')]);
    const [lowerRungFeed, lowerRungDetail] = await Promise.all([readFeed(), readDetail()]);
    const lowerRung = record(lowerRungFeed).featuredPrediction;
    assert.deepEqual([lowerRung.key, lowerRung.selection, lowerRung.odds], ['goal:full-time:totals:away:1.5:binary', 'under', '1.6001']);
    assert.ok(lowerRung.probability >= 0.65 && lowerRung.probability < 0.70);
    assert.equal(lowerRung.featuredQuote.checkedAt, newRungAt);
    assert.deepEqual(currentFeaturedOutcome(gateDetailResponse(lowerRungDetail, full)), lowerRung);

    await store([book(8, 'Primary synthetic book', 16, 'Total - Home', 'Under 4.5', '1.0999')]);
    const [fallbackFeed, fallbackDetail] = await Promise.all([readFeed(), readDetail()]);
    const fallback = record(fallbackFeed).featuredPrediction;
    assert.equal(fallback.tier, 'priced-fallback');
    assert.equal(fallback.odds, '1.0999');
    const displayed = matchDetailResponseSchema.parse(gateDetailResponse(fallbackDetail, full));
    assert.deepEqual(currentFeaturedOutcome(displayed), fallback);
    assert.equal(displayed.snapshot.revisionId, published.revision.id);
    assert.ok(displayed.extendedMarkets.markets.some(({ key }) => key === pick.key));

    const { cutoffAt } = target.cycle;
    p.setTime(cutoffAt - 10_000);
    const frozenQuoteAt = await store([
      book(8, 'Primary synthetic book', 16, 'Total - Home', 'Under 4.5', '1.1501'),
      book(6, 'Other synthetic book', 16, 'Total - Home', 'Under 4.5', '1.1546'),
    ]);
    p.setTime(cutoffAt - 1000);
    const atCutoffQuote = await store([book(8, 'At-lock synthetic book', 16, 'Total - Home', 'Under 4.5', '1.4044')]);
    assert.equal(atCutoffQuote, cutoffAt);
    const cutoff = createCutoffLockingService({ database: p.a, queue: p.queue, policy: cutoffPolicy(), authority: cutoffAuthority(),
      featuredPicks: { extendedMarkets: true, oddsPermitted: () => true } });
    const closed = await cutoff.close(p.target(target));
    assert.equal(closed.operation.effectiveCloseAt, cutoffAt);
    const sealed = () => p.a.query((tx) => readFrozenLocalFeaturedPicks(tx, [id])).then((result) => result.get(id));
    const decision = await sealed();
    assert.equal(decision.quote.observedAt, frozenQuoteAt);
    assert.equal(decision.quote.checkedAt, frozenQuoteAt);
    assert.equal(decision.quote.decimal, '1.1546');
    assert.ok(decision.quote.snapshotId && decision.quote.receiptId);
    const [lockedFeed, lockedDetail] = await Promise.all([readFeed(), readDetail()]);
    assert.equal(lockedDetail.snapshot.applicability, 'locked');
    const locked = record(lockedFeed).featuredPrediction;
    assert.equal(record(lockedFeed).featuredDecisionFrozen, true);
    assert.equal(lockedDetail.fixture.featuredDecisionFrozen, true);
    assert.equal(locked.odds, '1.1546');
    assert.deepEqual(currentFeaturedOutcome(gateDetailResponse(lockedDetail, full)), locked);
    const lockedWithoutOdds = record(await readFeed(false)).featuredPrediction;
    assert.equal(lockedWithoutOdds.key, locked.key);
    assert.equal(lockedWithoutOdds.forecastOnlyReason, 'odds-not-permitted');
    assert.equal(lockedWithoutOdds.featuredQuote, undefined);
    assert.deepEqual((await readDetail(false)).fixture.featuredPrediction, lockedWithoutOdds);
    await store([book(8, 'After-lock synthetic book', 16, 'Total - Home', 'Under 4.5', '1.5099')]);
    assert.deepEqual(await cutoff.close(p.target(target)), closed);
    assert.deepEqual(await sealed(), decision);

    const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
    const resultStore = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
    await cutoff.close(p.target(canceledTarget));
    await lifecycle.observe(lifecycleInput(canceledTarget, p.now(), { status: 'CANC', actualStartedAt: null }));
    const canceledCard = (await readFeed()).records.find(({ fixtureId }) => fixtureId === canceledTarget.fixture.id);
    const canceledDetail = await createMatchDetailService({ database: p.a, clock, providerOdds: true }).query(canceledTarget.fixture.id);
    assert.deepEqual([canceledCard.status, canceledCard.featuredDecisionFrozen, canceledCard.featuredPrediction.settlementStatus], ['canceled', true, 'void']);
    assert.deepEqual(canceledCard.featuredPrediction, canceledDetail.fixture.featuredPrediction);
    for (const [status, expected, elapsed] of [['1H', 'live', 30_000], ['FT', 'finished-regulation', 7_200_000]]) {
      p.setTime(kickoffAt + elapsed);
      const raw = { goals: { home: 5, away: 0 }, ...(status === 'FT' ? { score: { fulltime: { home: 5, away: 0 } } } : {}) };
      const observation = parseLifecycleInput(lifecycleInput(target, p.now(), { status, actualStartedAt: kickoffAt, raw }));
      const lease = await resultStore.acquire(oddsHash(`featured-display-owner:${status}`), 30_000);
      assert.ok(lease);
      const batch = { id: oddsHash(`featured-display-result:${status}`), accountId, policyHash: oddsHash('featured-display-results'),
        receivedAt: p.now(), channel: 'ids', date: null, requestedIds: [providerId], observations: [observation], error: null, requestsDispatched: 1 };
      try { await resultStore.save(lease, batch); await resultStore.apply(lease, batch); } finally { await resultStore.release(lease); }
      const [pastFeed, pastDetail] = await Promise.all([readFeed(), readDetail()]);
      assert.equal(record(pastFeed).status, expected);
      assert.equal(record(pastFeed).featuredDecisionFrozen, true);
      const expectedPick = status === 'FT' ? { ...locked, settlementStatus: 'incorrect' } : locked;
      assert.deepEqual(record(pastFeed).featuredPrediction, expectedPick);
      assert.deepEqual(currentFeaturedOutcome(gateDetailResponse(pastDetail, full)), expectedPick);
      assert.equal(featuredFamily(gateDetailResponse(pastDetail, full)), 'total-goals');
      assert.equal(pastDetail.snapshot.revisionId, published.revision.id);
      assert.ok(pastDetail.extendedMarkets.markets.some(({ key }) => key === pick.key));
    }
    const [wins, losses] = await Promise.all([readFeed(true, p.a, { result: 'won' }), readFeed(true, p.a, { result: 'lost' })]);
    assert.equal(record(wins), undefined);
    assert.equal(record(losses).featuredPrediction.settlementStatus, 'incorrect');
    assert.equal(losses.total, 1);
    assert.equal(wins.total, 0);
    const explicit = await readDetail(true, p.a, new URLSearchParams({ revision: published.revision.id }));
    assert.equal(explicit.fixture.featuredPrediction, undefined);
    assert.equal(explicit.snapshot.revisionId, published.revision.id);
    const matchResult = displayed.snapshot.markets.find(({ market }) => market.family === 'match-result').market;
    const named = await readFeed(true, p.a, { marketPick: `match-result:${matchResult.selection}` });
    assert.equal(record(named).featuredPrediction, undefined);
    assert.equal(record(named).filteredPrediction.selection, matchResult.selection);
  }, { migrationTimeoutMs: 300_000 });
});
