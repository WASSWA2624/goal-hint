import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { publicPolicy } from '../src/domain/public-policy.ts';
import { parseFixtureSnapshot } from '../src/domain/fixture-snapshot.ts';
import { bestCardFamily } from '../src/domain/feed-presentation.ts';
import { probabilityEntry, selectedCardPrediction } from '../src/domain/match-card.ts';
import { featuredFamily, marketRow } from '../src/domain/match-details.ts';
import { publicRecommendation } from '../src/domain/recommendation-view.ts';
import { buildSlips, defaultSlipCriteria } from '../src/domain/slip-builder.ts';
import { parseResolvedForecastCandidate } from '../src/server/fallback/fallback-input.ts';
import { parseAppendRevision } from '../src/server/predictions/history-input.ts';
import { recommendationQuotesFromSnapshots, createRecommendationQuoteLoader } from '../src/server/odds/recommendation-quotes.ts';
import { oddsValuesHash } from '../src/server/odds/odds-mysql-store.ts';
import { cardFixture } from './helpers/match-card-fixtures.mjs';
import { evidenceContext, evidenceHash } from './helpers/evidence-fixtures.mjs';
import { predictorSnapshot } from './helpers/predictor-output-fixtures.mjs';
import { historyCandidate, revisionInput } from './helpers/prediction-history-fixtures.mjs';
import { candidateRecommendation } from './helpers/recommendation-fixtures.mjs';
import { evidenceFingerprint, evidenceSerialize } from '../src/server/evidence/evidence-input.ts';
import { validatePublishedRecommendation } from '../src/server/predictions/recommendation-publication.ts';
import { recommendationPolicy } from '../src/domain/recommendation.ts';

function card() {
  const fixture = cardFixture({ status: 'scheduled', score: null }, 'ai', null);
  fixture.forecast.recommendation = { status: 'selected', selected: { family: 'double-chance', selection: 'home-or-away',
    probability: 0.72, source: 'ai', period: publicPolicy.matchPeriod, line: null } };
  return parseFixtureSnapshot(fixture);
}

test('cards and detail use the immutable non-argmax recommendation while keeping complete family forecasts', () => {
  const fixture = card(), original = structuredClone(fixture.forecast.markets);
  assert.equal(bestCardFamily(fixture, publicPolicy.markets), 'double-chance');
  const prediction = selectedCardPrediction(fixture, 'double-chance');
  assert.equal(prediction.item.market.selection, 'home-or-away'); assert.equal(prediction.probability.roundedPercent, 72);
  assert.equal(probabilityEntry(prediction.item.market).roundedPercent, 72);
  const data = { fixture, snapshot: { ...fixture.forecast, cycleId: fixture.cycleId, outcomes: [], unavailableMarkets: [] } };
  assert.equal(featuredFamily(data), 'double-chance'); assert.equal(marketRow(data, 'double-chance').item.market.selection, 'home-or-away');
  const displayed = marketRow(data, 'double-chance').item.market;
  assert.equal(probabilityEntry(displayed).roundedPercent, 72, 'ProbabilityLabel accepts the explicit recommendation presentation');
  const { presentationOf: _original, ...unmarked } = displayed;
  assert.equal(_original.selection, 'home-or-draw');
  assert.throws(() => probabilityEntry(unmarked), /consistent accepted market/u, 'raw family argmax metadata stays strictly validated');
  assert.throws(() => probabilityEntry({ ...displayed, selectedProbability: 0.99 }), /preserve its original forecast/u);
  fixture.prices = [{ family: 'total-goals', selection: 'under-2.5', price: '999.99' }];
  assert.equal(bestCardFamily(fixture, publicPolicy.markets), 'double-chance'); assert.equal(featuredFamily(data), 'double-chance');
  assert.deepEqual(fixture.forecast.markets, original);
  assert.equal(fixture.forecast.markets.find(({ market }) => market.family === 'double-chance').market.selection, 'home-or-draw');
});

test('new explicit abstentions suppress the default recommendation without deleting probability-only families', () => {
  const fixture = card(); fixture.forecast.recommendation = { status: 'no-qualified-recommendation', selected: null };
  assert.equal(bestCardFamily(fixture, publicPolicy.markets), null);
  assert.equal(selectedCardPrediction(fixture), null);
  assert.equal(featuredFamily({ fixture, snapshot: { ...fixture.forecast } }), null);
  assert.equal(fixture.forecast.markets.length, 4);
});

test('automatic slips retain the authoritative selection and explicit outcomes retain their published distribution', () => {
  const fixture = card(), asOf = fixture.forecast.publishedAt + 1000;
  fixture.kickoffAt = asOf + 3600000; fixture.forecast.provisional = false;
  fixture.cycle = { state: 'open', mode: 'current', ordinal: 1, lockedAt: null, voidReason: null };
  fixture.update = { prediction: 'current', result: 'untracked' };
  fixture.prices = [{ family: 'double-chance', selection: 'home-or-away', price: '1.90', basis: 'bookmaker', retrievedAt: asOf, providerUpdatedAt: null }];
  fixture.selectionPrices = [...fixture.prices, { ...fixture.prices[0], selection: 'home-or-draw', price: '1.40' }];
  const today = new Date(asOf + 3 * 3600000).toISOString().slice(0, 10);
  const criteria = { ...defaultSlipCriteria(today), markets: ['double-chance'], teamsMax: 1, teamsMin: 1, slips: 1, reuse: true };
  assert.equal(buildSlips(criteria, [fixture], asOf).slips[0].selections[0].selection, 'home-or-away');
  const explicit = buildSlips({ ...criteria, outcomes: { 'double-chance': ['home-or-draw'] } }, [fixture], asOf);
  assert.equal(explicit.slips[0].selections[0].selection, 'home-or-draw'); assert.equal(explicit.slips[0].selections[0].probability, 0.82);
});

test('private recommendation audit round-trips beside the original argmax and rejects identity or source-clock changes', () => {
  const context = evidenceContext(undefined, { cycleId: randomUUID(), runId: randomUUID() });
  const candidate = historyCandidate({ snapshot: predictorSnapshot(undefined, undefined, context) });
  const evidenceId = evidenceHash('synthetic-recommendation-evidence');
  const decision = candidateRecommendation(candidate, evidenceId);
  const combined = { ...candidate, audit: { ...candidate.audit, recommendation: decision } };
  const input = revisionInput(combined, evidenceId);
  assert.deepEqual(parseAppendRevision(input), input);
  assert.equal(parseResolvedForecastCandidate(combined).markets['double-chance'].market.selection, 'home-or-draw');
  const projection = publicRecommendation(decision);
  assert.equal(projection.selected.selection, 'home-or-away');
  assert.doesNotMatch(JSON.stringify(projection), /bookmaker|decimal|snapshotId|evidenceHash|forecastTimestamps|decisions/u);
  for (const mutate of [
    (v) => { v.audit.recommendation.selected.quote.homeTeamId = context.away.teamId; },
    (v) => { v.audit.recommendation.selected.quote.observedAt = context.cutoffAt + 1; },
    (v) => { v.audit.recommendation.selected.quote.suspended = true; },
    (v) => { v.audit.recommendation.selected.probability = 0.99; },
    (v) => { v.audit.recommendation.selected.source = 'api-football'; },
  ]) { const changed = structuredClone(combined); mutate(changed); assert.throws(() => parseResolvedForecastCandidate(changed)); }
  assert.throws(() => parseAppendRevision({ ...input, evidenceSnapshotId: evidenceHash('different-snapshot') }));
});

test('internal quote conversion requires the observed exact bet manifest and keeps original clocks and precision', async () => {
  const context = evidenceContext(), retrievedAt = context.cutoffAt - 1000;
  const values = [{ label: 'Home', odd: '1.9001' }, { label: 'Draw', odd: '3.40' }, { label: 'Away', odd: '4.20' }];
  const snapshot = { id: evidenceHash('quote'), fixtureId: context.fixtureId, previousId: null, bookmakerId: 8, bookmakerName: 'Synthetic book',
    betId: 1, betName: 'Match Winner', valuesHash: oddsValuesHash(values), retrievedAt, providerUpdatedAt: null,
    retainUntil: context.kickoffAt + 86400000, values };
  const batch = { id: evidenceHash('quote-manifest-receipt'), kind: 'prices', receivedAt: context.cutoffAt, fixtures: [{ externalId: context.externalFixtureId, outcome: 'apply',
    quoteManifest: { bookmakerId: 8, kickoffAt: context.kickoffAt, bets: [{ betId: 1, betName: 'Match Winner', valuesHash: snapshot.valuesHash }] } }] };
  const input = { context, bookmakerId: 8, freshnessMs: 10800000, batch, snapshots: [snapshot], catalog: new Map([[1, 'Match Winner']]), permitted: true };
  const quotes = recommendationQuotesFromSnapshots(input);
  assert.equal(quotes.length, 3); assert.equal(quotes[0].decimal, '1.9001'); assert.equal(quotes[0].observedAt, retrievedAt);
  assert.equal(Object.hasOwn(quotes[0], 'impliedProbability'), false);
  for (const changed of [ { ...input, permitted: false }, { ...input, bookmakerId: 9 },
    { ...input, snapshots: [{ ...snapshot, retrievedAt: context.cutoffAt + 1 }] },
    { ...input, snapshots: [{ ...snapshot, retrievedAt: context.cutoffAt - 10800001 }] },
    { ...input, batch: { ...batch, fixtures: [{ ...batch.fixtures[0], quoteManifest: { bookmakerId: 8, kickoffAt: context.kickoffAt, bets: [] } }] } },
    { ...input, batch: { ...batch, fixtures: [{ ...batch.fixtures[0], quoteManifest: { bookmakerId: 8, kickoffAt: context.kickoffAt, bets: [{ betId: 1, betName: 'Match Winner', valuesHash: evidenceHash('changed') }] } }] } },
  ]) assert.deepEqual(recommendationQuotesFromSnapshots(changed), []);
  let reads = 0;
  const denied = createRecommendationQuoteLoader({ query() { reads++; throw new Error('No private access.'); } },
    { bookmakerId: 8, freshnessMs: 10800000, expectedPolicyHash: evidenceHash('policy'), verifyInternalUse: () => false });
  assert.deepEqual(await denied(context), []); assert.equal(reads, 0);
});

test('publication rechecks the sealed owning decision, original quote provenance and quote freshness', async () => {
  const context = evidenceContext(undefined, { cycleId: randomUUID(), runId: randomUUID() });
  const forecast = historyCandidate({ snapshot: predictorSnapshot(undefined, undefined, context) });
  const decision = candidateRecommendation(forecast, evidenceHash('publication-evidence'));
  const quote = decision.selected.quote, values = [{ label: 'Home/Draw', odd: '1.2' }, { label: 'Draw/Away', odd: '1.2' }, { label: 'Home/Away', odd: quote.decimal }];
  const identity = { fixtureId: context.fixtureId, previousId: null, bookmakerId: 8, bookmakerName: 'Synthetic book',
    betId: 12, betName: 'Double Chance', valuesHash: oddsValuesHash(values) };
  quote.snapshotId = evidenceFingerprint(identity);
  const snapshot = { ...identity, id: quote.snapshotId, retrievedAt: quote.observedAt, providerUpdatedAt: quote.providerUpdatedAt,
    retainUntil: context.kickoffAt + 86400000, values };
  const candidate = { ...forecast, audit: { ...forecast.audit, recommendation: decision } };
  const base = { id: evidenceHash('source-receipt'), accountId: evidenceHash('quota'), kind: 'prices', scopeKey: 'synthetic-prices',
    policyHash: evidenceHash('odds-policy'), status: 'complete', requestsDispatched: 1, receivedAt: quote.observedAt,
    requestId: evidenceHash('request'), slot: quote.observedAt, date: null, contractVersion: 'synthetic-odds-v1', reasons: [], missingCoverage: [],
    pages: [{ provider: 'api-football', endpoint: 'odds', requestParameters: {}, contractVersion: 'synthetic-odds-v1', retrievedAt: quote.observedAt,
      providerUpdatedAt: null, fromCache: false, currentPage: 1, totalPages: 1 }],
    fixtures: [{ externalId: context.externalFixtureId, outcome: 'apply', observationHash: evidenceHash('observed-row'),
      quoteManifest: { bookmakerId: 8, kickoffAt: context.kickoffAt, bets: [{ betId: 12, betName: 'Double Chance', valuesHash: snapshot.valuesHash }] } }], catalog: [] };
  const state = { stage: { jobId: candidate.context.jobId, phase: 'fallback', kind: 'completed', at: context.analysisAt + 2500,
    value: { status: 'candidate', candidate } }, snapshot, sourceBatch: base, observedBatch: null };
  const sealed = (body, extra = {}) => [{ body: evidenceSerialize(body), validIntegrity: true, ...extra }];
  const tx = { async $queryRaw(strings, ...parameters) {
    const sql = strings.join('');
    if (sql.includes('PredictionRefreshStage')) return sealed(state.stage);
    if (sql.includes('PredictionRefreshIntent')) return sealed({ member: { jobId: candidate.context.jobId, context }, plan: { recommendationPolicy } });
    if (sql.includes('ProviderOddsSnapshot')) return sealed(state.snapshot, { batchId: base.id });
    if (sql.includes("scopeKey='bets'")) return sealed({ ...base, kind: 'bets', scopeKey: 'bets', fixtures: [], catalog: [{ id: 12, name: 'Double Chance' }] });
    if (sql.includes('OddsImportBatch')) return sealed(parameters[0] === state.observedBatch?.id ? state.observedBatch : state.sourceBatch);
    throw new Error(`Unexpected query: ${sql}`);
  } };
  const input = { candidate, evidenceSnapshotId: decision.evidenceSnapshotId };
  assert.equal(await validatePublishedRecommendation(tx, input, context.analysisAt + 3000), true);
  assert.equal(await validatePublishedRecommendation(tx, input, context.analysisAt + recommendationPolicy.quoteMaxAgeMs), false);
  state.stage = { ...state.stage, value: { ...state.stage.value, candidate: forecast } };
  await assert.rejects(validatePublishedRecommendation(tx, input, context.analysisAt + 3000), /publication refused|unavailable/iu);
  state.stage = { ...state.stage, value: { status: 'candidate', candidate } };
  state.snapshot = { ...snapshot, values: values.map((value) => ({ ...value, odd: '9.99' })) };
  await assert.rejects(validatePublishedRecommendation(tx, input, context.analysisAt + 3000), /publication refused|unavailable/iu);
  state.snapshot = snapshot;
  state.observedBatch = { ...base, id: evidenceHash('later-reconfirmation'), receivedAt: context.cutoffAt };
  state.sourceBatch = { ...base, fixtures: base.fixtures.map((fixture) => ({ externalId: fixture.externalId,
    outcome: fixture.outcome, observationHash: fixture.observationHash })) };
  quote.observationReceiptId = state.observedBatch.id;
  assert.equal(await validatePublishedRecommendation(tx, input, context.analysisAt + 3000), true,
    'a newer manifest certifies an unchanged legacy snapshot without renewing its original clocks');
  assert.equal(quote.observedAt, snapshot.retrievedAt);
});
