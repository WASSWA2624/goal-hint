import assert from 'node:assert/strict';
import test from 'node:test';
import { registerServerRouteTestLoader, stubRouteComponents as empty } from './helpers/server-route-loader.mjs';

const source = new URL('../src/', import.meta.url).href;
const modules = {
  '@/components/performance/performance-dashboard': empty(['PerformanceDashboard']),
  '@/components/slips/best-slips': empty(['BestSlips']),
  '@/components/slips/best-slips-loading': empty(['BestSlipsLoading']),
  '@/components/slips/slip-styles': empty(['CriteriaPanel']),
  '@/components/ui/controls': empty(['TextLink']),
  '@/components/ui/visually-hidden': empty(['VisuallyHidden']),
  '@/components/ui/layout': empty(['Inline', 'Stack']),
  '@/server/slips/best-slips-browse': 'export const readBestSlipsBrowseSnapshot = async () => null;',
  '@/server/slips/slip-preview': 'export const gateBestSlips = (value, viewer) => ({ ...value, entitled: viewer.tier === "full", access: { tier: viewer.tier, signedIn: viewer.signedIn } });',
  '@/components/admin/admin-shell': empty(['AdminShell']),
  '@/components/navigation/navigation-progress': empty(['AppLoading']),
  '@/styles/provider': empty(['FallbackStyleProvider', 'ServerThemeUntilHydrated']),
  '@/server/admin/admin-http': 'export const adminPageGate = async () => globalThis.loadingAdmin;',
  '@/server/members/account-login-redirect': 'export const redirectToAccountLogin = () => { throw new Error("login-required"); };',
  '@/app/_components/online-runtime': empty(['OnlineRuntime']),
  './public-shell': 'export const getShellInstant = async () => Date.parse("2026-11-03T09:00:00Z"); export const getShellDate = async () => "2026-11-03"; export function PublicShell() { return null; }',
};
registerServerRouteTestLoader({ source, modules });
const { createPerformanceRoute } = await import('../src/app/_components/performance-route.tsx');
const { createBestSlipsRoute } = await import('../src/app/_components/best-slips-route.tsx');
const { isDocumentRequest } = await import('../src/server/seo/read-status.ts');
const { default: OwnerLayout } = await import('../src/app/(owner)/layout.tsx');
const props = query => ({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve(query ?? {}) });
const document = async () => true;

test('the dedicated Best Slips route streams its valid shell before access or data reads', async () => {
  const calls = [];
  const route = createBestSlipsRoute({ document, access: async () => { calls.push('access'); return { tier: 'free', signedIn: false }; },
    read: async () => { calls.push('read'); return null; } });
  // Root and locale-home redirects are exercised by home-routes.test.mjs.
  const shell = await route.Page(props({ period: 'yesterday', oddsBand: '5-10', status: 'won' }));
  const boundary = shell.props.children[1];
  assert.equal(boundary.type, Symbol.for('react.suspense'));
  assert.equal(boundary.props.fallback.type.name, 'BestSlipsLoading');
  assert.deepEqual(boundary.props.fallback.props.query, { period: 'yesterday', oddsBand: '5-10', status: 'won', page: 1 });
  assert.deepEqual(calls, [], 'The shell must not wait for viewer or slip reads.');
});

test('Best Slips browser Flight emits the exact unverified shell without waiting for either server read', async () => {
  const calls = [], query = { period: 'custom', from: '2026-11-01', to: '2026-11-02', oddsBand: '5-10', status: 'won', page: '2' };
  const route = createBestSlipsRoute({ document: () => isDocumentRequest(async () => new Headers({ 'sec-fetch-dest': 'empty' })),
    read: async () => { calls.push('read'); throw new Error('must not read'); },
    access: async () => { calls.push('access'); throw new Error('must not check access'); } });
  const shell = await route.Page(props(query));
  const view = shell.props.children[1];
  assert.equal(view.type.name, 'BestSlips');
  assert.equal(view.props.initialRead, true);
  assert.equal(view.props.result.access, undefined);
  assert.equal(view.props.result.entitled, undefined);
  assert.deepEqual(view.props.result.slips, []);
  assert.deepEqual(view.props.result.browse.query, { ...query, page: 2 });
  assert.equal(view.props.result.statistics, null);
  assert.equal(view.props.result.browse.total, null);
  assert.equal(view.props.emptyNavigation.type.name, 'BrowsePredictions');
  assert.deepEqual(calls, []);
  await assert.rejects(route.Page(props({ page: '0' })), error => error.digest.includes(';replace;/en/best-slips;'));
  assert.deepEqual(calls, []);
});

test('Best Slips reads the published cohort once and projects it after the latest access check', async () => {
  const calls = [];
  const route = createBestSlipsRoute({ document, read: async (query, locale) => {
    calls.push(`read:${query.period}:${locale}`);
    return { day: '2026-11-03', state: 'generated', slips: [], searchLimited: false, partialCoverage: false };
  }, access: async () => { calls.push('access'); return { tier: 'free', signedIn: true }; } });
  const shell = await route.Page(props());
  const content = shell.props.children[1].props.children.props.children;
  const rendered = await content.type(content.props);
  assert.deepEqual(calls, ['read:today:en', 'access']);
  assert.equal(rendered.props.result.entitled, false);
  assert.equal(rendered.props.signedIn, true);
  assert.equal(rendered.props.emptyNavigation.type.name, 'BrowsePredictions');
});

test('Best Slips keeps the original controls and an unknown total when the archive or access read fails', async () => {
  const query = { period: 'yesterday', oddsBand: '5-10', status: 'won' };
  const base = { day: '2026-11-03', searchLimited: false, partialCoverage: false };
  for (const failure of ['stored-unavailable', 'read-rejected', 'access-rejected']) {
    let accessChecks = 0;
    const route = createBestSlipsRoute({ document, read: async () => {
      if (failure === 'read-rejected') throw new Error('private storage detail');
      if (failure === 'stored-unavailable') return { ...base, state: 'data-unavailable', slips: [] };
      return { ...base, state: 'generated', slips: [{ id: 'private-pick' }] };
    }, access: async () => { accessChecks++; throw new Error('private viewer detail'); } });
    const shell = await route.Page(props(query));
    const content = shell.props.children[1].props.children.props.children;
    const rendered = await content.type(content.props);
    const slips = rendered.props.result;
    assert.equal(accessChecks, failure === 'access-rejected' ? 1 : 0);
    assert.equal(slips.state, 'data-unavailable');
    assert.equal(slips.statistics, null);
    assert.equal(slips.browse.total, null);
    assert.equal(slips.browse.hasMore, false);
    assert.deepEqual(slips.browse.query, { ...query, page: 1 });
    assert.deepEqual(slips.slips, []);
    assert.equal(slips.entitled, undefined);
    assert.equal(slips.access, undefined);
  }
});

test('performance shell returns with both reports pending and each read settles independently', async () => {
  let finishReport, finishHistory;
  const report = new Promise(resolve => { finishReport = resolve; }), history = new Promise(resolve => { finishHistory = resolve; });
  const started = [];
  const route = createPerformanceRoute({ read: async () => { started.push('report'); return report; },
    history: async () => { started.push('history'); return history; } });
  const shell = await route.Page(props({ page: '2' })), dashboard = shell.props.children.props;
  assert.deepEqual(started, ['report', 'history']);
  assert.equal(dashboard.historyPage, 2);
  assert.equal(dashboard.report, null); assert.equal(dashboard.history, null);
  let historyFinished = false;
  dashboard.historyPromise.then(() => { historyFinished = true; });
  finishReport({ marker: 'ready' });
  assert.deepEqual(await dashboard.reportPromise, { marker: 'ready' });
  assert.equal(historyFinished, false, 'Prediction rendering must not depend on publication history.');
  finishHistory(null); await dashboard.historyPromise;
});

test('invalid performance URLs retain their 404 before starting reports; failed reads become independent unavailable sections', async () => {
  let reads = 0;
  const unavailable = async () => { reads++; throw new Error('private storage error'); };
  const route = createPerformanceRoute({ read: unavailable, history: unavailable });
  await assert.rejects(route.Page(props({ page: '0' })), error => error.digest === 'NEXT_HTTP_ERROR_FALLBACK;404');
  assert.equal(reads, 0);
  const dashboard = (await route.Page(props())).props.children.props;
  assert.deepEqual(await Promise.all([dashboard.reportPromise, dashboard.historyPromise]), [null, null]);
});

test('performance status clicks scope the slip list while prediction reads and period metrics retain their cohort', async () => {
  const predictionQueries = [], historyQueries = [];
  const route = createPerformanceRoute({ read: async parameters => { predictionQueries.push(parameters.toString()); return null; },
    history: async query => { historyQueries.push(query); return null; } });
  const dashboard = (await route.Page(props({ from: '2026-10-20', to: '2026-11-03', slipStatus: 'won', page: '2' }))).props.children.props;
  await Promise.all([dashboard.reportPromise, dashboard.historyPromise]);
  assert.equal(dashboard.filters.slipStatus, 'won');
  assert.equal(new URLSearchParams(predictionQueries[0]).has('slipStatus'), false);
  assert.deepEqual(historyQueries, [{ from: '2026-10-20', to: '2026-11-03', status: 'won', page: 2, pageSize: 20 }]);
});

test('the owner layout authenticates before rendering its shared workspace loading boundary', async () => {
  globalThis.loadingAdmin = { owner: null, services: {} };
  await assert.rejects(OwnerLayout({ children: 'private' }), /login-required/);
  globalThis.loadingAdmin = { owner: { username: 'member-admin:synthetic' }, services: {} };
  const layout = await OwnerLayout({ children: 'private' });
  const boundary = layout.props.children.props.children[0];
  assert.equal(boundary.type, Symbol.for('react.suspense'));
  assert.equal(boundary.props.fallback.type.name, 'AppLoading');
  assert.equal(boundary.props.children.props.children, 'private');
});
