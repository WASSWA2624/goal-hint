import assert from 'node:assert/strict';
import test from 'node:test';
import { breadcrumbStructuredData, canonicalUrl, feedDiscovery, homeStructuredData, matchPageIndexable, resolveDiscoveryPolicy, serializeStructuredData, sitemapIndexXml, sitemapPage, websiteStructuredData } from '../src/domain/discovery.ts';
import { parseFeedQuery } from '../src/domain/feed-query.ts';
import { parseReportingDate } from '../src/domain/calendar.ts';
import { feedMetadata, createInformationMetadata } from '../src/server/seo/metadata.ts';
import { matchDetailMetadata, matchStructuredData } from '../src/server/matches/detail-page.ts';
import { feedHeading } from '../src/domain/feed-presentation.ts';
import { createMessages } from '../src/i18n/messages.ts';
import { cardFixture } from './helpers/match-card-fixtures.mjs';
import { createDiscoveryRoutes } from '../src/server/seo/discovery-routes.ts';
import { getDiscoveryPolicy } from '../src/server/seo/policy.ts';
import { createDiscoveryProxy } from '../src/server/seo/proxy.ts';
import { NextRequest } from 'next/server.js';

const today = parseReportingDate('2026-10-09');
const approved = { deployment: 'production', index: true };
const populated = { data: { records: [{}], state: 'ready' }, error: null };
const query = values => parseFeedQuery(values, { today });

test('search and social attribution redirects to a clean landing URL without changing application state', () => {
  const proxy = createDiscoveryProxy(() => approved);
  for (const path of ['/en', '/en/predictions/2026-10-09', '/en/matches/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/home-vs-away', '/en/help']) {
    const response = proxy(new NextRequest(`https://goalhint.com${path}?utm_source=search&gclid=click&UTM_CAMPAIGN=football&fbclid=social`));
    assert.equal(response.status, 308);
    // Only the fragment carries campaign tags onward, for consenting analytics; click identifiers become their network.
    assert.equal(response.headers.get('location'), `https://goalhint.com${path}#gh_attr=${encodeURIComponent('utm_source=search&click=google&utm_campaign=football')}`);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('x-robots-tag'), null);
  }
  const filters = 'league=one&league=two&q=Home+Club&page=2';
  const filtered = proxy(new NextRequest(`https://goalhint.com/en?utm_source=first&utm_source=second&${filters}&msclkid=click`));
  assert.equal(filtered.headers.get('location'), `https://goalhint.com/en?${filters}#gh_attr=${encodeURIComponent('utm_source=first&click=microsoft')}`);
  const history = proxy(new NextRequest('https://goalhint.com/en/matches/id/home-vs-away?section=history&revision=revision-id&utm_medium=social'));
  assert.equal(history.headers.get('location'), `https://goalhint.com/en/matches/id/home-vs-away?section=history&revision=revision-id#gh_attr=${encodeURIComponent('utm_medium=social')}`);
  const clean = proxy(new NextRequest('https://goalhint.com/en?page=2&unsupported=still-validated'));
  assert.equal(clean.headers.get('location'), null, 'Unrecognized application parameters are never silently dropped.');
  const staging = createDiscoveryProxy(() => ({ deployment: 'staging', index: false }));
  const fallback = staging(new NextRequest('https://goalhint.com/fr/help?utm_source=shared&page=2'));
  assert.equal(fallback.status, 307, 'Unpublished language redirects keep their existing temporary semantics.');
  assert.equal(fallback.headers.get('location'), `https://goalhint.com/en/help?page=2#gh_attr=${encodeURIComponent('utm_source=shared')}`);
  assert.equal(fallback.headers.get('x-robots-tag'), 'noindex, follow');
});

test('analytics retains its private robots policy on responses and attribution redirects', () => {
  for (const policy of [approved, { deployment: 'staging', index: false }]) {
    const proxy = createDiscoveryProxy(() => policy);
    for (const path of ['/analytics', '/analytics?period=last-7', '/analytics?utm_source=shared']) {
      const response = proxy(new NextRequest(`https://goalhint.com${path}`));
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow', path);
    }
  }
});

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
  assert.equal(feedDiscovery(query({ page: '2' }), today).path, '/en/predictions/2026-09-10?to=2026-10-09&page=2');
  assert.equal(feedDiscovery(query({ when: 'today' }), today).path, '/en/predictions/2026-10-09');
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
  assert.equal(page.alternates.canonical, 'https://goalhint.com/en/predictions/2026-09-10?to=2026-10-09&page=2');
  assert.equal(page.openGraph.url, page.alternates.canonical);
  assert.equal(page.openGraph.title, page.title); assert.equal(page.twitter.title, page.title);
  assert.equal(page.openGraph.images[0].url, 'https://goalhint.com/brand/goal-hint-open-graph.png');
  for (const result of [{ data: null, error: 'unavailable' }, { data: { records: [], state: 'page-out-of-range' }, error: null }]) {
    assert.equal(feedMetadata(query({ page: '2' }), today, result, approved).robots.index, false);
  }
  const fixture = { data: { fixture: { homeTeam: { name: 'Home' }, awayTeam: { name: 'Away' }, forecast: null },
    route: { path: '/en/matches/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/home-vs-away' }, snapshot: null }, error: null };
  const known = matchDetailMetadata(fixture, 'en', false, approved);
  assert.equal(known.robots.index, false, 'A fixture without a published forecast is a thin page: valid, but noindex.');
  assert.match(known.title, /Goal Hint$/);
  const history = matchDetailMetadata(fixture, 'en', true, approved);
  assert.equal(history.robots.index, false); assert.equal(history.alternates.canonical, known.alternates.canonical);
  assert.equal(matchDetailMetadata({ data: null, error: 'unavailable' }, 'en', false, approved).robots.index, false);
  assert.equal((await createInformationMetadata('help', () => approved)()).robots.index, true);
  assert.equal((await createInformationMetadata('help', () => approved)({ searchParams: Promise.resolve({ market: 'total-goals' }) })).robots.index, false);
  for (const name of ['privacy', 'terms']) assert.equal((await createInformationMetadata(name, () => approved)()).robots.index, false);
  assert.equal((await createInformationMetadata('contact', () => approved)()).robots.index, true);
  assert.equal((await createInformationMetadata('contact', () => ({ deployment: 'staging', index: false }))()).robots.index, false);
  assert.equal((await createInformationMetadata('contact', () => approved)({ searchParams: Promise.resolve({ email: 'untrusted' }) })).robots.index, false);
});

test('disabled discovery never reads a database and robots allows noindex variants to be read', async () => {
  const routes = createDiscoveryRoutes({ policy: () => ({ deployment: 'staging', index: false }),
    reader: () => { throw new Error('Staging must not prepare a public sitemap.'); } });
  assert.deepEqual(await routes.sitemap(), []); assert.deepEqual(await routes.matches({ id: Promise.resolve('0') }), []);
  await assert.rejects(routes.matches({ id: Promise.resolve('1') }), RangeError);
  assert.deepEqual(await routes.matchIds(), [{ id: 0 }]);
  assert.deepEqual(await routes.robots(), { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/analytics'] } });
  assert.doesNotMatch(await routes.sitemapIndex(), /<loc>/, 'The prelaunch index advertises no URL.');
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
  const robots = await routes.robots(); assert.equal(robots.sitemap, 'https://goalhint.com/sitemap-index.xml');
  const index = await routes.sitemapIndex();
  for (const [, location] of index.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    assert.equal(new URL('.', location).pathname, '/', 'Advertised sitemap files must cover /en URLs without a Search Console scope override.');
  }
  assert.deepEqual([...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]), ['https://goalhint.com/sitemap.xml',
    'https://goalhint.com/sitemap-matches-0.xml', 'https://goalhint.com/sitemap-matches-1.xml', 'https://goalhint.com/sitemap-matches-2.xml',
    'https://goalhint.com/sitemap-archive-0.xml']);
  assert.match(index, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const urls = (await routes.sitemap()).map(row => row.url);
  assert.deepEqual(urls, ['https://goalhint.com/en', 'https://goalhint.com/en/help', 'https://goalhint.com/en/contact']);
  for (const id of ['-1', '01', '1.xml', '9999999999', 'x']) {
    assert.throws(() => sitemapPage(id), RangeError);
    await assert.rejects(routes.matches({ id: Promise.resolve(id) }), RangeError);
  }
  await assert.rejects(routes.matches({ id: Promise.resolve('3') }), RangeError);
  await assert.rejects(routes.matches({ id: Promise.resolve('999999999') }), RangeError);
  assert.deepEqual(reads, [2], 'Invalid shard IDs cannot cause a large-offset database read.');
  const failed = createDiscoveryRoutes({ policy: () => approved, reader: () => ({ inventory: async () => { throw new Error('reader failed'); } }) });
  await assert.rejects(failed.sitemapIndex(), /reader failed/);
  assert.equal((await failed.robots()).sitemap, 'https://goalhint.com/sitemap-index.xml', 'robots.txt no longer depends on a database read.');
});

test('supported WebSite structured data is minimal and safe inside an HTML script element', () => {
  const value = websiteStructuredData(); assert.equal(value.name, 'Goal Hint'); assert.equal(value.inLanguage, 'en');
  assert.deepEqual(Object.keys(value).sort(), ['@context', '@type', 'inLanguage', 'name', 'url']);
  const hostile = { ...value, name: '</script><script>unsafe()</script>' };
  const serialized = serializeStructuredData(hostile);
  assert.doesNotMatch(serialized, /</); assert.deepEqual(JSON.parse(serialized), hostile);
});

test('the home page stays indexable on an empty or uncovered day; dated archives and failed reads do not', () => {
  for (const state of ['no-fixtures', 'data-unavailable']) {
    const empty = { data: { records: [], state }, error: null };
    assert.equal(feedMetadata(query({}), today, empty, approved).robots.index, true, state);
    assert.equal(feedMetadata(query({ date: '2026-10-08' }), today, empty, approved).robots.index, false, state);
  }
  assert.equal(feedMetadata(query({}), today, { data: null, error: 'unavailable' }, approved).robots.index, false);
  assert.equal(feedMetadata(query({}), today, { data: { records: [], state: 'no-fixtures' }, error: null },
    { deployment: 'staging', index: false }).robots.index, false, 'The release gate still applies to the home page.');
});

test('match pages with a published forecast are indexable and lead their snippet with the stored pick', () => {
  const forecast = cardFixture();
  assert.equal(matchPageIndexable(forecast), true);
  assert.equal(matchPageIndexable({ forecast: null }), false);
  assert.equal(matchPageIndexable({ forecast: { markets: [] } }), false);
  const data = { fixture: forecast, route: { path: '/en/matches/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/example-home-fc-vs-example-away-fc' } };
  const metadata = matchDetailMetadata({ data, error: null }, 'en', false, approved);
  assert.equal(metadata.robots.index, true);
  assert.match(metadata.description, /^Example Home FC v Example Away FC, .+ \(EAT\)\. Match result \(1X2\) estimate: Example Home FC win, 54%\. /);
  assert.match(metadata.description, /Not a guarantee\.$/);
  assert.equal(metadata.openGraph.description, metadata.description);
  assert.equal(matchDetailMetadata({ data, error: null }, 'en', true, approved).robots.index, false, 'Revision variants stay noindex.');
  assert.equal(matchDetailMetadata({ data, error: null }, 'en', false, { deployment: 'staging', index: false }).robots.index, false);
  const totals = cardFixture();
  totals.forecast.markets = totals.forecast.markets.filter(item => item.market.family === 'total-goals');
  assert.match(matchDetailMetadata({ data: { ...data, fixture: totals }, error: null }, 'en', false, approved).description,
    /Over\/Under 2\.5 goals estimate: Under 2\.5, 70%/);
  const undated = cardFixture({ kickoffAt: null });
  assert.equal(matchDetailMetadata({ data: { ...data, fixture: undated }, error: null }, 'en', false, approved).description,
    'Stored predictions, sources and regulation-time results for Example Home FC v Example Away FC.');
});

test('home identity and breadcrumb structured data use canonical URLs and visible names only', () => {
  const home = homeStructuredData();
  assert.equal(home['@context'], 'https://schema.org');
  const [organization, website] = home['@graph'];
  assert.deepEqual(organization, { '@type': 'Organization', '@id': 'https://goalhint.com/en#organization', name: 'Goal Hint',
    url: 'https://goalhint.com/en', logo: 'https://goalhint.com/brand/goal-hint-app-icon-512.png' });
  assert.equal(website['@type'], 'WebSite'); assert.equal(website.url, 'https://goalhint.com/en');
  assert.deepEqual(website.publisher, { '@id': organization['@id'] });
  assert.throws(() => breadcrumbStructuredData([{ name: 'Only' }]), RangeError);
  assert.throws(() => breadcrumbStructuredData([{ name: 'Home', path: 'https://evil.example/' }, { name: 'Here' }]), RangeError);
  const fixture = cardFixture();
  const crumbs = matchStructuredData({ fixture }, 'en');
  assert.equal(crumbs['@type'], 'BreadcrumbList');
  assert.deepEqual(crumbs.itemListElement.map(item => item.position), [1, 2, 3]);
  assert.deepEqual(crumbs.itemListElement[0], { '@type': 'ListItem', position: 1, name: 'Goal Hint', item: 'https://goalhint.com/en' });
  assert.match(crumbs.itemListElement[1].item, /^https:\/\/goalhint\.com\/en\/predictions\/\d{4}-\d{2}-\d{2}$/);
  assert.match(crumbs.itemListElement[1].name, /^Predictions for /);
  assert.deepEqual(crumbs.itemListElement[2], { '@type': 'ListItem', position: 3, name: 'Example Home FC v Example Away FC' });
  assert.equal(matchStructuredData({ fixture: { ...fixture, kickoffAt: null } }, 'en').itemListElement.length, 2);
  assert.doesNotMatch(serializeStructuredData(matchStructuredData({ fixture: { ...fixture,
    homeTeam: { ...fixture.homeTeam, name: '</script><script>x()</script>' } } }, 'en')), /</);
});

test('the sitemap index escapes locations and the dated feed heading names its day', () => {
  assert.match(sitemapIndexXml(['https://goalhint.com/a?b=1&c=<2>']), /<loc>https:\/\/goalhint\.com\/a\?b=1&amp;c=&lt;2&gt;<\/loc>/);
  assert.equal(sitemapIndexXml([]), '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</sitemapindex>\n');
  const messages = createMessages('en');
  assert.equal(feedHeading(query({}), today, messages), "Today's Matches");
  assert.equal(feedHeading(query({ date: '2026-10-08' }), today, messages), 'Football Predictions · Thu, Oct 8, 2026');
  assert.equal(feedHeading(query({ when: 'next-7-days' }), today, messages), 'Football Predictions');
});
