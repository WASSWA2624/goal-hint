import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { evidenceSerialize } from '../src/server/evidence/evidence-input.ts';
import { preparePredictionQuotes, predictionQuoteFromRow } from '../src/server/predictions/prediction-quote-store.ts';
import { storedQuoteSource } from '../src/server/odds/odds-read.ts';
import { historyCandidate } from './helpers/prediction-history-fixtures.mjs';

// Synthetic public prices only; nothing here is a recorded provider price or an odds-display approval.
const recordedAt = Date.parse('2026-10-09T10:00:00.000Z'), freshnessMs = 12 * 3_600_000;
const candidate = historyCandidate(), markets = candidate.markets;
const identity = { revisionId: randomUUID(), cycleId: randomUUID(), fixtureId: randomUUID(), recordedAt, freshnessMs, markets };
const selection = (family) => markets[family].market.selection;
const other = (family) => ({ 'match-result': ['home-win', 'draw', 'away-win'], 'double-chance': ['home-or-draw', 'away-or-draw', 'home-or-away'],
  'total-goals': ['over-2.5', 'under-2.5'], 'both-teams-to-score': ['yes', 'no'] })[family].find((value) => value !== selection(family));
const priceRow = (family, overrides = {}) => ({ marketKey: family, selection: selection(family), basis: 'bookmaker', bookmakerId: 8, displayHundredths: 235,
  priceDecimal: '2.3500', line: family === 'total-goals' ? '2.50' : null, method: 'proportional-v1', mappingVersion: 'launch-odds-v1',
  snapshotId: 'd'.repeat(64), retrievedAt: new Date(recordedAt - 120_000), providerUpdatedAt: new Date(recordedAt - 180_000), ...overrides });
const freshState = (overrides = {}) => ({ lastRetrievedAt: new Date(recordedAt - 60_000), withdrawnAt: null, ...overrides });
const families = ['match-result', 'double-chance', 'total-goals', 'both-teams-to-score'];
const prepare = (source, input = {}) => preparePredictionQuotes({ ...identity, source, ...input });
const only = (source, family = 'match-result') => prepare(source).find((quote) => quote.family === family);
const reasonOf = (source, family) => only(source, family).reason;

test('raw unsigned bookmaker IDs normalize before publication quote validation', async () => {
  const row = { ...priceRow('match-result'), bookmakerId: 8n, ...freshState() };
  const source = await storedQuoteSource({ $queryRaw: async () => [row] }, identity.fixtureId);
  assert.equal(source.rows[0].bookmakerId, 8);
  const quote = only(source);
  assert.equal(quote.state, 'quoted'); assert.equal(quote.price.bookmakerId, 8);
});

test('a fresh public row for the exact family and selection is quoted at its retrieval time', () => {
  const quotes = prepare({ state: freshState(), rows: families.map((family) => priceRow(family)) });
  assert.deepEqual(quotes.map((quote) => quote.family), families);
  for (const quote of quotes) {
    assert.equal(quote.state, 'quoted'); assert.equal(quote.reason, null); assert.equal(quote.selection, selection(quote.family));
    assert.equal(quote.recordedAt, recordedAt); assert.equal(quote.price.retrievedAt, recordedAt - 120_000);
    assert.equal(quote.price.display, '2.35'); assert.equal(quote.price.hundredths, 235); assert.equal(quote.price.decimal, '2.3500');
    assert.equal(quote.price.stateRetrievedAt, recordedAt - 60_000); assert.equal(quote.price.snapshotId, 'd'.repeat(64));
    assert.ok(Object.isFrozen(quote));
  }
  assert.equal(only({ state: freshState(), rows: [priceRow('total-goals')] }, 'total-goals').price.line, '2.50');
});

test('no state, no row, another selection or another family never supplies a price', () => {
  assert.equal(reasonOf({ state: null, rows: [] }, 'match-result'), 'no-public-price');
  assert.equal(reasonOf({ state: null, rows: [priceRow('match-result')] }, 'match-result'), 'no-public-price');
  assert.equal(reasonOf({ state: freshState(), rows: [] }, 'match-result'), 'no-public-price');
  assert.equal(reasonOf({ state: freshState(), rows: [priceRow('match-result', { selection: other('match-result') })] }, 'match-result'), 'no-public-price');
  const borrowed = { state: freshState(), rows: [priceRow('double-chance', { selection: selection('match-result') }), priceRow('double-chance')] };
  assert.equal(reasonOf(borrowed, 'match-result'), 'no-public-price'); assert.equal(only(borrowed, 'double-chance').state, 'quoted');
  for (const quote of prepare({ state: null, rows: [] })) { assert.equal(quote.price, null); assert.equal(quote.state, 'unavailable'); }
});

test('withdrawn, future or older-than-freshness odds state expires every price', () => {
  const rows = families.map((family) => priceRow(family));
  for (const state of [freshState({ withdrawnAt: new Date(recordedAt - 1000) }), freshState({ lastRetrievedAt: new Date(recordedAt + 1) }),
    freshState({ lastRetrievedAt: new Date(recordedAt - freshnessMs - 1) })]) {
    assert.ok(prepare({ state, rows }).every((quote) => quote.reason === 'price-state-expired' && quote.price === null));
  }
  assert.equal(reasonOf({ state: freshState({ lastRetrievedAt: new Date(recordedAt - freshnessMs) }), rows }, 'match-result'), null);
});

test('median prices are an unsupported basis and malformed public rows are invalid, never quoted', () => {
  assert.equal(reasonOf({ state: freshState(), rows: [priceRow('match-result', { basis: 'median', snapshotId: null })] }, 'match-result'),
    'unsupported-price-basis');
  for (const overrides of [{ bookmakerId: null }, { bookmakerId: -1 }, { retrievedAt: new Date(recordedAt - freshnessMs - 1) }, { snapshotId: null }, { snapshotId: 'not-a-hash' }, { displayHundredths: 100 }, { displayHundredths: 100_001 },
    { displayHundredths: 2.5 }, { retrievedAt: new Date(recordedAt + 1) }, { providerUpdatedAt: new Date(recordedAt - 60_000) },
    { method: 'unreviewed method' }, { mappingVersion: 'future-odds-v2' }, { priceDecimal: '8.0000' }, { line: '1.50' }, { priceDecimal: '2.35' }]) {
    assert.equal(reasonOf({ state: freshState(), rows: [priceRow('match-result', overrides)] }, 'match-result'), 'invalid-public-price', JSON.stringify(overrides));
  }
});

test('unavailable families produce no row and invalid identities are rejected', () => {
  const partial = historyCandidate({ partial: true }).markets;
  const quotes = prepare({ state: freshState(), rows: families.map((family) => priceRow(family)) }, { markets: partial });
  assert.deepEqual(quotes.map((quote) => quote.family), ['match-result', 'double-chance']);
  assert.throws(() => prepare({ state: null, rows: [] }, { revisionId: 'bad' }));
  assert.throws(() => prepare({ state: null, rows: [] }, { freshnessMs: 0 }));
});

test('sealed rows parse only when every column matches the strict body', () => {
  const [quoted] = prepare({ state: freshState(), rows: [priceRow('match-result')] });
  const [missing] = prepare({ state: null, rows: [] });
  const row = (quote, overrides = {}) => ({ revisionId: quote.revisionId, cycleId: quote.cycleId, fixtureId: quote.fixtureId, family: quote.family,
    selection: quote.selection, state: quote.state, reason: quote.reason, snapshotId: quote.price?.snapshotId ?? null,
    displayHundredths: quote.price ? BigInt(quote.price.hundredths) : null, quotedAt: quote.price ? new Date(quote.price.retrievedAt) : null,
    recordedAt: new Date(quote.recordedAt), integrity: 'e'.repeat(64), body: evidenceSerialize(quote), validIntegrity: 1n, ...overrides });
  assert.deepEqual(predictionQuoteFromRow(row(quoted)), quoted);
  assert.deepEqual(predictionQuoteFromRow(row(missing)), missing);
  const invalid = (error) => error.reason === 'invalid-state';
  assert.throws(() => predictionQuoteFromRow(row(quoted, { validIntegrity: 0n })), invalid);
  assert.throws(() => predictionQuoteFromRow(row(quoted, { body: evidenceSerialize({ ...quoted, extra: true }) })), invalid);
  assert.throws(() => predictionQuoteFromRow(row(quoted, { body: evidenceSerialize({ ...quoted, price: { ...quoted.price, display: '9.99' } }) })), invalid);
  for (const overrides of [{ displayHundredths: 236n }, { selection: other('match-result') }, { recordedAt: new Date(recordedAt + 1) },
    { quotedAt: new Date(recordedAt) }, { snapshotId: 'f'.repeat(64) }, { reason: 'no-public-price' }, { cycleId: randomUUID() }]) {
    assert.throws(() => predictionQuoteFromRow(row(quoted, overrides)), invalid, JSON.stringify(Object.keys(overrides)));
  }
  assert.throws(() => predictionQuoteFromRow(row(missing, { state: 'quoted' })), invalid);
});
