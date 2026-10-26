import assert from 'node:assert/strict';
import test from 'node:test';
import { savedSlipOutcome, savedSlipView, savedSlipSnapshotSchema } from '../src/domain/saved-slips.ts';
import { defaultSlipCriteria, modelIndependentSlip, serializeSlipCriteria } from '../src/domain/slip-builder.ts';
import { createSavedSlips } from '../src/server/slips/saved-slips.ts';
import { createSaveSlipHandler } from '../src/server/slips/saved-slips-http.ts';
import { liveRecord, now, today } from './helpers/live-refresh-fixtures.mjs';
import { evidenceFingerprint, evidenceSerialize } from '../src/server/evidence/evidence-input.ts';

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
  for (const status of ['scheduled', 'live', 'unknown', 'postponed'])
    assert.equal(savedSlipView('saved-id', '', slip, [{ ...result, status }]), null);
  assert.equal(savedSlipView('saved-id', '', slip, []), null);
  const two = { ...slip, selections: [...slip.selections, { ...slip.selections[0], fixtureId: '10000000-0000-4000-8000-000000000098' }] };
  assert.equal(savedSlipView('saved-id', '', two, [{ ...result, regulationHome: 0 }]), null);
  assert.equal(savedSlipView('saved-id', '', { ...slip, selections: [...slip.selections, ...slip.selections] }, [result]), null);
});

test('slip aggregate establishes a known loss while unfinished selections remain private', () => {
  const active = { ...slip.selections[0], fixtureId: '10000000-0000-4000-8000-000000000098' };
  const mixed = { ...slip, selections: [...slip.selections, active] };
  const loss = { ...result, regulationHome: 0 };
  assert.equal(savedSlipOutcome(mixed, [loss]), 'lost');
  assert.equal(savedSlipView('saved-id', '', mixed, [loss]), null);
  assert.equal(savedSlipOutcome(mixed, [result]), 'pending');
  assert.equal(savedSlipOutcome(mixed, [{ ...result, status: 'canceled' }]), 'pending');
  assert.equal(savedSlipOutcome(mixed, [{ ...loss, regulationVerified: false }]), 'pending');
});

test('canceled, abandoned and awarded forecasts are void without claiming a winning slip', () => {
  for (const status of ['canceled', 'abandoned', 'awarded']) {
    const view = savedSlipView('saved-id', '', slip, [{ ...result, status }]);
    assert.equal(view.outcome, 'void');
    assert.deepEqual(view.results, [{ fixtureId: id, home: null, away: null, outcome: 'void' }]);
    assert.equal(view.slip.totalOdds, '2.00');
  }
  const other = '10000000-0000-4000-8000-000000000098';
  const two = { ...slip, selections: [...slip.selections, { ...slip.selections[0], fixtureId: other }] };
  const voidLeg = { ...result, fixtureId: other, status: 'canceled' };
  assert.equal(savedSlipView('saved-id', '', two, [result, voidLeg]).outcome, 'void');
  assert.equal(savedSlipView('saved-id', '', two, [{ ...result, regulationHome: 0 }, voidLeg]).outcome, 'lost');
  assert.equal(savedSlipView('saved-id', '', two, [{ ...result, regulationVerified: false }, voidLeg]).outcome, 'pending');
  assert.equal(savedSlipView('saved-id', '', two, [{ ...result, status: 'live' }, voidLeg]), null);
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

test('member saves keep the model-independent snapshot because no model identity is stored with them', async () => {
  // The strict snapshot rejects an estimate, which is why the save path uses an explicit allowlist.
  assert.equal(savedSlipSnapshotSchema.safeParse({ ...slip, estimatedProbability: 0.5 }).success, false);
  const independent = modelIndependentSlip({ ...slip, estimatedProbability: 0.5, futureField: true });
  assert.deepEqual(Object.keys(independent), ['id', 'selections', 'totalOdds', 'oddsBasis', 'averageProbability']);
  assert.deepEqual(independent, slip); assert.deepEqual(savedSlipSnapshotSchema.parse(independent), slip);
  let saved = null;
  const member = { accountId: 'account-id', tokenHash: 'token-hash' };
  const tx = { $queryRaw: async () => [{ id: member.accountId, phone: '256700000001' }],
    memberAccount: { findUnique: async () => ({ id: member.accountId, phone: '256700000001' }) },
    memberSession: { findUnique: async () => null }, savedSlip: { upsert: async () => { saved = true; } } };
  const handler = createSaveSlipHandler({ now: () => now, access: async () => ({ tier: 'full', signedIn: true }),
    members: async () => ({ config: { production: false }, sessions: { verify: async () => member } }),
    services: async () => ({ database: { transaction: async (run) => run(tx) }, config: { key: () => 'key' } }),
    build: async () => ({ data: { slips: [{ ...slip, estimatedProbability: 0.5 }] } }) });
  const response = await handler(new Request('https://example.test/api/account/slips', { method: 'POST',
    headers: { Origin: 'https://example.test', Host: 'example.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ criteria: serializeSlipCriteria(defaultSlipCriteria(today)).toString(), slipId: slip.id }) }));
  // The estimated slip reaches the storage checks (here a missing session) instead of failing snapshot validation.
  assert.equal(response.status, 403); assert.equal(saved, null);
});

test('public saved slip history grades only sealed results coherent with the current fixture', async () => {
  const resultId = 'a'.repeat(64), evidenceRef = 'synthetic-result-proof';
  const content = { status: 'finished-regulation', providerStatus: 'FT', elapsedMinutes: 90,
    reportedGoals: { home: 2, away: 1 }, extraTimeScore: { home: null, away: null }, penaltyScore: { home: null, away: null },
    regulation: { verified: true, home: 2, away: 1, evidenceRef } };
  const body = { id: resultId, fixtureId: id, fixtureVersion: 1n, previousId: null, observationId: 'b'.repeat(64),
    observedAt: now, providerUpdatedAt: null, regulationVerifiedAt: now, ...content };
  const row = { id: resultId, fixtureId: id, fixtureVersion: 1n, observedAt: new Date(now), status: content.status,
    regulationVerified: true, regulationHome: 2, regulationAway: 1, contentHash: evidenceFingerprint(content),
    body: evidenceSerialize(body), validIntegrity: 1 };
  const fixture = { id, activeCycleId: null, status: content.status, regulationHome: 2, regulationAway: 1, regulationVerifiedAt: new Date(now),
    regulationEvidenceRef: evidenceRef, lifecycleState: null, resultState: { resultId } };
  const tx = { footballFixture: { findMany: async () => [fixture] }, $queryRaw: async query => query.sql.includes('FROM SavedSlip s')
    ? [{ id: 'saved-id', createdAt: new Date(now), snapshotJson: slip }] : [row] };
  const service = createSavedSlips({ transaction: async (read) => read(tx) }, { key: () => 'key' });
  assert.equal((await service.completed())[0].outcome, 'won');
  fixture.regulationHome = 0;
  assert.equal((await service.completed())[0].outcome, 'pending');
  fixture.regulationHome = 2;
  fixture.lifecycleState = { issue: 'conflicting-final-result' };
  assert.equal((await service.completed())[0].outcome, 'pending');
  fixture.lifecycleState = null;
  row.validIntegrity = 0;
  await assert.rejects(service.completed(), error => error.reason === 'invalid-state' || error.code === 'invalid-state');
});

test('selected saved-slip performance covers the complete cohort while only recent completed records are exposed', async () => {
  const rows = Array.from({ length: 125 }, (_, index) => ({ id: `saved-${String(index).padStart(3, '0')}`,
    createdAt: new Date(now - index), snapshotJson: { ...slip, selections: [{ ...slip.selections[0],
      fixtureId: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}` }] } }));
  const queries = [], projections = [];
  let reads = 0;
  const tx = { async $queryRaw(query) { queries.push(query); return reads++ === 0 ? rows.slice(0, 100) : rows.slice(100); } };
  const service = createSavedSlips({ transaction: async read => read(tx) }, { key: () => 'key' }, () => now, {
    async resolveResults(_tx, selections, asOf) {
      projections.push(selections.length); assert.equal(asOf, now);
      return selections.map(selection => {
        const index = Number(selection.fixtureId.slice(-12));
        return { fixtureId: selection.fixtureId, status: index < 60 ? 'finished-regulation' : index < 90 ? 'canceled' : 'scheduled',
          regulationVerified: true, regulationHome: index < 30 ? 2 : 0, regulationAway: 1 };
      });
    },
  });
  const history = await service.history({ dateFrom: today, dateTo: today, timeFrom: '13:00', timeTo: '14:00' });
  assert.deepEqual(history.statistics, { total: 125, won: 30, lost: 30, pending: 35, void: 30 });
  assert.equal(history.records.length, 20); assert.equal(history.records[0].id, rows[0].id);
  assert.deepEqual(projections, [100, 25]);
  assert.match(queries[0].sql, /NOT EXISTS.*JSON_TABLE/s);
  assert.ok(queries[0].values.includes(Date.parse(`${today}T10:00:00Z`)), 'kickoff range uses reporting-zone wall time');
  assert.ok(queries[0].values.includes(Date.parse(`${today}T11:01:00Z`)), 'end minute is inclusive');
  assert.ok(queries[1].values.includes(rows[99].id), 'subsequent batch uses the prior keyset cursor');
  assert.doesNotMatch(JSON.stringify(history), /accountId|tokenHash/);
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
