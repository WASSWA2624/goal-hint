import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = new URL('../src/', import.meta.url).href;
const stub = (code) => ({ url: `data:text/javascript,${encodeURIComponent(code)}`, shortCircuit: true });
const exportsFor = (names) => names.map(name => `export function ${name}() { return null; }`).join('\n');
const modules = {
  'next/headers': 'export const cookies = async () => ({ get() {} }); export const headers = async () => new Headers();',
  '@/components/members/member-controls': exportsFor(['MemberNavigationRecovery']),
  '@/components/members/subscribe-controls': exportsFor(['SubscribeFlow', 'SubscribeIntro', 'SubscribeLayout']),
  '@/components/members/payment-status': exportsFor(['ApprovalRefresh']),
  '@/components/members/subscription-summary-card': exportsFor(['SubscriptionSummaryCard']),
  '@/components/ui/controls': exportsFor(['ButtonLink']),
  '@/components/admin/desk-styles': exportsFor(['DeskHead']),
  '@/components/admin/subscribers-editor': exportsFor(['SubscribersEditor']),
  '@/components/analytics/dashboard/dashboard-styles': exportsFor(['Notice']),
  '@/server/admin/admin-http': 'export const adminPageGate = async () => ({ owner: true, services: { database: {} } });',
  '@/server/admin/subscriber-directory': 'export const readSubscriberDirectory = (...args) => globalThis.performanceDirectory(...args);',
  '@/server/admin/subscribers': 'export const createSubscribers = () => ({ detail: id => globalThis.performanceSubscriber(id) });',
  '@/server/admin/codes-http': 'export const uuid = value => typeof value === "string" && value.length === 36;',
  '@/server/analytics/analytics-http': 'export const getAnalyticsServices = async () => ({ database: null });',
  '@/server/members/member-http': 'export const getMemberServices = async () => { throw new Error("Inject test services"); };',
  '@/server/members/account-login-redirect': 'export const redirectToAccountLogin = () => { throw new Error("Login required"); };',
  '@/server/members/member-sessions': 'export const memberCookieName = () => "test-session";',
  '@/server/members/plans': 'export const createPlansService = () => ({ list: async () => [] }); export const plansServiceFor = () => ({ list: () => globalThis.performancePlans() });',
  './public-shell': exportsFor(['PublicShell']),
};
registerHooks({
  resolve(specifier, context, next) {
    if (modules[specifier]) return stub(modules[specifier]);
    const target = specifier.startsWith('@/') ? source + specifier.slice(2) : specifier;
    try { return next(target, context); } catch (error) {
      if (!target.startsWith('.') && !target.startsWith('file:')) throw error;
      for (const extension of ['.ts', '.tsx']) {
        try { return next(target + extension, context); } catch { /* Try the next extension. */ }
      }
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
const { createSubscribeRoute } = await import('../src/app/_components/subscribe-route.tsx');
const member = { accountId: 'member', tokenHash: 'session', phone: '256700000000', blocked: false, administrator: false };
const subscription = { activeUntil: '2026-11-01T09:00:00Z', paymentPending: false, creditUgx: 0, autoRenew: false, renewsFromCredit: false };
const plans = [{ id: 'active', active: true }, { id: 'inactive', active: false }];
const payment = { acceptedTerms: true, status: null, credit: null };
const props = { locale: 'en', searchParams: Promise.resolve({}) };
const nodes = element => !element || typeof element !== 'object' ? [] : [element, ...[element.props?.children].flat().flatMap(nodes)];
function route({ identity = member, mode = 'test', status = async () => subscription, offers = async () => plans, view = async () => payment } = {}) {
  return createSubscribeRoute({ plans: offers, services: async () => ({ config: { production: false },
    settings: { settings: { paywallMode: mode } }, sessions: { verify: async () => identity },
    codes: { subscriptionStatus: status }, payments: { view },
  }) });
}

test('subscription, plans and payment reads start together after verified identity', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const started = [];
  const read = (name, value) => async () => { started.push(name); await pending; return value; };
  const rendering = route({ status: read('subscription', subscription), offers: read('plans', plans), view: read('payments', payment) })(props);
  await new Promise(setImmediate);
  assert.deepEqual(started, ['subscription', 'plans', 'payments'], 'No independent stored read should wait for another.');
  release();
  const flow = nodes(await rendering).find(node => node.type?.name === 'SubscribeFlow');
  assert.deepEqual(flow.props.plans, [plans[0]]);
  assert.deepEqual(flow.props.view, payment);
  assert.equal(flow.props.account.id, member.accountId);
});

test('subscription reads retain signed-out, blocked, closed and administrator guards', async () => {
  for (const [identity, mode, expected] of [[null, 'test', ['plans']], [{ ...member, blocked: true }, 'test', ['plans']],
    [member, 'off', ['subscription']], [{ ...member, administrator: true }, 'test', []]]) {
    const started = [];
    const read = (name, value) => async () => { started.push(name); return value; };
    await route({ identity, mode, status: read('subscription', subscription), offers: read('plans', plans), view: read('payments', payment) })(props);
    assert.deepEqual(started, expected);
  }
});

test('a failed optional read settles all work and preserves the unavailable state and known expiry', async () => {
  let finishPayment, finished = false;
  const pending = new Promise(resolve => { finishPayment = resolve; });
  const rendering = route({ offers: async () => { throw new Error('private pricing failure'); },
    view: async () => { await pending; return payment; } })(props).then(element => { finished = true; return element; });
  await new Promise(setImmediate);
  assert.equal(finished, false, 'All reads settle before rendering so late work cannot mutate the projection.');
  finishPayment();
  const tree = nodes(await rendering);
  assert.equal(tree.some(node => node.type?.name === 'SubscribeFlow'), false);
  assert.ok(tree.some(node => node.props?.role === 'status'));
  assert.equal(tree.find(node => node.type?.name === 'ApprovalRefresh').props.refreshAt, subscription.activeUntil);
  assert.doesNotMatch(JSON.stringify(tree), /private pricing failure/);
});

test('subscriber details load as soon as their identity is known without waiting for plans', async () => {
  const { default: Page } = await import('../src/app/(owner)/admin/subscribers/page.tsx');
  for (const explicit of [true, false]) {
    let finishDirectory, finishPlans;
    const directory = new Promise(resolve => { finishDirectory = resolve; });
    const offers = new Promise(resolve => { finishPlans = resolve; });
    const selected = '00000000-0000-4000-8000-000000000001', reads = [];
    globalThis.performanceDirectory = () => directory;
    globalThis.performancePlans = () => offers;
    globalThis.performanceSubscriber = async id => { reads.push(id); return { id }; };
    try {
      const rendering = Page({ searchParams: Promise.resolve(explicit ? { accountId: selected } : {}) });
      await new Promise(setImmediate);
      assert.deepEqual(reads, explicit ? [selected] : []);
      finishDirectory([{ id: selected }]);
      await new Promise(setImmediate);
      assert.deepEqual(reads, [selected], 'Default details should start when the directory arrives, while plans are pending.');
      finishPlans(plans);
      const editor = await rendering;
      assert.equal(editor.props.detail.id, selected);
      assert.deepEqual(editor.props.accounts, [{ id: selected }]);
      assert.deepEqual(editor.props.plans, plans);
      assert.equal(editor.props.selectedExplicitly, explicit);
    } finally {
      finishDirectory([]); finishPlans([]);
      delete globalThis.performanceDirectory; delete globalThis.performancePlans; delete globalThis.performanceSubscriber;
    }
  }
});
