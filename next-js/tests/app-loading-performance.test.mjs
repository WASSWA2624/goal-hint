import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = new URL('../src/', import.meta.url).href;
const stub = code => ({ url: `data:text/javascript,${encodeURIComponent(code)}`, shortCircuit: true });
const empty = names => names.map(name => `export function ${name}() { return null; }`).join('\n');
const modules = {
  '@/components/performance/performance-dashboard': empty(['PerformanceDashboard']),
  '@/components/slips/best-slips': empty(['BestSlips']),
  '@/components/slips/best-slips-loading': empty(['BestSlipsLoading']),
  '@/components/slips/slip-styles': empty(['CriteriaPanel']),
  '@/components/ui/controls': empty(['TextLink']),
  '@/components/ui/layout': empty(['Inline', 'Stack']),
  '@/server/slips/best-slips': 'export const readBestSlips = async () => null; export const gateBestSlips = value => value;',
  '@/components/admin/admin-shell': empty(['AdminShell']),
  '@/components/navigation/page-loading': empty(['PageContentLoading']),
  '@/styles/provider': empty(['FallbackStyleProvider', 'ServerThemeUntilHydrated']),
  '@/server/admin/admin-http': 'export const adminPageGate = async () => globalThis.loadingAdmin;',
  '@/server/members/account-login-redirect': 'export const redirectToAccountLogin = () => { throw new Error("login-required"); };',
  '@/app/_components/online-runtime': empty(['OnlineRuntime']),
  './public-shell': 'export const getShellInstant = async () => Date.parse("2026-11-03T09:00:00Z"); export const getShellDate = async () => "2026-11-03"; export function PublicShell() { return null; }',
};
registerHooks({
  resolve(specifier, context, next) {
    if (modules[specifier]) return stub(modules[specifier]);
    if (specifier === 'next/navigation') return next(new URL('../node_modules/next/dist/client/components/navigation.react-server.js', import.meta.url).href, context);
    const target = specifier.startsWith('@/') ? source + specifier.slice(2) : specifier;
    try { return next(target, context); } catch (error) {
      if (!target.startsWith('.') && !target.startsWith('file:')) throw error;
      for (const extension of ['.ts', '.tsx']) { try { return next(target + extension, context); } catch { /* Try the next extension. */ } }
      throw error;
    }
  },
  load(url, context, next) {
    if (!url.startsWith(source) || !url.endsWith('.tsx')) return next(url, context);
    const path = fileURLToPath(url);
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(path, 'utf8'), {
      fileName: path, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText };
  },
});
const { createPerformanceRoute } = await import('../src/app/_components/performance-route.tsx');
const { createBestSlipsRoute } = await import('../src/app/_components/best-slips-route.tsx');
const { default: OwnerLayout } = await import('../src/app/(owner)/layout.tsx');
const props = query => ({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve(query ?? {}) });

test('the home route permanently redirects legacy feed queries before access or data reads and streams its valid shell', async () => {
  const calls = [];
  const route = createBestSlipsRoute({ access: async () => { calls.push('access'); return { tier: 'free', signedIn: false }; },
    read: async () => { calls.push('read'); return null; } });
  await assert.rejects(route.Page(props({ page: '2' })), error => error.digest === 'NEXT_REDIRECT;replace;/en/matches?page=2;308;');
  assert.deepEqual(calls, []);
  const shell = await route.Page(props());
  const boundary = shell.props.children;
  assert.equal(boundary.type, Symbol.for('react.suspense'));
  assert.equal(boundary.props.fallback.type.name, 'BestSlipsLoading');
  assert.deepEqual(calls, [], 'The shell must not wait for viewer or slip reads.');
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

test('the owner layout authenticates before rendering its shared workspace loading boundary', async () => {
  globalThis.loadingAdmin = { owner: null, services: {} };
  await assert.rejects(OwnerLayout({ children: 'private' }), /login-required/);
  globalThis.loadingAdmin = { owner: { username: 'member-admin:synthetic' }, services: {} };
  const layout = await OwnerLayout({ children: 'private' });
  const boundary = layout.props.children.props.children[0];
  assert.equal(boundary.type, Symbol.for('react.suspense'));
  assert.equal(boundary.props.fallback.type.name, 'PageContentLoading');
  assert.equal(boundary.props.children.props.children, 'private');
});
