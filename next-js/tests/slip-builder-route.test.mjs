import assert from 'node:assert/strict';
import test from 'node:test';
import { registerServerRouteTestLoader, stubRouteComponents } from './helpers/server-route-loader.mjs';

const source = new URL('../src/', import.meta.url).href;
const at = Date.parse('2026-11-28T09:00:00Z');
registerServerRouteTestLoader({ source, modules: {
  '@/components/slips/slip-builder': stubRouteComponents(['SlipBuilder', 'SlipBuilderChrome', 'SlipBuilderLoading']),
  '@/components/slips/slip-styles': stubRouteComponents(['SlipStack']),
  '@/styles/provider': stubRouteComponents(['ServerThemeUntilHydrated']),
  './public-shell': `export const getShellInstant = async () => ${at}; export function PublicShell() { return null; }`,
} });
const { createSlipsRoute } = await import('../src/app/_components/slips-route.tsx');
const props = query => ({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve(query) });
const full = { tier: 'full', signedIn: true, mode: 'off' };
const free = { tier: 'free', signedIn: true, mode: 'on' };
const buildQuery = { build: '1', markets: 'match-result' };
const deferred = () => Promise.withResolvers();

async function shell(route, query) {
  const page = await route.Page(props(query));
  const [chrome, boundary] = page.props.children.props.children;
  assert.equal(chrome.type.name, 'SlipBuilderChrome');
  assert.equal(boundary.type, Symbol.for('react.suspense'));
  assert.equal(boundary.props.fallback.type.name, 'SlipBuilderLoading');
  const content = boundary.props.children.props.children;
  return { fallback: boundary.props.fallback.props, finish: async () => (await content.type(content.props)).props };
}

test('Builder returns parsed controls before resolving access or reading an authorized build', async () => {
  const access = deferred(), read = deferred(), started = deferred(), calls = [];
  const route = createSlipsRoute({ resolveAccess: async () => { calls.push('access'); return access.promise; },
    read: async (criteria, clock) => { calls.push('build'); started.resolve(); assert.equal(clock.now(), at); assert.equal(criteria.slips, 3); return read.promise; } });
  const view = await shell(route, { ...buildQuery, slips: '3' });
  assert.deepEqual(calls, []);
  assert.equal(view.fallback.criteria.slips, 3);
  assert.equal(view.fallback.result, undefined);
  const result = view.finish();
  assert.deepEqual(calls, ['access']);
  access.resolve(full);
  await started.promise;
  assert.deepEqual(calls, ['access', 'build']);
  read.resolve({ state: 'generated' });
  const ready = await result;
  assert.deepEqual(calls, ['access', 'build', 'access']);
  assert.equal(ready.entryState, 'ready');
  assert.equal(ready.result.state, 'generated');
});

test('Builder keeps an expired or timed-out access check from projecting protected build data', async () => {
  for (const afterBuild of [() => Promise.resolve(free), () => new Promise(() => {})]) {
    let checks = 0, calls = 0;
    const route = createSlipsRoute({ viewerDeadlineMs: 1, resolveAccess: async () => checks++ ? afterBuild() : full,
      read: async () => { calls++; return { state: 'generated', data: { marker: 'protected selection' } }; } });
    const ready = await (await shell(route, buildQuery)).finish();
    assert.equal(checks, 2);
    assert.equal(calls, 1);
    assert.equal(ready.result, null);
    if (ready.entryState === 'ready') assert.equal(ready.premiumOnly, true);
    else assert.equal(ready.entryState, 'access-unavailable');
  }
});

test('invalid, idle, guest and unresolved Builder visits never read the stored build cohort', async () => {
  for (const [query, viewer, entryState] of [
    [{ ...buildQuery, slips: 'invalid' }, full, 'ready'], [{}, full, 'ready'],
    [buildQuery, free, 'ready'], [buildQuery, new Promise(() => {}), 'access-unavailable'],
  ]) {
    let reads = 0;
    const route = createSlipsRoute({ viewerDeadlineMs: 1, resolveAccess: async () => viewer,
      read: async () => { reads++; throw new Error('must not read'); } });
    const view = await shell(route, query);
    const ready = await view.finish();
    assert.equal(ready.entryState, entryState);
    assert.equal(ready.result, null);
    assert.equal(reads, 0);
    if (query.slips === 'invalid') assert.equal(ready.error.field, 'slips');
  }
});
