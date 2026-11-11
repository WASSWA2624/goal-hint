import assert from 'node:assert/strict';
import test from 'node:test';
import { registerServerRouteTestLoader, stubRouteComponents as exportsFor } from './helpers/server-route-loader.mjs';

const source = new URL('../src/', import.meta.url).href;
const modules = {
  'next/headers': 'export const cookies = async () => ({ get() {} }); export const headers = async () => new Headers();',
  '@/components/members/member-controls': exportsFor(['MemberNavigationRecovery']),
  '@/components/members/subscribe-controls': exportsFor(['SubscribeFlow', 'SubscribeIntro', 'SubscribeLayout']),
  '@/components/members/payment-status': exportsFor(['ApprovalRefresh', 'PaymentStatusCard']),
  '@/components/members/subscription-summary-card': exportsFor(['SubscriptionSummaryCard']),
  '@/components/members/free-trial-control': exportsFor(['FreeTrialControl']),
  '@/components/ui/controls': exportsFor(['ButtonLink']),
  '@/components/ui/visually-hidden': exportsFor(['VisuallyHidden']),
  '@/components/admin/subscribers-editor': exportsFor(['SubscribersEditor']),
  '@/components/analytics/dashboard/dashboard-styles': exportsFor(['Notice']),
  '@/server/admin/admin-http': 'export const adminPageGate = async () => ({ owner: true, services: { database: {} } });',
  '@/server/admin/subscriber-directory': 'export const readSubscriberDirectory = (...args) => globalThis.performanceDirectory(...args);',
  '@/server/admin/subscribers': 'export const createSubscribers = () => ({ detail: id => globalThis.performanceSubscriber(id) });',
  '@/server/admin/codes-http': 'export const uuid = value => typeof value === "string" && value.length === 36;',
  '@/server/analytics/analytics-http': 'export const getAnalyticsServices = async () => ({ database: null });',
  '@/server/members/member-http': 'export const getMemberServices = async () => { throw new Error("Inject test services"); };',
  '@/server/members/account-login-redirect': 'export const redirectToAccountLogin = () => { throw new Error("Login required"); };',
  '@/server/members/plans': 'export const createPlansService = () => ({ list: async () => [] }); export const plansServiceFor = () => ({ list: () => globalThis.performancePlans() });',
  './public-shell': exportsFor(['PublicShell']),
};
registerServerRouteTestLoader({ source, modules });
const { createSubscribeRoute } = await import('../src/app/_components/subscribe-route.tsx');
const member = { accountId: 'member', tokenHash: 'session', phone: '256700000000', blocked: false, administrator: false };
const subscription = { activeUntil: '2026-11-01T09:00:00Z', paymentPending: false, creditUgx: 0, autoRenew: false, renewsFromCredit: false };
const plans = [{ id: 'active', active: true }, { id: 'inactive', active: false }];
const payment = { acceptedTerms: true, status: null, credit: null };
const props = { locale: 'en', searchParams: Promise.resolve({}) };
const nodes = element => !element || typeof element !== 'object' ? [] : [element, ...[element.props?.children].flat().flatMap(nodes)];
function route({ identity = member, mode = 'on', status = async () => subscription, offers = async () => plans, view = async () => payment, checkout } = {}) {
  return createSubscribeRoute({ plans: offers, services: async () => ({ config: { production: false },
    settings: { settings: { paywallMode: mode } }, sessions: { verify: async () => identity },
    codes: { subscriptionStatus: status }, payments: { view },
    ...(checkout ? { checkout: { read: checkout } } : {}),
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

test('wallet top-ups open checkout independently of subscription packages and link back to Wallet', async () => {
  const checkout = { availableWalletUgx: 0, availableReferralDays: 0, lastMethod: null, requests: [] };
  const topUpProps = { locale: 'en', searchParams: Promise.resolve({ add: 'credit', return: '/en/matches' }) };
  const tree = nodes(await route({ checkout: async () => checkout, offers: async () => assert.fail('Top-ups do not need packages') })(topUpProps));
  const flow = tree.find(node => node.type?.name === 'SubscribeFlow');
  assert.equal(flow.props.startWithTopUp, true);
  assert.deepEqual(flow.props.plans, []);
  assert.deepEqual(flow.props.view, { ...payment, checkout });
  assert.ok(tree.some(node => node.type?.name === 'ButtonLink' && node.props.href === '/en/account?section=wallet&return=%2Fen%2Fmatches'));

  const legacy = nodes(await route()(topUpProps)).find(node => node.type?.name === 'SubscribeFlow');
  assert.deepEqual(legacy.props.plans, [plans[0]]);
});

test('subscription reads retain signed-out, blocked, closed and administrator guards', async () => {
  for (const [identity, mode, expected] of [[null, 'on', []], [{ ...member, blocked: true }, 'on', []],
    [member, 'off', ['subscription', 'payments']], [{ ...member, administrator: true }, 'on', []]]) {
    const started = [];
    const read = (name, value) => async () => { started.push(name); return value; };
    const rendering = route({ identity, mode, status: read('subscription', subscription), offers: read('plans', plans), view: read('payments', payment) })(props);
    if (identity) await rendering;
    else await assert.rejects(rendering, error => error.digest === 'NEXT_REDIRECT;replace;/en/account?view=login;307;');
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
