import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalUrl, feedDiscovery, resolveDiscoveryPolicy, serializeStructuredData, sitemapPage, websiteStructuredData } from '../src/domain/discovery.ts';
import { parseFeedQuery } from '../src/domain/feed-query.ts';
import { parseReportingDate } from '../src/domain/calendar.ts';
import { feedMetadata, createInformationMetadata } from '../src/server/seo/metadata.ts';
import { matchDetailMetadata } from '../src/server/matches/detail-page.ts';
import { createDiscoveryRoutes } from '../src/server/seo/discovery-routes.ts';
import { getDiscoveryPolicy } from '../src/server/seo/policy.ts';

const today = parseReportingDate('2026-10-09');
const approved = { deployment: 'production', index: true };
const populated = { data: { records: [{}], state: 'ready' }, error: null };
const query = values => parseFeedQuery(values, { today });

test('indexing needs an explicit production runtime and verified release; missing or preview configuration fails closed', () => {
  for (const deployment of [undefined, '', 'development', 'staging', 'preview', 'Production', 'production']) {
    for (const runtime of ['development', 'test', 'production']) for (const releaseVerified of [false, true]) {
      assert.equal(resolveDiscoveryPolicy({ deployment, runtime, releaseVerified }).index,
        deployment === 'production' && runtime === 'production' && releaseVerified);
    }
  }
  assert.equal(getDiscoveryPolicy().index, false, 'Deferred owner approvals cannot be replaced by environment strings.');
});

test('canonical origin is fixed and genuine pagination retains its dated page identity', () => {
  assert.equal(canonicalUrl('/en'), 'https://goalhint.com/en');
  for (const path of ['//evil.example/en', 'https://evil.example/en', '/\\evil.example', '/en#revision', '/en\r\nheader']) {
    assert.throws(() => canonicalUrl(path), RangeError);
  }
  assert.equal(feedDiscovery(query({}), today).path, '/en');
  assert.equal(feedDiscovery(query({ page: '2' }), today).path, '/en/predictions/2026-10-09?page=2');
  assert.equal(feedDiscovery(query({ when: 'tomorrow', page: '3' }), today).path, '/en/predictions/2026-10-10?page=3');
  assert.equal(feedDiscovery(query({ date: '2026-10-08' }), today).path, '/en/predictions/2026-10-08');
  for (const values of [{ q: '<script>' }, { league: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, { status: 'live' },
    { market: 'total-goals' }, { market: 'match-result', sort: 'probability' }, { pageSize: '10' }, { when: 'next-7-days' }]) {
    assert.equal(feedDiscovery(query(values), today).eligible, false);
    assert.equal(feedMetadata(query(values), today, populated, approved).robots.index, false);
  }
});

test('page metadata has independent social fields, real canonical pagination and honest unavailable indexing', async () => {
  const home = feedMetadata(query({}), today, populated, approved);
  assert.equal(home.title, 'Goal Hint | Daily Football Predictions');
  assert.equal(home.robots.index, true);
  const page = feedMetadata(query({ page: '2' }), today, populated, approved);
  assert.match(page.title, /Page 2/); assert.notEqual(page.title, home.title);
  assert.equal(page.alternates.canonical, 'https://goalhint.com/en/predictions/2026-10-09?page=2');
  assert.equal(page.openGraph.url, page.alternates.canonical);
  assert.equal(page.openGraph.title, page.title); assert.equal(page.twitter.title, page.title);
  assert.equal(page.openGraph.images[0].url, 'https://goalhint.com/brand/goal-hint-open-graph.png');
  for (const result of [{ data: null, error: 'unavailable' }, { data: { records: [], state: 'page-out-of-range' }, error: null }]) {
    assert.equal(feedMetadata(query({ page: '2' }), today, result, approved).robots.index, false);
  }
  const fixture = { data: { fixture: { homeTeam: { name: 'Home' }, awayTeam: { name: 'Away' } },
    route: { path: '/en/matches/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/home-vs-away' }, snapshot: null }, error: null };
  const known = matchDetailMetadata(fixture, 'en', false, approved);
  assert.equal(known.robots.index, true, 'Known unavailable forecast pages remain valid fixture pages.');
  assert.match(known.title, /Goal Hint$/);
  const history = matchDetailMetadata(fixture, 'en', true, approved);
  assert.equal(history.robots.index, false); assert.equal(history.alternates.canonical, known.alternates.canonical);
  assert.equal(matchDetailMetadata({ data: null, error: 'unavailable' }, 'en', false, approved).robots.index, false);
  assert.equal((await createInformationMetadata('how-it-works', () => approved)()).robots.index, true);
  assert.equal((await createInformationMetadata('how-it-works', () => approved)({ searchParams: Promise.resolve({ market: 'total-goals' }) })).robots.index, false);
  for (const name of ['privacy', 'terms', 'contact']) assert.equal((await createInformationMetadata(name, () => approved)()).robots.index, false);
});

test('disabled discovery never reads a database and robots allows noindex variants to be read', async () => {
  const routes = createDiscoveryRoutes({ policy: () => ({ deployment: 'staging', index: false }),
    reader: () => { throw new Error('Staging must not prepare a public sitemap.'); } });
  assert.deepEqual(await routes.sitemap(), []); assert.deepEqual(await routes.matches({ id: Promise.resolve('0') }), []);
  await assert.rejects(routes.matches({ id: Promise.resolve('1') }), RangeError);
  assert.deepEqual(await routes.matchIds(), [{ id: 0 }]);
  assert.deepEqual(await routes.robots(), { rules: { userAgent: '*', allow: '/', disallow: '/api/' } });
});

test('sitemap shards preserve stored lastmod, advertise each bounded shard and propagate reader failures', async () => {
  const stamp = new Date('2026-10-09T12:00:00Z');
  const reads = [];
  const reader = { inventory: async () => ({ matches: 4001, dates: 1 }),
    matches: async page => { reads.push(page); return page < 3 ? [{ path: `/en/matches/${page}/stored`, lastModified: stamp }] : []; },
    dates: async () => [{ path: '/en/predictions/2026-10-09' }] };
  const routes = createDiscoveryRoutes({ policy: () => approved, reader: () => reader });
  assert.deepEqual(await routes.matchIds(), [{ id: 0 }, { id: 1 }, { id: 2 }]);
  assert.equal((await routes.matches({ id: Promise.resolve('2') }))[0].lastModified, stamp);
  assert.deepEqual(await routes.dates({ id: Promise.resolve('0') }), [{ url: 'https://goalhint.com/en/predictions/2026-10-09' }]);
  const robots = await routes.robots(); assert.equal(robots.sitemap.length, 5);
  assert.ok(robots.sitemap.includes('https://goalhint.com/matches/sitemap/2.xml'));
  const urls = (await routes.sitemap()).map(row => row.url);
  assert.deepEqual(urls, ['https://goalhint.com/en', 'https://goalhint.com/en/how-it-works']);
  for (const id of ['-1', '01', '1.xml', '9999999999', 'x']) {
    assert.throws(() => sitemapPage(id), RangeError);
    await assert.rejects(routes.matches({ id: Promise.resolve(id) }), RangeError);
  }
  await assert.rejects(routes.matches({ id: Promise.resolve('3') }), RangeError);
  await assert.rejects(routes.matches({ id: Promise.resolve('999999999') }), RangeError);
  assert.deepEqual(reads, [2], 'Invalid shard IDs cannot cause a large-offset database read.');
  const failed = createDiscoveryRoutes({ policy: () => approved, reader: () => ({ inventory: async () => { throw new Error('reader failed'); } }) });
  await assert.rejects(failed.robots(), /reader failed/);
});

test('supported WebSite structured data is minimal and safe inside an HTML script element', () => {
  const value = websiteStructuredData(); assert.equal(value.name, 'Goal Hint'); assert.equal(value.inLanguage, 'en');
  assert.deepEqual(Object.keys(value).sort(), ['@context', '@type', 'inLanguage', 'name', 'url']);
  const hostile = { ...value, name: '</script><script>unsafe()</script>' };
  const serialized = serializeStructuredData(hostile);
  assert.doesNotMatch(serialized, /</); assert.deepEqual(JSON.parse(serialized), hostile);
});
