import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceSerialize } from '../src/server/evidence/evidence-input.ts';
import { historyJson } from '../src/server/predictions/history-read.ts';
import { refreshArchiveJson } from '../src/server/refresh/refresh-archive.ts';

test('refresh archives preserve zero and full DECIMAL(38,0) costs without changing identity bounds', () => {
  const value = { context: { fixtureVersion: 1n }, jobs: [{ costCapUsdPicos: 0n },
    { costCapUsdPicos: 10n ** 30n }, { costCapUsdPicos: 10n ** 38n - 1n }] };
  const encoded = evidenceSerialize(value);
  assert.deepEqual(refreshArchiveJson(encoded), value);
  assert.deepEqual(refreshArchiveJson(JSON.parse(encoded)), value);
  assert.throws(() => historyJson(evidenceSerialize({ fixtureVersion: 0n })), { reason: 'invalid-state' });
  assert.throws(() => historyJson(evidenceSerialize({ fixtureVersion: 10n ** 30n })), { reason: 'invalid-state' });
});

test('malformed or out-of-range refresh integers fail with a stable private error', () => {
  for (const marker of [{ $evidenceInteger: '-1' }, { $evidenceInteger: '01' }, { $evidenceInteger: '1.5' },
    { $evidenceInteger: '1e2' }, { $evidenceInteger: 0 }, { $evidenceInteger: '9'.repeat(39) },
    { $evidenceInteger: '0', extra: true }]) {
    assert.throws(() => refreshArchiveJson({ amount: marker }), { reason: 'unavailable' });
  }
  assert.throws(() => refreshArchiveJson('private malformed JSON'), { reason: 'unavailable' });
});
