import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parseReportingDate, parseUtcInstant } from '../src/domain/calendar.ts';
import { adjacentDays, archiveWindowDays, dayLinkRel, emptyArchiveIsMissing } from '../src/domain/feed-date-navigation.ts';
import { parseFeedQuery, resolveFeedDates } from '../src/domain/feed-query.ts';
import { feedDiscovery } from '../src/domain/discovery.ts';
import { MatchFeedError } from '../src/server/matches/feed-error.ts';
import { isBrowserDocumentRequest, isDocumentRequest, PublicReadUnavailableError } from '../src/server/seo/read-status.ts';
import { fullAccess } from './helpers/full-access.ts';
import { liveDetail } from './helpers/live-refresh-fixtures.mjs';
import { fixture } from './helpers/client-state-fixtures.mjs';

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

test('only browser document navigation enters the progressive Matches route', async () => {
  const request = (values) => isBrowserDocumentRequest(async () => new Headers(values));
  const chrome = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36';
  const navigation = { 'user-agent': chrome, 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' };
  assert.equal(await request(navigation), true);
  const audit = chrome.replace('Chrome/', 'HeadlessChrome/') + ' Chrome-Lighthouse';
  assert.equal(await request({ ...navigation, 'user-agent': audit }), true);
  for (const changes of [{ 'user-agent': 'Googlebot/2.1' }, { 'user-agent': `${audit} Googlebot/2.1` }, { rsc: '1' },
    { 'sec-fetch-dest': 'empty' }, { 'sec-fetch-mode': 'same-origin' }]) {
    assert.equal(await request({ ...navigation, ...changes }), false);
  }
  assert.equal(await request({ 'user-agent': chrome }), false);
});

test('Matches streams through the installed service worker document request shape', async () => {
  const request = (values) => isBrowserDocumentRequest(async () => new Headers(values));
  const navigation = {
    'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/158.0.0.0 Mobile Safari/537.36',
    'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'same-origin', 'sec-fetch-site': 'same-origin',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };
  assert.equal(await request(navigation), true);
  for (const changes of [{ accept: '*/*' }, { accept: 'text/x-component' }, { rsc: '1' },
    { 'sec-fetch-mode': 'cors' }, { 'sec-fetch-site': 'cross-site' }, { 'user-agent': 'Googlebot/2.1' }]) {
    assert.equal(await request({ ...navigation, ...changes }), false);
  }
});

// The route factories are TSX with bundler-style imports. Resolve `@/` and extensionless paths, compile JSX, and replace
// the shell clock and page views with stubs, so each factory's own status decisions can be observed directly.
const source = new URL('../src/', import.meta.url).href;
const navigation = new URL('../node_modules/next/dist/client/components/navigation.react-server.js', import.meta.url).href;
const stubs = { './public-shell': 'data:text/javascript,export const getShellInstant = async () => globalThis.seoStatusInstant;',
  '@/components/navigation/navigation-progress': 'data:text/javascript,export function AppLoading() { return null; }',
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

test('Matches page defaults reach the stored read while retaining viewer eligibility and explicit choices', async () => {
  for (const tier of ['free', 'full']) {
    for (const parameters of [{}, { status: 'finished' }, { when: 'next-7-days' }, { when: 'last-30-days', sort: 'kickoff', picks: 'all' }]) {
      let storedQuery;
      const page = createFeedRoute({ instant: async () => at, policy: closed, document: fullDocument,
        resolveAccess: async () => ({ tier, signedIn: false, mode: tier === 'full' ? 'off' : 'free' }),
        read: async (input) => { storedQuery = parseFeedQuery(input, { today }); throw new MatchFeedError('rate-limited'); } });
      const rendered = view(await page.Page(props({}, parameters)), 'MatchFeedPage');
      assert.deepEqual(storedQuery, rendered.query, 'The rendered controls and stored read use the same effective query.');
      assert.deepEqual(storedQuery.dates, { kind: parameters.when ?? 'today' });
      assert.deepEqual(storedQuery.sort, { by: parameters.sort ?? 'live-first', direction: 'desc' });
      assert.equal(storedQuery.picks, parameters.picks ?? 'all');
      assert.equal(rendered.result.error, 'rate-limited');
    }
  }
});

test('only an explicit recommendation filter narrows the page and streamed summary to recommended picks', async () => {
  for (const [parameters, predicted, expected] of [
    [{}, 34, 'all'], [{ country: 'England' }, 34, 'all'], [{ page: '2' }, 34, 'all'],
    [{ picks: 'only' }, 0, 'only'], [{ market: 'total-goals' }, 0, 'all'],
    [{ result: 'won' }, 0, 'all'], [{ when: 'yesterday' }, 0, 'all'],
  ]) {
    const queries = [], summaries = [];
    const page = createFeedRoute({ instant: async () => at, policy: closed, document: fullDocument,
      resolveAccess: fullAccess, read: async (input) => {
        queries.push(input);
        const total = predicted;
        return { records: [], total, state: total ? 'ready' : 'no-filter-matches', coverage: { knownFixtures: 192 } };
      }, readSummary: async (scope) => { summaries.push(scope); throw new Error('test stream'); } });
    const rendered = view(await page.Page(props({}, parameters)), 'MatchFeedPage');
    assert.equal(rendered.query.picks, expected);
    assert.equal(rendered.result.data.total, predicted);
    assert.deepEqual(queries.map((input) => input.get('picks')), [expected === 'only' ? 'only' : null]);
    assert.equal(queries.at(-1).get('country'), parameters.country ?? null);
    const seed = await rendered.summary;
    assert.equal(new URL(seed.href, 'https://example.test').searchParams.get('picks'), expected === 'only' ? 'only' : null);
    assert.equal(summaries.at(-1).get('picks'), expected === 'only' ? 'only' : null);
  }
});

test('the list can seed zero pick outcomes for its own generation without starting a separate audit', async () => {
  const access = { tier: 'full', signedIn: false }, performanceVersion = 'a'.repeat(64);
  let summaryReads = 0;
  const page = createFeedRoute({ instant: async () => at, policy: closed, document: fullDocument,
    resolveAccess: fullAccess, read: async (input) => {
      const imported = input.get('when') !== 'tomorrow', total = imported && !input.has('result') ? 192 : 0;
      return { records: [], total, state: !imported ? 'data-unavailable' : total ? 'ready' : 'no-filter-matches',
        coverage: { knownFixtures: imported ? 192 : 0, matchingWithMarket: total ? 34 : 0, matchingWithPerformancePick: 0 },
        performanceVersion, asOf: at, access };
    }, readSummary: async () => { summaryReads++; throw new Error('audit unavailable'); } });
  const feed = view(await page.Page(props({}, { result: 'all' })), 'MatchFeedPage');
  const seed = await feed.summary;
  assert.deepEqual(seed.reply, { performance: { total: 192, won: 0, lost: 0, pending: 0, void: 0, cancelled: 0, unavailable: 192 },
    paginationVersion: performanceVersion, asOf: at, access });
  assert.equal(summaryReads, 0);
  const filtered = view(await page.Page(props({}, { result: 'won' })), 'MatchFeedPage');
  assert.equal((await filtered.summary).reply, null);
  const missingCoverage = view(await page.Page(props({}, { when: 'tomorrow' })), 'MatchFeedPage');
  assert.equal((await missingCoverage.summary).reply, null);
});

test('the paginated browsing feed keeps its retry and noindex metadata when a stored read fails', async () => {
  for (const [dated, route, query] of [[false, {}, {}], [false, {}, { page: '2' }], [true, { date: '2026-10-20' }, {}], [false, {}, { when: 'today' }]]) {
    const page = feed({ dated });
    const parameters = { ...query, picks: 'all', sort: 'kickoff', country: 'England' };
    const rendered = view(await page.Page(props(route, parameters)), 'MatchFeedPage');
    // Filtered variants render the in-page retry without being indexable.
    assert.equal(feedDiscovery(rendered.query, today).eligible, false);
    assert.equal(rendered.result.error, 'unavailable');
    assert.equal((await page.generateMetadata(props(route, parameters))).robots.index, false);
  }
});

test('the default Today collection uses its indexable document recovery', async () => {
  await assert.rejects(feed().Page(props({})), failed);
  await assert.rejects(feed().generateMetadata(props({})), failed);
});

test('browser metadata uses only the canonical route, while a crawler reads the actual list for its status', async () => {
  let listReads = 0, accessReads = 0;
  const browser = createFeedRoute({ browserDocument: async () => true, instant: async () => at,
    read: async () => { listReads++; return unavailable(); }, document: fullDocument, policy: indexing,
    resolveAccess: async () => { accessReads++; return fullAccess(); } });
  const metadata = await browser.generateMetadata(props({}));
  assert.equal(metadata.alternates.canonical, 'https://goalhint.com/en/matches');
  assert.equal(metadata.robots.index, true);
  assert.equal(listReads, 0);
  assert.equal(accessReads, 0);
  const rendered = await browser.Page(props({}));
  assert.equal(rendered.type, Symbol.for('react.suspense'));
  const content = await rendered.props.children.type(rendered.props.children.props);
  assert.equal(view(content, 'MatchFeedPage').result.error, 'unavailable');
  assert.equal(view(content, 'MatchFeedPage').retryInitial, true);
  await assert.rejects(feed().generateMetadata(props({})), failed);
});

test('browser HTML and client navigation reuse the verified list without awaiting a server audit', async () => {
  for (const browsing of [{ browserDocument: async () => true, document: fullDocument }, { document: rscRequest }]) {
    let summaryReads = 0;
    const page = createFeedRoute({ ...browsing, instant: async () => at, policy: indexing,
      resolveAccess: fullAccess, read: stored(12),
      readSummary: async () => { summaryReads++; throw new Error('The browser owns this read.'); } });
    const result = await page.Page(props({}));
    const content = result.type === Symbol.for('react.suspense')
      ? await result.props.children.type(result.props.children.props)
      : result;
    const rendered = view(content, 'MatchFeedPage');
    assert.equal(rendered.result.error, null);
    assert.equal(rendered.result.data.coverage.knownFixtures, 12);
    assert.equal(rendered.retryInitial, false);
    assert.equal(rendered.summary, undefined);
    assert.equal(summaryReads, 0);
  }
});

test('only the transient initial browser document schedules a quiet retry', async () => {
  for (const [browserDocument, document, read, code, retryInitial] of [
    [async () => true, fullDocument, unavailable, 'unavailable', true],
    [async () => true, fullDocument, async () => { throw new MatchFeedError('rate-limited'); }, 'rate-limited', false],
    [undefined, rscRequest, unavailable, 'unavailable', false],
  ]) {
    const page = createFeedRoute({ browserDocument, document, read, instant: async () => at, policy: closed, resolveAccess: fullAccess });
    const rendered = await page.Page(props({}));
    const content = rendered.type === Symbol.for('react.suspense') ? await rendered.props.children.type(rendered.props.children.props) : rendered;
    assert.equal(view(content, 'MatchFeedPage').result.error, code);
    assert.equal(view(content, 'MatchFeedPage').retryInitial, retryInitial);
  }
});

test('validated public filters can stream while redirects and data-dependent status paths stay synchronous', async () => {
  let listReads = 0;
  const page = createFeedRoute({ browserDocument: async () => true, document: fullDocument, instant: async () => at, policy: indexing,
    resolveAccess: fullAccess, read: async () => { listReads++; return stored(0)(); } });
  const filtered = props({}, { country: 'England', when: 'last-7-days' });
  assert.equal((await page.generateMetadata(filtered)).robots.index, false);
  assert.equal((await page.Page(filtered)).type, Symbol.for('react.suspense'));
  assert.equal(listReads, 0, 'The validated browser variant can render its shell without reading stored fixtures');
  const malformed = props({}, { page: '0' });
  const distant = props({}, { date: '2099-01-01', country: 'England' });
  await assert.rejects(page.Page(malformed), missing);
  await assert.rejects(page.Page(distant), missing);
  await assert.rejects(page.Page(props({}, { status: 'live', when: 'yesterday' })), error => error.digest?.startsWith('NEXT_REDIRECT;'));
  assert.notEqual((await page.Page(props({}, { picks: 'only' }))).type, Symbol.for('react.suspense'));
  assert.notEqual((await page.Page(props({}, { page: '2' }))).type, Symbol.for('react.suspense'));
});

test('Matches and dated archives publish stable, distinct canonicals for each access tier', async () => {
  for (const tier of ['free', 'full']) {
    const options = { instant: async () => at, policy: indexing, document: fullDocument,
      resolveAccess: async () => ({ tier, signedIn: false, mode: tier === 'full' ? 'off' : 'free' }),
      read: async (input) => {
        const query = parseFeedQuery(input, { today });
        const range = resolveFeedDates(query, today);
        const records = Array.from({ length: query.page === 1 ? 50 : 25 }, (_, index) => ({
          ...fixture({ fixtureId: `fixture-${index}` }), cycle: null, unavailableMarkets: [
            { family: 'total-goals', reason: 'not-published' }, { family: 'both-teams-to-score', reason: 'not-published' },
          ], update: { prediction: 'current', result: 'untracked' },
          availabilityMessage: null, scorePeriod: null }));
        return { records, total: 75, page: query.page, pageSize: query.pageSize, totalPages: 2, performance: null, leagues: [], search: null,
          nextPage: query.page === 1 ? 2 : null, previousPage: query.page === 2 ? 1 : null,
          links: { next: query.page === 1 ? '/api/matches?page=2' : null, previous: query.page === 2 ? '/api/matches?page=1' : null },
          paginationVersion: null, asOf: at, today, state: 'ready', message: null, run: null,
          range: { from: range.startDate, to: range.endDate, ...range.window },
          coverage: { partial: false, knownFixtures: 75, matchingWithMarket: 75, dates: [{ date: today, status: 'complete', observedAt: at, authoritative: true }] } };
      } };
    const matches = createFeedRoute(options), archive = createFeedRoute({ ...options, dated: true });
    for (const page of [1, 2]) {
      const parameters = page === 1 ? {} : { page: String(page) };
      const suffix = page === 1 ? '' : '?page=2';
      const home = await matches.generateMetadata(props({}, parameters));
      assert.equal(home.alternates.canonical, `https://goalhint.com/en/matches${suffix}`);
      assert.equal(home.robots.index, true);
      const dated = await archive.generateMetadata(props({ date: today }, { ...parameters, picks: 'all' }));
      assert.equal(dated.alternates.canonical, `https://goalhint.com/en/predictions/${today}${suffix}`);
      assert.equal(dated.robots.index, true);
    }
    const nonDefault = await matches.generateMetadata(props({}, tier === 'full' ? { prob: '50-80' } : { sort: 'kickoff' }));
    assert.equal(nonDefault.robots.index, false);
    assert.match(nonDefault.alternates.canonical, /\b(?:prob|sort)=/u);
  }
});

test('client navigations, non-indexing deployments, variants and busy searches keep the 200 in-page retry', async () => {
  for (const [options, query] of [[{ document: rscRequest }, { picks: 'all' }], [{ document: async () => false }, { picks: 'all' }], [{ policy: closed }, { picks: 'all' }],
    [{}, { picks: 'only' }], [{}, { status: 'finished' }], [{}, { from: '2026-10-20', to: '2026-10-22' }]]) {
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

test('feed summary waits for an accepted list, streams independently and is never read for metadata', async () => {
  let finishList, finishSummary, summaries = 0;
  const list = new Promise(resolve => { finishList = resolve; });
  const summary = new Promise(resolve => { finishSummary = resolve; });
  const page = createFeedRoute({ instant: async () => at, policy: closed, document: fullDocument, resolveAccess: fullAccess,
    read: async () => { await list; return { records: [], total: 0, coverage: { knownFixtures: 0 } }; },
    readSummary: async (parameters, clock) => {
      summaries++;
      assert.equal(parameters.get('when'), 'today', 'Entry performance audits the same day as the list.');
      assert.equal(clock.now(), at);
      await summary; throw new Error('private summary failure');
    } });
  const rendering = page.Page(props({}));
  await new Promise(setImmediate);
  assert.equal(summaries, 0, 'The audit does not compete with the primary stored read.');
  finishList();
  const rendered = view(await rendering, 'MatchFeedPage');
  assert.equal(rendered.result.error, null, 'An unresolved audit cannot hold the primary page.');
  assert.ok(rendered.summary instanceof Promise);
  await page.generateMetadata(props({}));
  assert.equal(summaries, 1, 'Metadata must not start optional audits.');
  finishSummary();
  const seed = await rendered.summary;
  assert.equal(seed.reply, null);
  assert.doesNotMatch(JSON.stringify(seed), /private summary failure/);
});
