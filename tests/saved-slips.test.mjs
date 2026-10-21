import assert from 'node:assert/strict';
import test from 'node:test';
import { savedSlipView, savedSlipSnapshotSchema } from '../src/domain/saved-slips.ts';
import { defaultSlipCriteria, serializeSlipCriteria } from '../src/domain/slip-builder.ts';
import { createSavedSlips } from '../src/server/slips/saved-slips.ts';
import { createSaveSlipHandler } from '../src/server/slips/saved-slips-http.ts';
import { liveRecord, now, today } from './helpers/live-refresh-fixtures.mjs';

const record = liveRecord(), id = '10000000-0000-4000-8000-000000000099';
const slip = { id: 'server-generated-selection', selections: [{ fixtureId: id, kickoffAt: now + 3600000,
  homeTeam: record.homeTeam, awayTeam: record.awayTeam, competition: record.competition,
  family: 'match-result', selection: 'home-win', probability: 0.7, odds: '2.00', oddsBasis: 'bookmaker' }],
  totalOdds: '2.00', oddsBasis: 'bookmaker', averageProbability: 0.7 };
const result = { fixtureId: id, status: 'finished-regulation', regulationVerified: true, regulationHome: 2, regulationAway: 1 };

test('completed saved slips expose original odds and picks without account identity, adjudicated from verified regulation scores', () => {
  assert.ok(savedSlipSnapshotSchema.safeParse(slip).success);
  const won = savedSlipView('saved-id', new Date(now).toISOString(), slip, [result]);
  assert.equal(won.outcome, 'won'); assert.deepEqual(won.slip, slip); assert.equal('accountId' in won, false);
  assert.equal(savedSlipView('saved-id', '', slip, [{ ...result, regulationHome: 0 }]).outcome, 'lost');
  const unverified = savedSlipView('saved-id', '', slip, [{ ...result, regulationVerified: false }]);
  assert.equal(unverified.outcome, 'pending'); assert.equal(unverified.results[0].home, null);
});

test('missing or active legs never expose a public slip, even if another leg already lost', () => {
  for (const status of ['scheduled', 'live', 'unknown', 'postponed', 'canceled', 'abandoned', 'awarded'])
    assert.equal(savedSlipView('saved-id', '', slip, [{ ...result, status }]), null);
  assert.equal(savedSlipView('saved-id', '', slip, []), null);
  const two = { ...slip, selections: [...slip.selections, { ...slip.selections[0], fixtureId: '10000000-0000-4000-8000-000000000098' }] };
  assert.equal(savedSlipView('saved-id', '', two, [{ ...result, regulationHome: 0 }]), null);
  assert.equal(savedSlipView('saved-id', '', { ...slip, selections: [...slip.selections, ...slip.selections] }, [result]), null);
});

test('saved slip storage denies expired, reset-only and non-entitled sessions before persisting', async () => {
  const member = { accountId: 'account-id', tokenHash: 'token-hash', administrator: false };
  let writes = 0;
  for (const session of [null, { authenticatedAt: null, expiresAt: new Date(now + 1000) },
    { authenticatedAt: new Date(now), expiresAt: new Date(now - 1) },
    { authenticatedAt: new Date(now), expiresAt: new Date(now + 1000), codeEnteredAt: null }]) {
    const tx = { $queryRaw: async () => [{ id: member.accountId, phone: '256700000001' }],
      memberAccount: { findUnique: async () => ({ id: member.accountId, phone: '256700000001' }) },
      memberSession: { findUnique: async () => session }, savedSlip: { upsert: async () => writes++ } };
    const database = { transaction: async (run) => run(tx) };
    assert.equal(await createSavedSlips(database, { key: () => 'key' }, () => now).save(member, slip), 'forbidden');
  }
  assert.equal(writes, 0);
});

test('save endpoint requires same-origin authenticated subscription and accepts only server-rebuilt selections', async () => {
  let builds = 0;
  const auth = { production: false };
  const member = { accountId: 'account-id', tokenHash: 'token-hash' };
  const options = { now: () => now, access: async () => ({ tier: 'full', signedIn: true }),
    members: async () => ({ config: auth, sessions: { verify: async () => member } }),
    build: async () => { builds++; return { data: { slips: [slip] } }; } };
  const body = { criteria: serializeSlipCriteria(defaultSlipCriteria(today)).toString(), slipId: 'fabricated-selection' };
  const request = (value = body, origin = 'https://example.test') => new Request('https://example.test/api/account/slips', {
    method: 'POST', headers: { Origin: origin, Host: 'example.test', 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  assert.equal((await createSaveSlipHandler(options)(request(body, 'https://foreign.test'))).status, 403);
  assert.equal((await createSaveSlipHandler({ ...options, access: async () => ({ tier: 'free', signedIn: true }) })(request())).status, 403);
  assert.equal((await createSaveSlipHandler(options)(request({ ...body, slip }))).status, 400);
  const changed = await createSaveSlipHandler(options)(request());
  assert.equal(changed.status, 409); assert.equal(builds, 1);
  assert.match(changed.headers.get('cache-control'), /no-store/u);
});
