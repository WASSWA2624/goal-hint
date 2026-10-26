import { fullAccess } from './helpers/full-access.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createMatchInsightsHandler, createMatchInsightsService } from '../src/server/matches/insights-service.ts';
import { MatchFeedError } from '../src/server/matches/feed-error.ts';

const id = randomUUID();
const insights = Object.freeze({ fixtureId: id, asOf: Date.parse('2026-10-09T12:00:00Z'),
  sections: { form: { home: [], away: [] }, h2h: { meetings: [] } } });
const context = (value = id) => ({ params: Promise.resolve({ id: value }) });
const request = (query) => new Request(`https://goalhint.test/api/matches/${id}/insights${query}`);
const handler = (read) => {
  const calls = [];
  return { calls, GET: createMatchInsightsHandler(async (value) => { calls.push(value); return read(value); }, { resolveAccess: fullAccess }) };
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const database = (transaction) => {
  const calls = [];
  return { calls, runtime: { transaction: (...args) => { calls.push(args); return transaction(); } } };
};

for (const query of ['', '?section=', '?section=unknown', '?section=FORM', '?section=form&locale=en', '?other=1']) {
  test(`insights handler refuses ${query || 'a missing section'} without reading`, async () => {
    const { calls, GET } = handler(() => insights);
    const response = await GET(request(query), context());
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'invalid-query');
    assert.match(response.headers.get('cache-control'), /no-store/u);
    assert.equal(calls.length, 0);
  });
}

test('insights handler returns exactly one requested section', async () => {
  const { calls, GET } = handler(() => insights);
  const response = await GET(request('?section=form'), context());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { access: { tier: 'full', signedIn: false }, fixtureId: id, asOf: insights.asOf, section: 'form', data: insights.sections.form });
  assert.match(response.headers.get('cache-control'), /no-store/u);
  assert.deepEqual(calls, [id]);
});

test('insights handler maps reader failures to public status codes', async () => {
  const missing = await handler(() => { throw new MatchFeedError('not-found'); }).GET(request('?section=h2h'), context());
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'not-found');
  assert.equal(missing.headers.get('retry-after'), null);
  const refused = await handler(() => { throw new MatchFeedError('invalid-query'); }).GET(request('?section=h2h'), context('not-a-uuid'));
  assert.equal(refused.status, 400);
  const failed = await handler(() => { throw new Error('database detail'); }).GET(request('?section=h2h'), context());
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('retry-after'), '5');
  const body = await failed.json();
  assert.equal(body.error.code, 'unavailable');
  assert.doesNotMatch(JSON.stringify(body), /database detail/u, 'internal failures never reach the public body');
});

test('insights service refuses a non-UUID fixture id before opening a transaction', async () => {
  const { calls, runtime } = database(() => Promise.reject(new Error('unreachable')));
  const service = createMatchInsightsService({ database: runtime });
  for (const value of ['not-a-uuid', '', `${id}x`]) {
    await assert.rejects(service.query(value), (error) => error instanceof MatchFeedError && error.code === 'invalid-query');
  }
  assert.equal(calls.length, 0);
});

test('concurrent insights reads for one fixture share a single snapshot build until it settles', async () => {
  const pending = deferred();
  const { calls, runtime } = database(() => pending.promise);
  const service = createMatchInsightsService({ database: runtime });
  // Separate services over one database share the in-flight read, as per-request services do.
  const other = createMatchInsightsService({ database: runtime });
  const first = service.query(id.toUpperCase()), second = other.query(id.toLowerCase());
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 30_000 });
  pending.resolve(insights);
  const [left, right] = await Promise.all([first, second]);
  assert.equal(left, insights);
  assert.equal(right, left);
  await service.query(id);
  assert.equal(calls.length, 2, 'a settled read leaves the in-flight map');
});

test('insights service wraps unexpected transaction failures as unavailable', async () => {
  const { calls, runtime } = database(() => Promise.reject(new Error('connection reset')));
  const service = createMatchInsightsService({ database: runtime });
  await assert.rejects(service.query(id), (error) => error instanceof MatchFeedError && error.code === 'unavailable' && !/connection reset/u.test(error.message));
  const known = database(() => Promise.reject(new MatchFeedError('not-found')));
  await assert.rejects(createMatchInsightsService({ database: known.runtime }).query(id), (error) => error instanceof MatchFeedError && error.code === 'not-found');
  assert.equal(calls.length, 1);
});
