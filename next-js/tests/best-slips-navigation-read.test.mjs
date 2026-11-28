import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareBestSlipsNavigation, takeBestSlipsNavigation } from '../src/components/slips/best-slips-navigation-read.ts';

const archive = '/api/best-slips?period=today&status=pending&page=1&oddsBand=1.5-5';
const route = '/en/best-slips';

test('a tab navigation transfers its exact pending read once and drops completed private data', async t => {
  const original = { window: globalThis.window, fetch: globalThis.fetch };
  const pending = [], timers = new Map();
  let timerId = 0;
  globalThis.window = { location: { pathname: '/en/matches', search: '' },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id) };
  globalThis.fetch = (href, options) => {
    assert.equal(href, archive);
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'same-origin');
    const read = Promise.withResolvers();
    pending.push({ ...read, signal: options.signal });
    return read.promise;
  };
  t.after(() => {
    prepareBestSlipsNavigation('/en/matches');
    if (original.window === undefined) delete globalThis.window;
    else globalThis.window = original.window;
    globalThis.fetch = original.fetch;
  });
  const response = access => Response.json({ access });
  const consumer = new AbortController();

  prepareBestSlipsNavigation(route);
  assert.equal(pending.length, 1);
  assert.equal(await takeBestSlipsNavigation(archive, consumer.signal), null);
  window.location.pathname = route;
  const accepted = takeBestSlipsNavigation(archive, consumer.signal);
  assert.equal(await takeBestSlipsNavigation(archive, consumer.signal), null, 'the prepared response is one use');
  pending[0].resolve(response({ tier: 'full', signedIn: true }));
  assert.equal((await (await accepted).json()).access.tier, 'full', 'the mounted screen may wait for a fresh private response');

  for (const access of [{ tier: 'free', signedIn: false }, { tier: 'full', signedIn: true }]) {
    window.location.pathname = '/en/matches';
    prepareBestSlipsNavigation(route);
    const value = response(access), bodyRead = Promise.withResolvers();
    const clone = value.clone.bind(value);
    value.clone = () => ({ json: async () => { const json = await clone().json(); bodyRead.resolve(); return json; } });
    pending.at(-1).resolve(value);
    await bodyRead.promise;
    await new Promise(setImmediate);
    window.location.pathname = route;
    assert.equal(await takeBestSlipsNavigation(archive, consumer.signal), access.signedIn ? null : value);
  }

  window.location.pathname = '/en/matches';
  prepareBestSlipsNavigation(route);
  prepareBestSlipsNavigation('/en/performance');
  assert.equal(pending.at(-1).signal.aborted, true);
  assert.equal(timers.size, 0);
});
