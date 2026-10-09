import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createMatchDetailHandler } from '../src/server/matches/detail-http.ts';
import { createMatchDetailService, canonicalMatchSlug } from '../src/server/matches/detail-service.ts';
import { parseMatchDetailQuery, detailHistoryLink } from '../src/server/matches/detail-query.ts';
import { publicRevisionAnalysis } from '../src/server/matches/detail-read.ts';
import { detailRevisionSchema } from '../src/domain/match-detail.ts';
import { MatchFeedError } from '../src/server/matches/feed-error.ts';
import { historyCandidate } from './helpers/prediction-history-fixtures.mjs';
import { predictorSnapshot } from './helpers/predictor-output-fixtures.mjs';
import { evidenceContext, evidenceSource } from './helpers/evidence-fixtures.mjs';
import { modelVersion } from './helpers/predictor-fixtures.mjs';

const id = randomUUID();
for (const query of ['limit=0', 'limit=21', 'limit=01', 'limit=1&limit=2', 'revision=bad', 'cycle=bad',
  `revision=${randomUUID()}&cycle=${randomUUID()}`, 'revisionBefore=1', 'revisionAnchor=2&revisionBefore=3',
  'cycleBefore=1', 'cycleAnchor=2&cycleBefore=3', 'revisionAnchor=4294967296', 'cycleAnchor=-1', 'q=club', 'locale=en', 'token=private',
  `unknown=${'x'.repeat(2048)}`]) {
  test(`detail rejects invalid query before reading: ${query.slice(0, 75)}`, async () => {
    let reads = 0;
    const response = await createMatchDetailHandler(async () => { reads++; })(new Request(`http://localhost/api/matches/${id}?${query}`), { params: Promise.resolve({ id }) });
    assert.equal(response.status, 400); assert.equal(reads, 0);
    assert.equal(response.headers.get('set-cookie'), null);
  });
}
test('invalid fixture identity is rejected before lazy database initialization', async () => {
  const handler = createMatchDetailHandler(async () => { throw new Error('should not run'); });
  assert.equal((await handler(new Request('http://localhost/api/matches/invalid'), { params: Promise.resolve({ id: 'invalid' }) })).status, 400);
});
test('shared HTTP errors redact internals and retain retry policy', async () => {
  for (const [error, status, retry] of [[new MatchFeedError('not-found'), 404, null], [new MatchFeedError('rate-limited', 17), 429, '17'],
    [new Error('mysql://secret/raw-model-prompt'), 503, '5']]) {
    const response = await createMatchDetailHandler(async () => { throw error; })(new Request(`http://localhost/api/matches/${id}`), { params: Promise.resolve({ id }) });
    assert.equal(response.status, status); assert.equal(response.headers.get('retry-after'), retry);
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
    assert.equal(response.headers.get('set-cookie'), null); assert.doesNotMatch(await response.text(), /secret|raw-model|mysql:/u);
  }
});
test('default bounds and keyset links preserve selection and both anchors', () => {
  assert.equal(parseMatchDetailQuery(id, new URLSearchParams()).limit, 10);
  assert.equal(parseMatchDetailQuery(id, new URLSearchParams('revisionAnchor=0&cycleAnchor=0')).revisionAnchor, 0);
  const revision = randomUUID(), link = detailHistoryLink(id, new URLSearchParams({ revision, limit: '1' }), { revision: 3, cycle: 2 }, 'revision', 2);
  const query = new URL(link, 'http://localhost').searchParams;
  assert.equal(query.get('revision'), revision); assert.equal(query.get('revisionAnchor'), '3'); assert.equal(query.get('cycleAnchor'), '2');
  assert.equal(parseMatchDetailQuery(id, query).revisionBefore, 2);
});
test('canonical slugs are bounded decorative names with a safe fallback', () => {
  assert.equal(canonicalMatchSlug('São Paulo', 'L’Équipe'), 'sao-paulo-vs-l-equipe');
  assert.equal(canonicalMatchSlug(null, '中文'), 'home-vs-away');
  assert.ok(canonicalMatchSlug('x'.repeat(512), 'y'.repeat(512)).length <= 160);
});
test('revision DTO reuses safe UTC instants and unsigned decimal fixture versions', () => {
  const revision = { revisionId: id, cycleId: id, runId: id, runSequence: '20261009', fixtureRevision: 1, cycleRevision: 1,
    fixtureDataVersion: '18446744073709551615', evidenceCutoffAt: 0, generationCompletedAt: 1, publishedAt: 2 };
  assert.equal(detailRevisionSchema.safeParse(revision).success, true);
  assert.equal(detailRevisionSchema.safeParse({ ...revision, fixtureDataVersion: '18446744073709551616' }).success, false);
  assert.equal(detailRevisionSchema.safeParse({ ...revision, publishedAt: 8_640_000_000_000_001 }).success, false);
});
test('analysis permits original summaries and attribution, preserves unknown clocks, and withholds expired or unsafe citations', () => {
  const context = evidenceContext(), source = evidenceSource(context, { sourceUrl: 'https://example.com/fixture', providerUpdatedAt: null });
  const snapshot = predictorSnapshot([source]), candidate = historyCandidate({ snapshot, model: modelVersion() });
  const revision = { candidate };
  const safe = publicRevisionAnalysis(revision, snapshot, context.analysisAt + 4000);
  assert.equal(safe.state, 'available'); assert.equal(safe.reasons.length, 2); assert.equal(safe.sources[0].providerUpdatedAt, null);
  assert.deepEqual(safe.reasons[0].sourceUrls, ['https://example.com/fixture']);
  assert.doesNotMatch(JSON.stringify(safe), /evidenceRef|claims|raw|modelVersionId|transport|promptVersion/u);
  const expired = publicRevisionAnalysis(revision, snapshot, source.reuse.retainUntil + 1);
  assert.equal(expired.state, 'withheld'); assert.deepEqual(expired.reasons, []); assert.equal(expired.uncertainty, null); assert.deepEqual(expired.sources, []);
  const unsafe = publicRevisionAnalysis({ candidate: { ...candidate, reasons: [{ ...candidate.reasons[0], sourceUrls: ['https://example.com/?token=private'] }, candidate.reasons[1]] } }, snapshot, context.analysisAt);
  assert.equal(unsafe.state, 'withheld'); assert.doesNotMatch(JSON.stringify(unsafe), /token=private/u);
});
test('database errors become a structured unavailable failure', async () => {
  const service = createMatchDetailService({ database: { transaction: async () => { throw new Error('private database'); } } });
  await assert.rejects(service.query(id), (error) => error.code === 'unavailable' && !error.message.includes('private database'));
});
