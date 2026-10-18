import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { makeDetailStore } from '../src/state/detail-store.ts';
import { detailApi } from '../src/state/detail-api.ts';
import { consumeRefresh, publicRefreshApi, readJson } from '../src/state/refresh-base.ts';
import { matchFeedRules } from '../src/domain/match-feed-rules.ts';
import { ids, liveDetail } from './helpers/live-refresh-fixtures.mjs';

test('initial match state and presentation load without Zod or feed-state modules', () => {
  const roots = ['../src/state/detail-store.ts', '../src/state/detail-api.ts', '../src/domain/live-refresh.ts',
    '../src/domain/match-insight-presentation.ts'].map((path) => new URL(path, import.meta.url).href);
  const program = `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, next) {
      const result = next(specifier, context);
      assert.doesNotMatch(result.url, /(?:node_modules\\/zod\\/|src\\/state\\/(?:feed|store|refresh-api)\\.ts$)/);
      return result;
    } });
    const [{ makeDetailStore }] = await Promise.all(${JSON.stringify(roots)}.map((path) => import(path)));
    assert.deepEqual(Object.keys(makeDetailStore().getState()), ['publicRefresh']);
  `;
  execFileSync(process.execPath, ['--conditions=react-server', '--input-type=module', '--eval', program],
    { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
});

test('detail stores isolate caches and deduplicate live reads while a canceled consumer leaves others active', async (t) => {
  const original = globalThis.fetch, calls = [], pending = [], store = makeDetailStore(), other = makeDetailStore();
  globalThis.fetch = async (href, options) => {
    calls.push({ href, options });
    return new Promise((resolve) => pending.push(resolve));
  };
  t.after(() => {
    globalThis.fetch = original;
    store.dispatch(publicRefreshApi.util.resetApiState());
    other.dispatch(publicRefreshApi.util.resetApiState());
  });
  const first = store.dispatch(detailApi.endpoints.detail.initiate(ids.fixture));
  const second = store.dispatch(detailApi.endpoints.detail.initiate(ids.fixture, { forceRefetch: true }));
  const controller = new AbortController(), canceled = consumeRefresh(first, controller.signal);
  controller.abort();
  await assert.rejects(canceled, (error) => error.name === 'AbortError');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].href, `/api/matches/${ids.fixture}`);
  assert.equal(calls[0].options.signal.aborted, false);
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.cache, 'no-store');
  const detail = liveDetail();
  pending.shift()(Response.json(detail));
  assert.deepEqual(await second.unwrap(), detail);
  second.unsubscribe();
  assert.equal(detailApi.endpoints.detail.select(ids.fixture)(other.getState()).isUninitialized, true);
  const cached = store.dispatch(detailApi.endpoints.detail.initiate(ids.fixture));
  assert.deepEqual(await cached.unwrap(), detail);
  assert.equal(calls.length, 1);
  cached.unsubscribe();
});

test('detail-only caches retain validated insight data and reject invalid or failed refreshes', async (t) => {
  const original = globalThis.fetch, store = makeDetailStore();
  t.after(() => { globalThis.fetch = original; store.dispatch(publicRefreshApi.util.resetApiState()); });
  const args = { id: ids.fixture, section: 'h2h' }, valid = { fixtureId: ids.fixture, asOf: 7, section: 'h2h', data: { meetings: [] } };
  globalThis.fetch = async () => Response.json(valid);
  const first = store.dispatch(detailApi.endpoints.insights.initiate(args));
  assert.deepEqual(await first.unwrap(), { asOf: 7, section: 'h2h', data: { meetings: [] } });
  first.unsubscribe();
  for (const [body, status, code] of [[{}, 429, 'rate-limited'], [{}, 503, 'unavailable'],
    [{ ...valid, fixtureId: 'foreign-fixture' }, 200, 'invalid-response'],
    [{ ...valid, data: { meetings: 'invalid' } }, 200, 'invalid-response']]) {
    globalThis.fetch = async () => Response.json(body, { status });
    const request = store.dispatch(detailApi.endpoints.insights.initiate(args, { forceRefetch: true }));
    await assert.rejects(request.unwrap(), (error) => error.code === code);
    request.unsubscribe();
    assert.deepEqual(detailApi.endpoints.insights.select(args)(store.getState()).data,
      { asOf: 7, section: 'h2h', data: { meetings: [] } });
  }
  globalThis.fetch = async () => Response.json(liveDetail(undefined, { selection: 'cycle' }));
  const historical = store.dispatch(detailApi.endpoints.detail.initiate(ids.fixture));
  await assert.rejects(historical.unwrap(), (error) => error.code === 'invalid-response');
  historical.unsubscribe();
});

test('shared transport keeps malformed JSON and oversized UTF-8 payloads outside the cache', async (t) => {
  const original = globalThis.fetch, signal = new AbortController().signal;
  t.after(() => { globalThis.fetch = original; });
  for (const text of ['{', 'x'.repeat(matchFeedRules.maximumResponseBytes + 1),
    JSON.stringify('漢'.repeat(Math.ceil(matchFeedRules.maximumResponseBytes / 3)))]) {
    globalThis.fetch = async () => new Response(text);
    await assert.rejects(readJson('/api/matches/example', signal), (error) => error.code === 'invalid-response');
  }
});

test('shared transport still reads and cancels where AbortSignal.any is missing', async (t) => {
  const original = globalThis.fetch, any = Object.getOwnPropertyDescriptor(AbortSignal, 'any');
  delete AbortSignal.any;
  t.after(() => { globalThis.fetch = original; Object.defineProperty(AbortSignal, 'any', any); });
  assert.equal(AbortSignal.any, undefined);
  globalThis.fetch = async (href, options) => {
    assert.equal(options.signal.aborted, false);
    return Response.json({ ok: true });
  };
  assert.deepEqual(await readJson('/api/matches/example', new AbortController().signal), { ok: true });
  const controller = new AbortController(), reason = new DOMException('Refresh canceled.', 'AbortError');
  globalThis.fetch = (href, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const pending = readJson('/api/matches/example', controller.signal);
  controller.abort(reason);
  await assert.rejects(pending, (error) => error === reason);
});
