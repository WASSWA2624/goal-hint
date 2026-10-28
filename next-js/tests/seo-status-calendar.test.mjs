import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parseReportingDate, parseUtcInstant } from '../src/domain/calendar.ts';
import { adjacentDays, archiveWindowDays, dayLinkRel, emptyArchiveIsMissing } from '../src/domain/feed-date-navigation.ts';
import { MatchFeedError } from '../src/server/matches/feed-error.ts';
import { isDocumentRequest, PublicReadUnavailableError } from '../src/server/seo/read-status.ts';
import { fullAccess } from './helpers/full-access.ts';
import { liveDetail } from './helpers/live-refresh-fixtures.mjs';

const today = parseReportingDate('2026-10-26'), at = parseUtcInstant('2026-10-26T09:00:00Z');
const day = (value) => ({ startDate: parseReportingDate(value), dayCount: 1 });

test('an empty single day is missing only beyond 31 days of today; stored fixtures keep any date', () => {
  assert.equal(archiveWindowDays, 31);
  for (const date of ['2026-10-26', '2026-09-25', '2026-11-26', '2026-10-01']) assert.equal(emptyArchiveIsMissing(day(date), today, 0), false, date);
  for (const date of ['2026-09-24', '2026-11-27', '2099-01-01', '1999-01-01', '1000-01-01', '9999-12-31']) {
    assert.equal(emptyArchiveIsMissing(day(date), today, 0), true, date);
    assert.equal(emptyArchiveIsMissing(day(date), today, 1), false, date);
  }
  assert.equal(emptyArchiveIsMissing(day('1999-01-01'), today, 12), false);
  // Ranges keep their empty state, whatever their dates.
  for (const startDate of ['1999-01-01', '2099-01-01', '2026-10-20']) {
    assert.equal(emptyArchiveIsMissing({ startDate: parseReportingDate(startDate), dayCount: 7 }, today, 0), false, startDate);
  }
});

test('strip day links beyond 31 days ahead are nofollow; past days stay followable', () => {
  assert.equal(dayLinkRel(parseReportingDate('2026-11-26'), today), undefined);
  assert.equal(dayLinkRel(parseReportingDate('2026-11-27'), today), 'nofollow');
  assert.equal(dayLinkRel(parseReportingDate('2099-01-01'), today), 'nofollow');
  for (const date of ['2026-10-26', '2026-10-25', '2026-09-24', '1999-01-01']) assert.equal(dayLinkRel(parseReportingDate(date), today), undefined, date);
  assert.equal(dayLinkRel(parseReportingDate('9999-12-31'), parseReportingDate('9999-12-20')), undefined);
});

test('strip blocks stop at the calendar ends instead of throwing', () => {
  assert.deepEqual(adjacentDays(today, 3), ['2026-10-27', '2026-10-28', '2026-10-29']);
  assert.deepEqual(adjacentDays(today, -3), ['2026-10-23', '2026-10-24', '2026-10-25']);
  // The old block threw past 9999-12-31, so /en/predictions/9999-12-02 through -31 answered 500.
  for (const anchor of ['9999-12-02', '9999-12-30', '9999-12-31']) {
    const date = parseReportingDate(anchor), days = [...adjacentDays(date, -1), date, ...adjacentDays(date, 30)];
    assert.equal(days.at(-1), '9999-12-31', anchor); assert.equal(new Set(days).size, days.length);
  }
  assert.deepEqual(adjacentDays(parseReportingDate('9999-12-31'), 30), []);
  assert.deepEqual(adjacentDays(parseReportingDate('1000-01-01'), -1), []);
  assert.deepEqual(adjacentDays(parseReportingDate('1000-01-03'), -30), ['1000-01-01', '1000-01-02']);
  assert.equal(adjacentDays(parseReportingDate('2026-01-15'), -30).length, 30);
});

test('client navigations are recognised by their fetch metadata; crawlers and address-bar loads are document requests', async () => {
  const request = (values) => isDocumentRequest(async () => new Headers(values));
  assert.equal(await request({}), true);
  assert.equal(await request({ 'user-agent': 'Googlebot/2.1', accept: 'text/html' }), true);
  assert.equal(await request({ 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' }), true);
  for (const values of [{ rsc: '1' }, { 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors' }]) {
    assert.equal(await request(values), false, JSON.stringify(values));
  }
});

// The route factories are TSX with bundler-style imports. Resolve `@/` and extensionless paths, compile JSX, and replace
// the shell clock and page views with stubs, so each factory's own status decisions can be observed directly.
const source = new URL('../src/', import.meta.url).href;
const navigation = new URL('../node_modules/next/dist/client/components/navigation.react-server.js', import.meta.url).href;
const stubs = { './public-shell': 'data:text/javascript,export const getShellInstant = async () => globalThis.seoStatusInstant;',
  './match-feed-page': 'data:text/javascript,export function MatchFeedPage() { return null; }',
  './match-detail-page': 'data:text/javascript,export function MatchDetailPage() { return null; }' };
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(source) && stubs[specifier]) return { url: stubs[specifier], shortCircuit: true };
    if (specifier === 'next/navigation') return { url: navigation, shortCircuit: true };
    const target = specifier.startsWith('@/') ? source + specifier.slice(2) : specifier;
    try { return next(target, context); } catch (error) {
      if (!target.startsWith('.') && !target.startsWith('file:')) throw error;
      for (const extension of ['.ts', '.tsx']) { try { return next(target + extension, context); } catch { /* Try the next extension. */ } }
      throw error;
    }
  },
  load(url, context, next) {
    if (!url.startsWith(source) || !url.endsWith('.tsx')) return next(url, context);
    const path = fileURLToPath(url), compilerOptions = { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 };
    return { format: 'module', source: ts.transpileModule(readFileSync(path, 'utf8'), { fileName: path, compilerOptions }).outputText, shortCircuit: true };
  },
});
globalThis.seoStatusInstant = at;
const { createFeedRoute } = await import('../src/app/_components/feed-route.tsx');
const { createMatchDetailRoute } = await import('../src/app/_components/match-detail-route.tsx');

const indexing = () => ({ deployment: 'production', index: true }), closed = () => ({ deployment: 'staging', index: false });
const fullDocument = async () => true, rscRequest = () => isDocumentRequest(async () => new Headers({ rsc: '1' }));
const unavailable = async () => { throw new Error('mysql://private/connection-refused'); };
const stored = (knownFixtures) => async () => ({ records: [], total: 0, state: knownFixtures ? 'no-filter-matches' : 'no-fixtures', coverage: { knownFixtures } });
const props = (route, query = {}) => ({ params: Promise.resolve({ locale: 'en', ...route }), searchParams: Promise.resolve(query) });
const view = (element, name) => [element.props.children].flat().find((child) => child?.type?.name === name)?.props;
const missing = (error) => error?.digest === 'NEXT_HTTP_ERROR_FALLBACK;404';
const failed = (error) => error instanceof PublicReadUnavailableError;
function feed({ dated = false, read = unavailable, policy = indexing, document = fullDocument } = {}) {
  return createFeedRoute({ dated, read, policy, document, instant: async () => at, resolveAccess: fullAccess });
}

test('an indexable feed whose stored read fails answers 5xx to full document requests', async () => {
  for (const [dated, route, query] of [[false, {}, {}], [false, {}, { page: '2' }], [true, { date: '2026-10-20' }, {}], [false, {}, { when: 'today' }]]) {
    const page = feed({ dated });
    // Full-access pages default to a predictions filter; request the indexable all-fixture collection explicitly.
    const indexable = { ...query, picks: 'all' };
    await assert.rejects(page.Page(props(route, indexable)), failed, JSON.stringify({ route, indexable }));
    await assert.rejects(page.generateMetadata(props(route, indexable)), failed);
  }
});

test('client navigations, non-indexing deployments, variants and busy searches keep the 200 in-page retry', async () => {
  for (const [options, query] of [[{ document: rscRequest }, { picks: 'all' }], [{ document: async () => false }, { picks: 'all' }], [{ policy: closed }, { picks: 'all' }],
    [{}, {}], [{}, { status: 'finished' }], [{}, { from: '2026-10-20', to: '2026-10-22' }]]) {
    const page = feed(options), element = await page.Page(props({}, query));
    assert.equal(view(element, 'MatchFeedPage').result.error, 'unavailable', JSON.stringify(query));
    assert.equal((await page.generateMetadata(props({}, query))).robots.index, false);
  }
  const busy = feed({ read: async () => { throw new MatchFeedError('rate-limited', 5); } });
  assert.equal(view(await busy.Page(props({}, { q: 'Arsenal' })), 'MatchFeedPage').result.error, 'rate-limited');
});

test('an empty date beyond the archive window is 404 on both feed routes; nearby, stored and ranged dates render', async () => {
  for (const [dated, route, query] of [[true, { date: '2026-09-24' }, {}], [true, { date: '2099-01-01' }, {}], [true, { date: '1999-01-01' }, {}],
    [true, { date: '2026-11-27' }, { status: 'finished', league: '39' }], [true, { date: '9999-12-20' }, {}], [false, {}, { date: '2099-01-01' }]]) {
    const page = feed({ dated, read: stored(0) });
    await assert.rejects(page.Page(props(route, query)), missing, JSON.stringify({ route, query }));
    await assert.rejects(page.generateMetadata(props(route, query)), missing);
  }
  for (const [route, query, known] of [[{ date: '2026-09-25' }, {}, 0], [{ date: '2026-11-26' }, {}, 0], [{ date: '2026-10-26' }, {}, 0],
    [{ date: '1999-01-01' }, {}, 4], [{ date: '1999-01-01' }, { to: '1999-01-07' }, 0], [{ date: '9999-12-20' }, {}, 2]]) {
    const element = await feed({ dated: true, read: stored(known) }).Page(props(route, query));
    assert.equal(view(element, 'MatchFeedPage').result.data.coverage.knownFixtures, known, JSON.stringify({ route, query }));
  }
  // Strip, calendar and adjacent-day taps are client navigations: they keep the in-feed empty state and the strip.
  for (const [dated, route, query] of [[true, { date: '2099-01-01' }, {}], [true, { date: '1999-01-01' }, {}], [false, {}, { date: '2026-09-24' }]]) {
    for (const document of [rscRequest, async () => false]) {
      const page = feed({ dated, read: stored(0), document }), element = await page.Page(props(route, query));
      assert.equal(view(element, 'MatchFeedPage').result.data.coverage.knownFixtures, 0, JSON.stringify({ route, query }));
      assert.equal((await page.generateMetadata(props(route, query))).robots.index, false);
    }
  }
  // A failed far read is never mistaken for an empty date.
  const element = await feed({ dated: true, policy: closed }).Page(props({ date: '2099-01-01' }));
  assert.equal(view(element, 'MatchFeedPage').result.error, 'unavailable');
});

test('only the feed, archive and match routes carry the matches recovery boundary', () => {
  const app = new URL('../src/app/', import.meta.url), file = (path) => readFileSync(new URL(path, app), 'utf8');
  assert.equal(existsSync(new URL('[locale]/error.tsx', app)), false);
  assert.match(file('[locale]/matches/error.tsx'), /^"use client";[\s\S]*retry\(\)[\s\S]*href="\/en\/matches"[\s\S]*href="\/en"/u);
  assert.match(file('[locale]/predictions/error.tsx'), /^"use client";\s+export \{ default \} from "\.\.\/matches\/error";\s*$/u);
});

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', revision = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', slug = 'home-club-v-away-club';
const match = { fixture: { fixtureId: id, homeTeam: { name: 'Home Club' }, awayTeam: { name: 'Away Club' }, status: 'scheduled', kickoffAt: null, forecast: null },
  route: { fixtureId: id, slug, path: `/en/matches/${id}/${slug}` }, snapshot: null };
const noInsights = async () => { throw new MatchFeedError('unavailable'); };
function detail({ read = unavailable, policy = indexing, document = fullDocument } = {}) {
  return createMatchDetailRoute(read, policy, noInsights, fullAccess, async () => null, document);
}

test('an indexable match page whose current read fails answers 5xx to full document requests only', async () => {
  const page = detail();
  for (const query of [{}, { section: 'markets' }]) {
    await assert.rejects(page.Page(props({ fixtureId: id, slug }, query)), failed, JSON.stringify(query));
    await assert.rejects(page.generateMetadata(props({ fixtureId: id, slug }, query)), failed);
  }
  for (const options of [{ document: rscRequest }, { policy: closed }, { read: async () => { throw new MatchFeedError('rate-limited'); } }]) {
    const element = await detail(options).Page(props({ fixtureId: id, slug }));
    assert.match(view(element, 'MatchDetailPage').result.error, /^(?:unavailable|rate-limited)$/u);
    assert.equal((await detail(options).generateMetadata(props({ fixtureId: id, slug }))).robots.index, false);
  }
  // A revision variant of a failed match keeps its 200 retry state.
  const variant = await page.Page(props({ fixtureId: id, slug }, { revision }));
  assert.equal(view(variant, 'MatchDetailPage').result.error, 'unavailable');
});

test('a failed revision-history read keeps the inline history retry on an indexable match page', async () => {
  const read = async (_, parameters = new URLSearchParams()) => { if (parameters.size) throw new MatchFeedError('unavailable'); return match; };
  const page = detail({ read }), element = await page.Page(props({ fixtureId: id, slug }, { revision, limit: '20' }));
  const rendered = view(element, 'MatchDetailPage');
  assert.equal(rendered.result.data.fixture.fixtureId, id); assert.equal(rendered.historyResult.error, 'unavailable');
  assert.equal(rendered.historyQuery, `limit=20&revision=${revision}`);
  assert.equal((await page.generateMetadata(props({ fixtureId: id, slug }, { revision }))).alternates.canonical, `https://goalhint.com${match.route.path}`);
});

test('a slow optional insight read cannot hold the primary match page or metadata', async () => {
  let finishInsights, reads = 0, rendered;
  const pending = new Promise(resolve => { finishInsights = resolve; });
  const page = createMatchDetailRoute(async () => match, indexing, async () => {
    reads++;
    await pending;
    throw new MatchFeedError('unavailable');
  }, fullAccess, async () => null, fullDocument);
  const rendering = page.Page(props({ fixtureId: id, slug })).then(element => { rendered = element; return element; });
  await new Promise(setImmediate);
  assert.ok(rendered, 'Primary content must return while insights are still pending.');
  const projection = view(rendered, 'MatchDetailPage');
  assert.equal(projection.result.data.fixture.fixtureId, id);
  assert.ok(projection.previewPromise instanceof Promise);
  assert.equal(reads, 1);
  assert.equal((await page.generateMetadata(props({ fixtureId: id, slug }))).alternates.canonical, `https://goalhint.com${match.route.path}`);
  assert.equal(reads, 1, 'Metadata must not start an optional insights read.');
  finishInsights();
  assert.equal(await projection.previewPromise, null, 'A failed preview preserves the primary view and section retries.');
  await rendering;
});

test('the detail price lookup overlaps the primary read and still follows viewer entitlement', async () => {
  const current = liveDetail();
  let finishRead, offered = 0;
  const pending = new Promise(resolve => { finishRead = resolve; });
  const offer = { priceUgx: 1000, durationDays: 7 };
  const route = { fixtureId: current.fixture.fixtureId, slug: current.route.slug };
  const page = createMatchDetailRoute(async () => { await pending; return current; }, indexing, noInsights,
    async () => ({ tier: 'free', signedIn: false, mode: 'on' }), async () => { offered++; return offer; }, fullDocument);
  const rendering = page.Page(props(route));
  await new Promise(setImmediate);
  assert.equal(offered, 1, 'Public pricing must begin before the primary database read completes.');
  finishRead();
  const projection = view(await rendering, 'MatchDetailPage');
  assert.deepEqual(projection.offer, offer);
  assert.equal(projection.result.data.access.tier, 'free');
  await projection.previewPromise;

  const full = createMatchDetailRoute(async () => current, indexing, noInsights, fullAccess,
    async () => { throw new Error('Full access must not query the public offer.'); }, fullDocument);
  const fullProjection = view(await full.Page(props(route)), 'MatchDetailPage');
  assert.equal(fullProjection.offer, null);
  await fullProjection.previewPromise;
});
