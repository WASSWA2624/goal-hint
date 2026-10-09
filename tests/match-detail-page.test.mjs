import assert from 'node:assert/strict';
import test from 'node:test';
import { loadMatchDetailPage, matchDetailMetadata, parseMatchDetailPageInput } from '../src/server/matches/detail-page.ts';
import { detailAnalysis, detailMarket } from '../src/server/matches/detail-presentation.ts';
import { MatchFeedError } from '../src/server/matches/feed-error.ts';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', clock = { now: () => 1234 };
test('detail page validates identity and reserves revision queries before stored reads', async () => {
  assert.equal(parseMatchDetailPageInput(id.toUpperCase(), {}), id);
  for (const query of [{ revision: id }, { cycle: id }, { limit: '1' }, { q: 'home' }, { token: 'private' }, { unknown: ['a', 'b'] }]) {
    assert.throws(() => parseMatchDetailPageInput(id, query), error => error.code === 'invalid-query');
  }
  let reads = 0;
  assert.equal((await loadMatchDetailPage('invalid', clock, async () => { reads++; })).error, 'not-found');
  assert.equal(reads, 0);
});
test('server page preserves the stored projection and request clock; sanitized failures stay distinct', async () => {
  const response = { fixture: { fixtureId: id }, snapshot: null, asOf: 1 };
  const result = await loadMatchDetailPage(id, clock, async (receivedId, parameters, receivedClock) => {
    assert.equal(receivedId, id); assert.equal(parameters.size, 0); assert.equal(receivedClock, clock); return response;
  });
  assert.equal(result.data, response); assert.equal(result.data.asOf, 1);
  for (const [error, expected] of [[new MatchFeedError('not-found'), 'not-found'], [new MatchFeedError('rate-limited'), 'rate-limited'],
    [new Error('mysql://private/provider-secret/internal-prompt'), 'unavailable']]) {
    const failed = await loadMatchDetailPage(id, clock, async () => { throw error; });
    assert.deepEqual(failed, { data: null, error: expected }); assert.doesNotMatch(JSON.stringify(failed), /private|provider-secret|prompt/);
  }
});
test('all detail market values and outcome identities use the selected whole revision, never older families or scores', () => {
  const picked = { market: { family: 'match-result', selection: 'home-win', selectedProbability: 0.4 } };
  const outcome = { family: 'match-result', selection: 'home-win', revisionId: 'new', cycleId: 'cycle', status: 'incorrect' };
  const data = { fixture: { score: { home: 3, away: 0 }, forecast: { markets: [{ market: { family: 'total-goals' } }] }, unavailableMarkets: [] },
    snapshot: { revisionId: 'new', cycleId: 'cycle', markets: [picked], outcomes: [outcome], unavailableMarkets: [{ family: 'total-goals', reason: 'unsupported' }] } };
  assert.equal(detailMarket(data, 'match-result').item, picked);
  assert.equal(detailMarket(data, 'match-result').outcome.status, 'incorrect');
  assert.equal(detailMarket(data, 'total-goals').item, null); assert.equal(detailMarket(data, 'total-goals').unavailableReason, 'unsupported');
  for (const mismatch of [{ ...outcome, revisionId: 'old' }, { ...outcome, cycleId: 'other' }, { ...outcome, selection: 'draw' }]) {
    assert.equal(detailMarket({ ...data, snapshot: { ...data.snapshot, outcomes: [mismatch] } }, 'match-result').outcome, null);
  }
  const closed = { ...data, snapshot: null, fixture: { ...data.fixture, unavailableMarkets: [{ family: 'match-result', reason: 'no-locked-selection' }] } };
  assert.equal(detailMarket(closed, 'match-result').item, null);
  assert.equal(detailMarket(closed, 'match-result').unavailableReason, 'no-locked-selection');
});
test('HTML analysis boundary permits attributable HTTPS only and withholds explanations with unsafe citations', () => {
  const url = 'https://www.bbc.com/sport/football?story=1';
  const source = { id: 'source', publisher: 'Synthetic publisher', title: '<script>untrusted text</script>', url, publishedAt: null, retrievedAt: 100, providerUpdatedAt: null };
  const analysis = { state: 'available', limitedNews: true, sources: [source],
    reasons: [{ text: 'Supported observation', sourceUrls: [url] }, { text: 'Second observation', sourceUrls: [] }],
    uncertainty: { text: 'Missing player data', sourceUrls: [] } };
  assert.deepEqual(detailAnalysis(analysis), analysis);
  for (const unsafe of ['javascript:alert(1)', 'data:text/html,test', 'file:///private', 'http://www.bbc.com/', 'https://localhost/private',
    'https://127.0.0.1/', 'https://[::1]/', 'https://user:password@www.bbc.com/', 'https://www.bbc.com/?token=secret',
    'https://www.bbc.com:444/', 'https://www.bbc.com/?story=1&story=2', 'https://www.bbc.com/%250a']) {
    const checked = detailAnalysis({ ...analysis, sources: [{ ...source, url: unsafe }], reasons: [{ text: 'Unsafe citation', sourceUrls: [unsafe] }, analysis.reasons[1]] });
    assert.equal(checked.state, 'withheld'); assert.deepEqual(checked.reasons, []); assert.equal(checked.uncertainty, null);
    assert.equal(checked.sources[0].url, null); assert.equal(checked.sources[0].publishedAt, null);
    assert.equal(checked.sources[0].retrievedAt, 100);
  }
  assert.equal(detailAnalysis({ ...analysis, reasons: [{ text: 'Unattributed citation', sourceUrls: ['https://other.example.com/story'] }, analysis.reasons[1]] }).state, 'withheld');
  assert.equal(detailAnalysis({ ...analysis, state: 'withheld', reasons: [], uncertainty: null }).state, 'withheld');
  assert.equal(analysis.sources[0].url, url);
});
test('detail metadata uses fixture-derived canonical identity, safe brand previews and honest indexing', () => {
  const data = { fixture: { homeTeam: { name: 'Home Club' }, awayTeam: { name: 'Away Club' } }, route: { path: `/en/matches/${id}/home-club-v-away-club` } };
  const metadata = matchDetailMetadata({ data, error: null });
  assert.equal(metadata.title, 'Home Club v Away Club | Goal Hint');
  assert.equal(metadata.alternates.canonical, `https://goalhint.com${data.route.path}`);
  assert.equal(metadata.openGraph.url, metadata.alternates.canonical); assert.equal(metadata.robots.index, false);
  assert.ok(metadata.openGraph.images[0].url.startsWith('https://goalhint.com/brand/'));
  assert.equal(matchDetailMetadata({ data: null, error: 'unavailable' }).alternates, undefined);
  assert.match(matchDetailMetadata({ data: { ...data, fixture: { homeTeam: { name: null }, awayTeam: { name: null } } }, error: null }).title, /unavailable/);
});
