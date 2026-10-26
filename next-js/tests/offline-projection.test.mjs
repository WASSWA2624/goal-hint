import assert from 'node:assert/strict';
import test from 'node:test';
import { offlineFixture, offlineRecordSchema, offlineRules, offlineSnapshotSchema } from '../src/domain/offline.ts';
import { fixtureSnapshotSchema } from '../src/domain/fixture-snapshot.ts';
import { createOfflineSnapshotHandler, projectOfflineSnapshot } from '../src/server/offline/snapshot.ts';
import { scenarios, now } from './helpers/paywall-fixtures.mjs';

const clock = { now: () => now };
const rawFeed = () => structuredClone(scenarios['finished-regulation'].feed);
const snapshot = () => projectOfflineSnapshot({ ...rawFeed(), access: { tier: 'full', signedIn: true } });

test('anonymous projection excludes protected predictions, identity, raw metadata and remote media', () => {
  for (const scenario of Object.values(scenarios)) {
    const feed = structuredClone(scenario.feed);
    feed.accountId = 'PRIVATE-ACCOUNT';
    feed.records[0].secret = 'PRIVATE-RECORD';
    feed.records[0].homeTeam.logoUrl = 'https://media.example.test/PRIVATE-IMAGE';
    feed.records[0].homeTeam.phone = 'PRIVATE-PHONE';
    feed.records[0].competition.countryFlagUrl = 'https://media.example.test/PRIVATE-FLAG';
    const value = projectOfflineSnapshot({ ...feed, access: { tier: 'full', signedIn: true } });
    assert.equal(offlineSnapshotSchema.safeParse(value).success, true);
    assert.doesNotMatch(JSON.stringify(value), /PRIVATE-|SENTINEL-|7\.73|home-win|forecast|prices|revisionId|runId|cycleId|access|signedIn|logoUrl|countryFlagUrl/);
    assert.equal(value.records[0].fixtureId, feed.records[0].fixtureId);
    assert.equal(value.records[0].homeTeam.name, feed.records[0].homeTeam.name);
  }
});

test('strict durable schemas reject hidden identity or prediction fields and invalid lifetimes', () => {
  const value = snapshot();
  for (const extra of [{ access: { tier: 'full' } }, { credentials: 'private' }]) {
    assert.equal(offlineSnapshotSchema.safeParse({ ...value, ...extra }).success, false);
  }
  for (const extra of [{ forecast: null }, { prices: [] }, { homeTeam: { ...value.records[0].homeTeam, logoUrl: 'https://media.example.test/a' } }]) {
    assert.equal(offlineRecordSchema.safeParse({ ...value.records[0], ...extra }).success, false);
  }
  for (const patch of [{ expiresAt: value.capturedAt }, { expiresAt: value.capturedAt + offlineRules.retentionMs + 1 },
    { reportingDate: '2026-01-01' }, { capturedAt: 8_640_000_000_000_000, expiresAt: 8_640_000_000_000_000 },
    { records: [...value.records, ...value.records] }]) {
    assert.equal(offlineSnapshotSchema.safeParse({ ...value, ...patch }).success, false);
  }
});

test('offline records reuse valid web cards without granting a prediction or entitlement', () => {
  const record = offlineFixture(snapshot().records[0]);
  assert.equal(fixtureSnapshotSchema.safeParse(record).success, true);
  assert.equal(record.forecast, null);
  assert.equal(record.cycleId, null);
  assert.deepEqual(record.prices, []);
  assert.equal(record.unavailableMarkets.length, 4);
  assert.equal('access' in record, false);
});

test('endpoint ignores cookies and query parameters, reads one fixed anonymous page and permits only its projection', async () => {
  const reads = [];
  const handler = createOfflineSnapshotHandler({ clock, readFeed: async (parameters, context) => {
    reads.push({ query: parameters.toString(), context });
    return rawFeed();
  } });
  const guest = await handler(new Request('https://example.test/api/offline/snapshot'));
  const member = await handler(new Request('https://example.test/api/offline/snapshot?picks=only&page=9&q=private',
    { headers: { Cookie: 'member=PRIVATE-TOKEN', Authorization: 'Bearer PRIVATE-TOKEN' } }));
  assert.equal(guest.status, 200);
  assert.equal(member.status, 200);
  assert.deepEqual(await guest.json(), await member.json());
  for (const response of [guest, member]) {
    assert.equal(response.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
    assert.equal(response.headers.get('x-goalhint-offline-snapshot'), '1');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('vary'), null);
  }
  assert.deepEqual(reads, Array.from({ length: 2 }, () => ({ query: 'page=1&pageSize=30', context: { locale: 'en' } })));
});

test('unavailable, malformed, future, expired and oversized source responses are never cacheable', async () => {
  const large = rawFeed();
  large.records = Array.from({ length: 30 }, (_, index) => ({ ...large.records[0], fixtureId: `fixture-${index}`,
    homeTeam: { ...large.records[0].homeTeam, name: '\u0000'.repeat(512) },
    awayTeam: { ...large.records[0].awayTeam, name: '\u0000'.repeat(512) },
    competition: { ...large.records[0].competition, name: '\u0000'.repeat(512) } }));
  large.total = large.coverage.knownFixtures = large.coverage.matchingWithMarket = 30;
  large.performance = null;
  const unavailable = rawFeed(); unavailable.state = 'data-unavailable';
  for (const readFeed of [async () => { throw Error('PRIVATE-DATABASE-ERROR'); },
    async () => ({ ...rawFeed(), privateField: 'PRIVATE-FIELD' }), async () => ({ ...rawFeed(), asOf: now + 1 }),
    async () => ({ ...rawFeed(), asOf: now - offlineRules.retentionMs }), async () => unavailable, async () => large]) {
    const response = await createOfflineSnapshotHandler({ readFeed, clock })();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-goalhint-offline-snapshot'), null);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.doesNotMatch(await response.text(), /PRIVATE-|SENTINEL-/);
  }
});
