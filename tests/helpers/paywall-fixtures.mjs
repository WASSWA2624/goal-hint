import { liveDetail, liveFeed, liveRecord, now, today, ids } from './live-refresh-fixtures.mjs';
import { storedMatchDetailResponseSchema } from '../../src/domain/match-detail.ts';
import { storedMatchFeedResponseSchema } from '../../src/domain/match-feed.ts';
import { storedMatchInsightsSchema } from '../../src/domain/match-insights.ts';
import { validateMarketSnapshot, marketRules } from '../../src/domain/markets.ts';

export { now, today };
export const sentinel = { probability: 0.6173, reason: 'SENTINEL-REASON-7Q', risk: 'SENTINEL-RISK-4K' };
export const scenarioStatuses = ['scheduled', 'live', 'postponed', 'prior-cycle', 'finished-regulation', 'canceled'];
export const scenarios = Object.fromEntries(scenarioStatuses.map((name, index) => {
  const fixtureId = `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
  const detail = liveDetail(liveRecord()); delete detail.access;
  detail.fixture.fixtureId = fixtureId; detail.route.fixtureId = fixtureId;
  detail.route.slug = name; detail.route.path = `/en/matches/${fixtureId}/${name}`;
  detail.fixture.status = name === 'prior-cycle' ? 'scheduled' : name;
  const probabilities = { 'home-win': sentinel.probability, draw: 0.2, 'away-win': 0.1827 };
  const accepted = validateMarketSnapshot({ 'match-result': { source: 'ai', period: marketRules.period, probabilities } });
  for (const item of [...detail.fixture.forecast.markets, ...detail.snapshot.markets]) {
    item.market = accepted.markets[item.market.family].market;
    item.reasons = [sentinel.reason]; item.uncertainty = sentinel.risk;
  }
  for (const item of detail.snapshot.markets) item.alternatives = Object.entries(item.market.probabilities)
    .filter(([selection]) => selection !== item.market.selection).map(([selection, probability]) => ({ selection, probability }));
  detail.snapshot.analysis = { state: 'available', reasons: [{ text: sentinel.reason, sourceUrls: [] }, { text: 'Synthetic second reason.', sourceUrls: [] }],
    uncertainty: { text: sentinel.risk, sourceUrls: [] }, limitedNews: false, sources: [] };
  detail.fixture.prices = [{ family: 'match-result', selection: 'home-win', price: '7.73', basis: 'bookmaker', retrievedAt: now - 1, providerUpdatedAt: null }];
  if (['postponed', 'canceled'].includes(name)) {
    const voidReason = { code: 'formal-postponement', explanation: 'Synthetic postponement.' };
    detail.fixture.cycle.state = 'void'; detail.fixture.cycle.mode = 'void'; detail.fixture.cycle.voidReason = voidReason;
    detail.selectedCycle.state = 'void'; detail.selectedCycle.voidReason = voidReason; detail.selectedCycle.voidedAt = now;
    detail.snapshot.cycle = detail.selectedCycle; detail.snapshot.applicability = 'void';
  }
  const prior = structuredClone(detail);
  prior.selection = 'cycle'; prior.snapshot.historical = true; prior.snapshot.applicability = 'historical';
  prior.fixture.forecast = null; prior.fixture.prices = []; prior.currentRevisionId = null;
  prior.fixture.unavailableMarkets = ['match-result', 'double-chance', 'total-goals', 'both-teams-to-score'].map(family => ({ family, reason: 'not-published' }));
  const current = name === 'prior-cycle' ? { ...prior, selection: 'applicable', snapshot: null, selectedCycle: null } : detail;
  const feed = { ...liveFeed([current.fixture]) }; delete feed.access;
  const team = (side) => ({ id: `synthetic-${side}`, name: `Synthetic ${side}`, logoUrl: null });
  const insights = storedMatchInsightsSchema.parse({ fixtureId, asOf: now, home: team('home'), away: team('away'), sections: {
    form: { home: [], away: [] }, h2h: { meetings: [] }, stats: { evidence: [], evidenceRetrievedAt: null }, lineups: { home: null, away: null },
    players: { players: [] }, injuries: { injuries: [] }, news: { limitedNews: false, items: [
      { id: 'analysis', kind: 'analysis', publisher: 'Goal Hint', title: sentinel.reason, details: [sentinel.risk], url: null, publishedAt: now, retrievedAt: now },
      { id: 'report', kind: 'report', publisher: 'Synthetic news', title: 'Public match report', details: [], url: null, publishedAt: now, retrievedAt: now }] },
    context: { competition: { id: current.fixture.competition.id, name: current.fixture.competition.name,
      country: current.fixture.competition.country, logoUrl: null, round: null }, kickoffAt: now, restDays: { home: null, away: null },
      lastResults: { home: null, away: null }, nextFixtures: { home: null, away: null } }, referee: { state: 'not-available' }, history: { state: 'available' },
  } });
  return [name, { detail: storedMatchDetailResponseSchema.parse(current), prior: storedMatchDetailResponseSchema.parse(prior),
    feed: storedMatchFeedResponseSchema.parse(feed), insights, cycle: ids.cycle, revision: ids.revision }];
}));
