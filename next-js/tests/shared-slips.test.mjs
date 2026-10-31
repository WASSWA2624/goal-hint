import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { defaultSlipCriteria, serializeSlipCriteria } from '../src/domain/slip-builder.ts';
import { shareSlipSourceSchema, sharedSlipSchema, sharedSlipUrl } from '../src/domain/shared-slips.ts';
import { createSharedSlips } from '../src/server/slips/shared-slips.ts';
import { createShareSlipHandler, createReadSharedSlipHandler } from '../src/server/slips/shared-slips-http.ts';
import { liveRecord, now, today } from './helpers/live-refresh-fixtures.mjs';

const record = liveRecord();
const original = { id: 'trusted-server-slip', selections: [{ fixtureId: '10000000-0000-4000-8000-000000000099', kickoffAt: now + 3600000,
  homeTeam: record.homeTeam, awayTeam: record.awayTeam, competition: record.competition,
  family: 'match-result', selection: 'home-win', probability: 0.7, odds: '2.00', oddsBasis: 'bookmaker' }],
  totalOdds: '2.00', oddsBasis: 'bookmaker', averageProbability: 0.7 };
const member = { accountId: 'private-account', tokenHash: 'private-session', administrator: false };
const token = 'a'.repeat(32);
const config = { key: (purpose, value) => createHash('sha256').update('synthetic-key').update(purpose).update(value).digest('hex') };

function fixture({ entitled = true, session: suppliedSession, blocked = false, limit = 1 } = {}) {
  const rows = new Map();
  let rate = 0, inserts = 0, ids = 0, binds = 0;
  let resultFor = () => ({ status: 'scheduled', completed: false, fixtureCompleted: false });
  const session = suppliedSession === undefined ? { accountId: member.accountId, authenticatedAt: new Date(now - 1000),
    expiresAt: new Date(now + 3600000), passwordResetAt: null, codeEnteredAt: new Date(now - 1000) } : suppliedSession;
  const tx = {
    memberAccount: { findUnique: async () => ({ id: member.accountId, phone: '256700001234', blockedAt: blocked ? new Date(now) : null, erasedAt: null }) },
    memberSession: { findUnique: async () => session }, accessCode: { findFirst: async () => entitled ? { id: 'active-period' } : null },
    rateLimitBucket: { findUniqueOrThrow: async () => ({ count: rate <= limit ? rate : 31 }) },
    async $queryRaw(input, ...parameters) {
      const query = Array.isArray(input) ? { sql: input.join('?'), values: parameters } : input;
      if (!query.sql.includes('FROM SharedSlip')) return [{ id: member.accountId }];
      return [...rows.values()].filter(row => query.values.length === 1 ? row.id === query.values[0]
        : row.ownerKey === query.values[0] && row.fingerprint === query.values[1]);
    },
    async $executeRaw(input, ...parameters) {
      const query = Array.isArray(input) ? { sql: input.join('?'), values: parameters } : input;
      if (query.sql.includes('INSERT INTO RateLimitBucket')) { rate++; return 1; }
      if (query.sql.includes('INSERT INTO SharedSlip')) {
        const [id, ownerKey, fingerprint, json, , at] = query.values;
        rows.set(id, { id, ownerKey, fingerprint, snapshotJson: JSON.parse(json), createdAt: at, validIntegrity: 1 }); inserts++; return 1;
      }
      throw new Error('Unexpected write');
    },
  };
  const database = { transaction: async run => run(tx), query: async run => run(tx) };
  const service = createSharedSlips(database, config, () => now, { identity: () => String(++ids).padStart(32, '0'),
    bindForecasts: async (_tx, slip) => { binds++; return slip; },
    resolveResults: async (_tx, selections) => selections.map(selection => ({ fixtureId: selection.fixtureId,
      family: selection.family, selection: selection.selection, ...(selection.forecast ? { forecast: selection.forecast } : {}),
      regulationVerified: true, regulationHome: 2, regulationAway: 0, ...resultFor(selection) })) });
  return { database, service, tx, rows, results(project) { resultFor = project; }, counts: () => ({ inserts, rate, binds }) };
}

test('sharing requests accept only bounded server identities, never submitted odds or snapshots', () => {
  const source = { source: 'best', day: today, slipId: original.id };
  assert.deepEqual(shareSlipSourceSchema.parse(source), source);
  assert.equal(shareSlipSourceSchema.safeParse({ ...source, slip: original }).success, false);
  assert.equal(shareSlipSourceSchema.safeParse({ source: 'builder', criteria: '', slipId: original.id }).success, false);
  assert.equal(shareSlipSourceSchema.safeParse({ ...source, slipId: '' }).success, false);
  const shared = { id: token, url: sharedSlipUrl(token), createdAt: new Date(now).toISOString(), slip: original };
  assert.deepEqual(sharedSlipSchema.parse(shared), shared);
  assert.equal(sharedSlipSchema.safeParse({ ...shared, url: 'https://foreign.test/s/' + token }).success, false);
  assert.equal(sharedSlipSchema.safeParse({ ...shared, accountId: member.accountId }).success, false);
});

test('subscriber snapshots are immutable, deduplicated per owner, and expose no private ownership', async () => {
  const f = fixture();
  const first = await f.service.publish(member, { ...original, estimatedProbability: 0.3 }, 'best');
  assert.equal(first.state, 'shared');
  const second = await f.service.publish(member, original, 'best');
  assert.deepEqual(second, first); assert.deepEqual(f.counts(), { inserts: 1, rate: 1, binds: 0 });
  const shared = await f.service.read(first.shared.id, true);
  assert.deepEqual(shared, first.shared);
  assert.equal(shared.slip.totalOdds, '2.00');
  assert.doesNotMatch(JSON.stringify(shared), /private-account|private-session|256700|ownerKey|fingerprint|estimatedProbability/u);
  const row = [...f.rows.values()][0];
  assert.equal(row.ownerKey, config.key('shared-slip-owner', member.accountId));
  assert.notEqual(row.ownerKey, member.accountId);
});

test('blocked, unauthenticated, expired, reset-only and non-entitled sessions cannot publish', async () => {
  for (const options of [{ blocked: true }, { entitled: false }, { session: null },
    { session: { accountId: member.accountId, authenticatedAt: new Date(now), expiresAt: new Date(now - 1) } },
    { session: { accountId: member.accountId, authenticatedAt: new Date(now), expiresAt: new Date(now + 1), passwordResetAt: new Date(now) } },
    { session: { accountId: 'another-account', authenticatedAt: new Date(now), expiresAt: new Date(now + 1) } }]) {
    const f = fixture(options);
    assert.deepEqual(await f.service.publish(member, original, 'best'), { state: 'forbidden' });
    assert.equal(f.counts().inserts, 0);
  }
});

test('generated sources rebind forecasts and a changed cutoff cannot create a public record', async () => {
  const f = fixture();
  await f.service.publish(member, original, 'builder');
  assert.equal(f.counts().binds, 1);
  const service = createSharedSlips(f.database, config, () => now, { bindForecasts: async () => null });
  assert.deepEqual(await service.publish(member, original, 'builder'), { state: 'changed' });
  assert.equal(f.counts().inserts, 1);
});

test('new record throttling leaves existing permanent links readable and reusable', async () => {
  const f = fixture();
  const first = await f.service.publish(member, original, 'best');
  const busy = await f.service.publish(member, { ...original, id: 'another-trusted-slip' }, 'best');
  assert.equal(busy.state, 'busy'); assert.equal(f.counts().inserts, 1);
  assert.deepEqual(await f.service.read(first.shared.id, true), first.shared);
  assert.deepEqual(await f.service.publish(member, original, 'best'), first);
});

test('invalid tokens never query storage and corrupted snapshots are not published to readers', async () => {
  const f = fixture();
  assert.equal(await f.service.read('../account'), null); assert.equal(await f.service.read('A'.repeat(32)), null);
  const written = await f.service.publish(member, original, 'best');
  f.rows.get(written.shared.id).validIntegrity = 0;
  await assert.rejects(f.service.read(written.shared.id), error => error.reason === 'invalid-state' || error.code === 'invalid-state');
});

function endpoint(f, overrides = {}) {
  return createShareSlipHandler({ now: () => now, access: async () => ({ tier: 'full' }),
    members: async () => ({ config: { production: false }, sessions: { verify: async () => member } }),
    services: async () => ({ database: f.database, config }),
    build: async () => ({ data: { slips: [original] } }),
    published: () => ({ day: async () => ({ slips: [{ slip: original }] }) }), share: () => f.service, ...overrides });
}
function request(body, origin = 'https://example.test') {
  return new Request('https://example.test/api/slips/share', { method: 'POST',
    headers: { Origin: origin, Host: 'example.test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('publish HTTP denies foreign origin, missing entitlement and fabricated snapshots before a write', async () => {
  const f = fixture(), body = { source: 'best', day: today, slipId: original.id };
  assert.equal((await endpoint(f)(request(body, 'https://foreign.test'))).status, 403);
  assert.equal((await endpoint(f, { access: async () => ({ tier: 'free' }) })(request(body))).status, 403);
  assert.equal((await endpoint(f, { members: async () => ({ config: { production: false }, sessions: { verify: async () => null } }) })(request(body))).status, 401);
  assert.equal((await endpoint(f)(request({ ...body, slip: original }))).status, 400);
  assert.equal((await endpoint(f)(request({ ...body, day: '2026-02-30' }))).status, 400);
  assert.equal((await endpoint(f)(request({ ...body, slipId: 'fabricated' }))).status, 409);
  assert.equal(f.counts().inserts, 0);
});

test('publish HTTP resolves trusted sources and completed shared snapshots remain readable without a subscription', async () => {
  for (const body of [{ source: 'best', day: today, slipId: original.id },
    { source: 'builder', criteria: serializeSlipCriteria(defaultSlipCriteria(today)).toString(), slipId: original.id }]) {
    const f = fixture();
    const response = await endpoint(f)(request(body));
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/u);
    const shared = sharedSlipSchema.parse(await response.json());
    assert.deepEqual(shared.slip, original);
    f.results(() => ({ status: 'finished-regulation', completed: true, fixtureCompleted: true }));
    const read = createReadSharedSlipHandler({ read: (id, viewer) => f.service.read(id, viewer.tier === 'full'), access: async () => ({ tier: 'free', signedIn: false, mode: 'off' }) });
    const readRequest = new Request('https://example.test/api/slips/share/' + shared.id);
    assert.deepEqual(await (await read(readRequest, shared.id)).json(), shared);
    assert.equal((await read(readRequest, 'b'.repeat(32))).status, 404);
  }
});


test('shared tokens do not release scheduled, live or partially completed slips to guests', async () => {
  const f = fixture(), first = original.selections[0];
  const mixed = { ...original, id: 'mixed-private-slip', totalOdds: '4.00', selections: [first, { ...first,
    fixtureId: '10000000-0000-4000-8000-000000000098' }] };
  const written = await f.service.publish(member, mixed, 'best');
  assert.equal(written.state, 'shared');
  assert.equal(await f.service.read(written.shared.id), null);
  assert.deepEqual(await f.service.read(written.shared.id, true), written.shared);
  f.results(selection => selection.fixtureId === first.fixtureId
    ? { status: 'finished-regulation', completed: true, fixtureCompleted: true, regulationHome: 0, regulationAway: 2 }
    : { status: 'live', completed: false, fixtureCompleted: false });
  assert.equal(await f.service.read(written.shared.id), null, 'an early loss cannot release the remaining live prediction');
  f.results(() => ({ status: 'canceled', completed: true, fixtureCompleted: true }));
  assert.deepEqual(await f.service.read(written.shared.id), written.shared);
});

test('shared HTTP rechecks access after the read and discards unfinished data after expiry', async () => {
  const f = fixture(), written = await f.service.publish(member, original, 'best');
  let checks = 0;
  const reads = [];
  const read = createReadSharedSlipHandler({
    read: (id, viewer) => { reads.push(viewer.tier); return f.service.read(id, viewer.tier === 'full'); },
    access: async () => ({ tier: checks++ === 0 ? 'full' : 'free', signedIn: true, mode: 'off' }),
  });
  const response = await read(new Request('https://example.test/api/slips/share/' + written.shared.id), written.shared.id);
  assert.equal(response.status, 404); assert.equal(checks, 3); assert.deepEqual(reads, ['full', 'free']);
  assert.doesNotMatch(await response.text(), /home-win|fixtureId|probability/);
});


test('recipient landings distinguish missing and restricted tokens without leaking any snapshot', async () => {
  const f = fixture(), written = await f.service.publish(member, original, 'best');
  assert.deepEqual(await f.service.landing('../account'), { state: 'missing' });
  assert.deepEqual(await f.service.landing('b'.repeat(32)), { state: 'missing' });
  const restricted = await f.service.landing(written.shared.id);
  assert.deepEqual(restricted, { state: 'restricted' });
  assert.doesNotMatch(JSON.stringify(restricted), /fixtureId|home-win|totalOdds|probability|selections|ownerKey/);
  assert.deepEqual(await f.service.landing(written.shared.id, true), { state: 'available', shared: written.shared });
  f.results(() => ({ status: 'finished-regulation', completed: true, fixtureCompleted: true }));
  assert.deepEqual(await f.service.landing(written.shared.id), { state: 'available', shared: written.shared });
});
