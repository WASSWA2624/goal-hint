import assert from 'node:assert/strict';
import test from 'node:test';
import { readPerformanceQuotes, verifiedQuotePolicy } from '../src/server/performance/performance-quotes.ts';
import { oddsValuesHash } from '../src/server/odds/odds-mysql-store.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { ODDS_CONTRACT_VERSION } from '../src/server/football/api-football-contract.ts';

const target = { fixtureId: '20000000-0000-4000-8000-000000000001', externalId: 3000n,
  revisionId: '20000000-0000-4000-8000-000000000002', openedAt: 1000, publishedAt: 5000, cutoffAt: 6000, kickoffAt: 10_000 };
const policy = { bookmakerId: 8, maximumAgeMs: 3000 };
function quoteRow(overrides = {}, receiptOverrides = {}) {
  const values = [{ label: 'Home', odd: '2.35' }, { label: 'Draw', odd: '3.40' }, { label: 'Away', odd: '4.20' }];
  const body = { fixtureId: target.fixtureId, bookmakerId: 8, bookmakerName: 'Synthetic bookmaker', betId: 1, betName: 'Match Winner',
    valuesHash: oddsValuesHash(values), previousId: null, ...overrides };
  const id = evidenceFingerprint(body);
  const snapshot = { ...body, id, retrievedAt: 3000, providerUpdatedAt: null, retainUntil: 100_000, values, ...overrides };
  const batch = { accountId: 'a'.repeat(64), kind: 'prices', scopeKey: 'date:1970-01-01:bookmaker:8', policyHash: 'b'.repeat(64),
    status: 'complete', requestsDispatched: 1, receivedAt: 3000, requestId: 'c'.repeat(64), slot: 2000, date: '1970-01-01',
    contractVersion: ODDS_CONTRACT_VERSION, reasons: [], missingCoverage: [],
    pages: [{ provider: 'api-football', endpoint: 'odds', requestParameters: {}, contractVersion: ODDS_CONTRACT_VERSION,
      retrievedAt: snapshot.retrievedAt, providerUpdatedAt: null, fromCache: false, currentPage: 1, totalPages: 1 }],
    fixtures: [{ externalId: 3000, observationHash: 'd'.repeat(64), outcome: 'apply' }], catalog: [], ...receiptOverrides };
  const batchId = evidenceFingerprint(batch);
  return { id, fixtureId: target.fixtureId, betExternalId: 1, body: snapshot, validIntegrity: 1n,
    batchId, batchBody: { id: batchId, ...batch }, validBatchIntegrity: 1n };
}
function database(rows, bytes = 2000n) {
  const calls = [];
  return { calls, $queryRaw: async (sql) => {
    calls.push(sql);
    return calls.length === 1 ? [{ bytes, total: BigInt(rows.length) }] : rows;
  } };
}
test('historical quote binding requires a synchronous real grant and bounded bookmaker/age policy', () => {
  assert.deepEqual(verifiedQuotePolicy({ ...policy, verifyPublicDisplay: () => true }), policy);
  for (const binding of [null, { ...policy, verifyPublicDisplay: () => false }, { ...policy, verifyPublicDisplay: async () => true },
    { ...policy, maximumAgeMs: 0, verifyPublicDisplay: () => true }, { ...policy, verifyPublicDisplay: () => { throw Error(); } }]) {
    assert.equal(verifiedQuotePolicy(binding), null);
  }
});
test('as-of quotes use bounded sealed snapshot and receipt reads with original-cycle clocks and one bookmaker', async () => {
  const tx = database([quoteRow()]), budget = { remainingBytes: 5000 };
  const quotes = await readPerformanceQuotes(tx, [target], policy, budget);
  assert.equal(quotes.get(`${target.revisionId}:match-result:home-win`), '2.35');
  assert.equal(quotes.size, 3); assert.equal(budget.remainingBytes, 3000); assert.equal(tx.calls.length, 2);
  const query = tx.calls[0].strings.join(' ');
  for (const expected of ['ROW_NUMBER()', 's.bookmakerExternalId=', 's.retrievedAt>=c.openedAt', 's.retrievedAt<=r.publishedAt',
    's.retrievedAt<c.cutoffAt', 'b.receivedAt<=r.publishedAt', 'TIMESTAMPDIFF', 's.providerUpdatedAt<=r.publishedAt']) assert.ok(query.includes(expected), expected);
  assert.doesNotMatch(query, /FixtureOddsPrice/);
});
test('empty targets perform no query and oversized payloads stop before loading bodies', async () => {
  const empty = database([]); assert.equal((await readPerformanceQuotes(empty, [], policy, { remainingBytes: 0 })).size, 0);
  assert.equal(empty.calls.length, 0);
  const large = database([quoteRow()], 5001n);
  await assert.rejects(readPerformanceQuotes(large, [target], policy, { remainingBytes: 5000 }));
  assert.equal(large.calls.length, 1);
});
test('bad seals, cross-fixture, future, stale, pre-cycle and wrong bookmaker quotes never score returns', async () => {
  for (const overrides of [{ fixtureId: '20000000-0000-4000-8000-000000000003' }, { bookmakerId: 9 },
    { retrievedAt: 5500 }, { retrievedAt: 1500 }, { retrievedAt: 500 }, { providerUpdatedAt: 5500 }]) {
    await assert.rejects(readPerformanceQuotes(database([quoteRow(overrides)]), [target], policy, { remainingBytes: 5000 }));
  }
  for (const field of ['validIntegrity', 'validBatchIntegrity']) {
    await assert.rejects(readPerformanceQuotes(database([{ ...quoteRow(), [field]: 0n }]), [target], policy, { remainingBytes: 5000 }));
  }
  for (const overrides of [{ receivedAt: 5500 }, { fixtures: [] }, { kind: 'bets' }, { status: 'failed' }, { pages: [] }]) {
    await assert.rejects(readPerformanceQuotes(database([quoteRow({}, overrides)]), [target], policy, { remainingBytes: 5000 }));
  }
});
test('unknown or incomplete launch markets remain unavailable, never substituted', async () => {
  assert.equal((await readPerformanceQuotes(database([quoteRow({ betName: 'Unrecognized bet' })]), [target], policy, { remainingBytes: 5000 })).size, 0);
});
