import assert from 'node:assert/strict';
import test from 'node:test';
import { deferImage } from '../src/components/ui/deferred-image.ts';

test('remote badges share an observer, load near the viewport once and release unmounted images', () => {
  const original = globalThis.IntersectionObserver;
  const observed = new Set();
  let notify, instances = 0;
  globalThis.IntersectionObserver = class {
    constructor(callback, options) {
      instances++;
      notify = callback;
      assert.equal(options.rootMargin, '120px');
    }
    observe(image) { observed.add(image); }
    unobserve(image) { observed.delete(image); }
  };
  try {
    const first = {}, second = {}, removed = {};
    const cleanFirst = deferImage(first, 'https://media.example/first.png');
    deferImage(second, 'https://media.example/second.png');
    const cleanRemoved = deferImage(removed, 'https://media.example/removed.png');
    assert.equal(instances, 1);
    assert.equal(first.src, undefined);
    notify([{ target: first, isIntersecting: false }]);
    assert.equal(first.src, undefined);
    cleanRemoved();
    notify([{ target: first, isIntersecting: true }, { target: removed, isIntersecting: true }]);
    assert.equal(first.src, 'https://media.example/first.png');
    assert.equal(removed.src, undefined);
    assert.deepEqual([...observed], [second]);
    first.src = 'already loaded';
    notify([{ target: first, isIntersecting: true }]);
    assert.equal(first.src, 'already loaded');
    cleanFirst();
    notify([{ target: second, isIntersecting: true }]);
    assert.equal(second.src, 'https://media.example/second.png');
    assert.equal(observed.size, 0);
    delete globalThis.IntersectionObserver;
    const fallback = {};
    deferImage(fallback, 'https://media.example/fallback.png')();
    assert.equal(fallback.src, 'https://media.example/fallback.png');
  } finally {
    globalThis.IntersectionObserver = original;
  }
});
