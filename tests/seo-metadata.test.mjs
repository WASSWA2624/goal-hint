import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { NextRequest } from 'next/server.js';
import { homeStructuredData } from '../src/domain/discovery.ts';
import { feedQueryKeys, parseFeedQuery } from '../src/domain/feed-query.ts';
import { parseReportingDate } from '../src/domain/calendar.ts';
import { isLocaleCaseVariant } from '../src/i18n/locales.ts';
import { createMessages } from '../src/i18n/messages.ts';
import { bestSlipsMetadata, createInformationMetadata, feedMetadata, notFoundMetadata, pageMetadata } from '../src/server/seo/metadata.ts';
import { createDiscoveryProxy } from '../src/server/seo/proxy.ts';

// Next bundles next/navigation's server build for server modules; Node needs the same alias to load home-query.ts.
registerHooks({ resolve(specifier, context, next) {
  return next(specifier === 'next/navigation' ? 'next/dist/client/components/navigation.react-server.js' : specifier, context);
} });
const { homeBrowseLinks, redirectLegacyFeedQuery } = await import('../src/server/seo/home-query.ts');

const today = parseReportingDate('2026-10-09');
const approved = { deployment: 'production', index: true }, staging = { deployment: 'staging', index: false };
const populated = { data: { records: [{}], state: 'ready' }, error: null };
const query = values => parseFeedQuery(values, { today });
const messages = createMessages();
const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const digest = (run) => { try { run(); } catch (error) { return error.digest; } return null; };

test('Open Graph uses a language_TERRITORY locale and the Twitter image carries the same alt text', async () => {
  for (const metadata of [feedMetadata(query({}), today, populated, approved), feedMetadata(query({ date: '2026-10-08' }), today, populated, approved),
    bestSlipsMetadata('en', {}, () => approved), await createInformationMetadata('help', () => approved)({}), notFoundMetadata(),
    pageMetadata({ title: 'T', description: 'D', path: '/en/slips' })]) {
    assert.equal(metadata.openGraph.locale, 'en_US');
    assert.deepEqual(metadata.twitter.images, [{ url: 'https://goalhint.com/brand/goal-hint-open-graph.png', alt: messages.text('metadata.socialAlt') }]);
    assert.equal(metadata.twitter.images[0].alt, metadata.openGraph.images[0].alt);
  }
  // The root layout defaults use the same locale and alt; Node cannot load the layout's TSX.
  const layout = source('app/layout.tsx');
  assert.match(layout, /openGraph: \{[^}]*locale: socialLocale/u);
  assert.doesNotMatch(layout, /locale: "en"/u);
  assert.match(layout, /twitter: \{ card: "summary_large_image", images: \[\{ url: canonicalUrl\("\/brand\/goal-hint-open-graph\.png"\), alt: messages\.text\("metadata\.socialAlt"\) \}\] \}/u);
});

test('missing pages have their own noindex title and social tags and no canonical', () => {
  const metadata = notFoundMetadata(), title = messages.text('notFound.metadataTitle');
  assert.equal(metadata.title, title); assert.equal(metadata.openGraph.title, title); assert.equal(metadata.twitter.title, title);
  assert.equal(metadata.description, messages.text('notFound.description')); assert.equal(metadata.openGraph.description, metadata.description);
  assert.notEqual(metadata.openGraph.title, messages.text('metadata.homeTitle'), 'A 404 must not inherit the feed og:title.');
  assert.equal(metadata.alternates, undefined); assert.equal(metadata.openGraph.url, undefined);
  assert.deepEqual(metadata.robots, { index: false, follow: true });
  assert.match(source('app/not-found.tsx'), /^export const metadata = notFoundMetadata\(\);\r?$/mu);
});

test('the home title carries the brand the WebSite structured data names, with a separate factual description', () => {
  const site = homeStructuredData()['@graph'].find(node => node['@type'] === 'WebSite').name;
  const home = bestSlipsMetadata('en', {}, () => approved);
  assert.equal(home.title, 'Best Slips — Daily football prediction slips | Goal Hint');
  assert.ok(home.title.startsWith('Best Slips') && home.title.endsWith(` | ${site}`));
  assert.equal(home.openGraph.title, home.title); assert.equal(home.twitter.title, home.title);
  assert.equal(home.description, messages.text('bestSlips.metadataDescription'));
  assert.notEqual(home.description, messages.text('bestSlips.description'), 'The visible lede stays separate.');
  assert.match(home.description, /football prediction/u); assert.match(home.description, /results/u);
  assert.equal(home.alternates.canonical, 'https://goalhint.com/en'); assert.equal(home.robots.index, true);
  assert.equal(bestSlipsMetadata('en', {}, () => staging).robots.index, false);
  assert.match(source('app/_components/best-slips-route.tsx'), /return bestSlipsMetadata\(locale, query, policy\);/u);
});

test('an unavailable home links to nearby dated archives, help and results; available slips render nothing extra', () => {
  const day = parseReportingDate('2026-10-26');
  for (const state of ['odds-unavailable', 'model-unavailable', 'ready']) {
    assert.deepEqual(homeBrowseLinks({ day, state, slips: [] }, 'en'), [['/en/predictions/2026-10-25', 'feed.date.yesterday'],
      ['/en/predictions/2026-10-26', 'feed.date.today'], ['/en/predictions/2026-10-27', 'feed.date.tomorrow'],
      ['/en/help', 'navigation.help'], ['/en/performance', 'performance.title']], state);
  }
  // Month and year boundaries follow the reporting calendar.
  assert.deepEqual(homeBrowseLinks({ day: parseReportingDate('2026-12-31'), slips: [] }, 'en').slice(0, 3).map(([href]) => href),
    ['/en/predictions/2026-12-30', '/en/predictions/2026-12-31', '/en/predictions/2027-01-01']);
  assert.deepEqual(homeBrowseLinks({ day, state: 'ready', slips: [{}] }, 'en'), []);
  for (const [, key] of homeBrowseLinks({ day, slips: [] }, 'en')) assert.doesNotMatch(messages.text(key), /\bpicks?\b/iu, key);
  assert.equal(messages.text('bestSlips.browseTitle'), 'Browse predictions');
  assert.match(source('app/_components/best-slips-route.tsx'), /const browse = homeBrowseLinks\(result, locale\);[\s\S]*\{browse\.length > 0 && </u);
});

test('home query variants keep the canonical but are noindex; only feed keys permanently redirect to the feed', () => {
  for (const variant of [{ ref: 'whatsapp' }, { igshid: 'x' }, { page: '2' }]) {
    const metadata = bestSlipsMetadata('en', variant, () => approved);
    assert.equal(metadata.robots.index, false, JSON.stringify(variant));
    assert.equal(metadata.alternates.canonical, 'https://goalhint.com/en');
  }
  assert.equal(digest(() => redirectLegacyFeedQuery('en', { page: '2', league: ['a', 'b'] })), 'NEXT_REDIRECT;replace;/en/matches?page=2&league=a&league=b;308;');
  // Mixed queries keep every parameter, so the feed's strict validation still sees what was asked for.
  assert.equal(digest(() => redirectLegacyFeedQuery('en', { q: 'Home Club', ref: 'x' })), 'NEXT_REDIRECT;replace;/en/matches?q=Home+Club&ref=x;308;');
  for (const key of feedQueryKeys) assert.match(digest(() => redirectLegacyFeedQuery('en', { [key]: '1' })), /^NEXT_REDIRECT;replace;\/en\/matches\?.+;308;$/u, key);
  for (const variant of [{}, { ref: 'whatsapp' }, { igshid: 'x' }, { Page: '2' }, { empty: undefined }]) {
    assert.equal(digest(() => redirectLegacyFeedQuery('en', variant)), null, JSON.stringify(variant));
  }
  const route = source('app/_components/best-slips-route.tsx');
  assert.match(route, /redirectLegacyFeedQuery\(locale, await searchParams\);\s+const viewer = await access\(\)/u);
  assert.doesNotMatch(route, /\bredirect\(/u, 'The legacy feed move is never a temporary redirect.');
});

test('share and click identifiers without an analytics network 308 to the clean URL with no fragment', () => {
  const proxy = createDiscoveryProxy(() => approved);
  const keys = ['ttclid', 'twclid', 'li_fat_id', 'igshid', 'igsh', 'mc_cid', 'mc_eid', 'yclid', '_gl', 'srsltid', 'IGSHID'];
  for (const path of ['/en/matches', '/en/predictions/2026-10-09', '/en/matches/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/home-vs-away', '/en']) {
    for (const key of keys) {
      const response = proxy(new NextRequest(`https://goalhint.com${path}?${key}=shared&page=2`));
      assert.equal(response.status, 308, `${path} ${key}`);
      assert.equal(response.headers.get('location'), `https://goalhint.com${path}?page=2`, `${path} ${key}`);
    }
    const all = proxy(new NextRequest(`https://goalhint.com${path}?${keys.map(key => `${key}=1`).join('&')}`));
    assert.equal(all.headers.get('location'), `https://goalhint.com${path}`);
  }
  assert.equal(proxy(new NextRequest('https://goalhint.com/en/matches?igshid=x&unsupported=1')).headers.get('location'),
    'https://goalhint.com/en/matches?unsupported=1', 'Unknown application parameters still reach strict validation.');
  assert.equal(proxy(new NextRequest('https://goalhint.com/en/matches?unsupported=1')).headers.get('location'), null);
});

test('case-only variants of the published locale move permanently; unpublished languages stay temporary', () => {
  for (const [path, expected] of [['/EN/contact', true], ['/En/matches', true], ['/EN', true], ['/eN/help?x=1', true],
    ['/en', false], ['/en/contact', false], ['/fr', false], ['/EN-us/help', false], ['/ENG', false], ['/', false], ['', false]]) {
    assert.equal(isLocaleCaseVariant(path), expected, path);
  }
  const proxy = createDiscoveryProxy(() => approved);
  for (const [path, status, location] of [['/EN/contact', 308, '/en/contact'], ['/En/matches', 308, '/en/matches'], ['/EN', 308, '/en'],
    ['/EN/help?igshid=x', 308, '/en/help'], ['/fr/help', 307, '/en/help'], ['/en-US/help', 307, '/en/help']]) {
    const response = proxy(new NextRequest(`https://goalhint.com${path}`));
    assert.equal(response.status, status, path);
    assert.equal(response.headers.get('location'), `https://goalhint.com${location}`, path);
  }
});

test('feed, archive, home and default descriptions describe what anonymous visitors see', () => {
  const descriptions = [feedMetadata(query({}), today, populated, approved), feedMetadata(query({ page: '2' }), today, populated, approved),
    feedMetadata(query({ date: '2026-10-08' }), today, populated, approved), bestSlipsMetadata('en')].map(metadata => metadata.description);
  descriptions.push(messages.text('metadata.description'));
  for (const description of descriptions) {
    assert.doesNotMatch(description, /\bpicks?\b|auditable|revision history|original forecast sources|estimated probabilities|available analysis/iu, description);
    assert.match(description, /subscribers/u, description);
  }
  assert.equal(descriptions[2], 'Football matches, kickoff times, scores and results for Thursday, October 8, 2026 in East Africa Time, with Goal Hint predictions for subscribers.');
  assert.match(descriptions[0], /East Africa Time/u);
});
