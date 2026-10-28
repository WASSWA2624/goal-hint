import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { slipMatchRefreshRequestSchema, slipMatchRefreshResponseSchema, slipMatchRefreshRules,
  slipMatchSelectionKey, slipMatchWatch, uniqueSlipMatchWatches } from '../src/domain/slip-match-refresh.ts';
import { createSlipMatchStatesHandler, createStoredSlipMatchStates } from '../src/server/slips/slip-match-states.ts';
import { MatchFeedError } from '../src/server/matches/feed-error.ts';
import { memberCookieName } from '../src/server/members/member-sessions.ts';
import { demoMember } from '../src/server/demo/member.ts';

const at = Date.parse('2026-10-28T15:30:00Z');
const full = { tier: 'full', signedIn: true, mode: 'off' }, free = { tier: 'free', signedIn: false, mode: 'free' };
const watch = (changes = {}) => ({ fixtureId: '00000000-0000-4000-8000-000000000001', kickoffAt: at - 1_800_000,
  homeTeam: { id: 'home' }, awayTeam: { id: 'away' }, family: 'match-result', selection: 'home-win', probability: .7,
  forecast: { cycleId: '00000000-0000-4000-8000-000000000002', revisionId: '00000000-0000-4000-8000-000000000003', publishedAt: at - 86_400_000 }, ...changes });
const state = (leg, changes = {}) => ({ fixtureId: leg.fixtureId, family: leg.family, selection: leg.selection,
  ...(leg.forecast ? { forecast: leg.forecast } : {}), status: 'live', score: { home: 1, away: 0 },
  liveClock: { phase: 'first-half', minute: 30 }, outcome: 'pending', ...changes });
function request(body = { selections: [watch()] }, changes = {}) {
  return new Request('http://localhost/api/slips/match-states', { method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', cookie: 'owner=authorized-test-session', ...changes.headers },
    body: typeof body === 'string' ? body : JSON.stringify(body), ...changes });
}

test('refresh watches carry only bounded immutable identity and deduplicate repeat legs', () => {
  const original = { ...watch(), odds: '2.00', homeTeam: { id: 'home', name: 'Original home', logoUrl: null },
    awayTeam: { id: 'away', name: 'Original away', logoUrl: null }, competition: { id: 'league', name: 'Private league' } };
  const compact = slipMatchWatch(original);
  assert.deepEqual(compact, watch());
  assert.doesNotMatch(JSON.stringify(compact), /Original|Private|odds|logo/);
  assert.equal(uniqueSlipMatchWatches([original, compact]).length, 1);
  assert.equal(slipMatchSelectionKey(compact), slipMatchSelectionKey(state(compact)));
  assert.equal(uniqueSlipMatchWatches([compact, { ...compact, forecast: { publishedAt: compact.forecast.publishedAt,
    revisionId: compact.forecast.revisionId, cycleId: compact.forecast.cycleId } }]).length, 1);
  assert.ok(slipMatchRefreshRequestSchema.safeParse({ selections: [compact, compact] }).success);
  assert.equal(slipMatchRefreshRequestSchema.safeParse({ selections: [compact, { ...compact, probability: .8 }] }).success, false);
  assert.equal(slipMatchRefreshRequestSchema.safeParse({ selections: [] }).success, false);
  assert.equal(slipMatchRefreshRequestSchema.safeParse({ selections: Array(801).fill(compact) }).success, false);
  for (const changed of [{ fixtureId: 'not-a-uuid' }, { odds: '2.00' }, { homeTeam: { id: 'home', name: 'forbidden' } },
    { family: 'total-goals', selection: 'home-win' }, { probability: 2 }, { forecast: { ...compact.forecast, revisionId: 'invalid' } }]) {
    assert.equal(slipMatchRefreshRequestSchema.safeParse({ selections: [{ ...compact, ...changed }] }).success, false);
  }
});

test('response contract rejects incoherent scores, clocks, settlements and duplicate identities', () => {
  const leg = watch(), observation = state(leg);
  assert.ok(slipMatchRefreshResponseSchema.safeParse({ states: [observation], asOf: at }).success);
  assert.ok(slipMatchRefreshResponseSchema.safeParse({ states: [state(leg, { score: null })], asOf: at }).success,
    'a sealed clock remains useful while score evidence is missing');
  assert.ok(slipMatchRefreshResponseSchema.safeParse({ states: [], asOf: at }).success);
  for (const changed of [{ status: 'scheduled' }, { outcome: 'correct' }, { score: { home: -1, away: 0 } },
    { status: 'finished-regulation', outcome: 'correct', score: null, liveClock: null },
    { status: 'unknown', liveClock: null }, { family: 'total-goals' }]) {
    assert.equal(slipMatchRefreshResponseSchema.safeParse({ states: [{ ...observation, ...changed }], asOf: at }).success, false);
  }
  assert.equal(slipMatchRefreshResponseSchema.safeParse({ states: [observation, observation], asOf: at }).success, false);
  assert.equal(slipMatchRefreshResponseSchema.safeParse({ states: [], asOf: Infinity }).success, false);
});

test('same-origin and pre-read entitlement checks deny storage access without leaking observations', async () => {
  const reads = () => assert.fail('unauthorized requests must not read storage');
  let handler = createSlipMatchStatesHandler({ access: async () => full, read: reads });
  let response = await handler(request(undefined, { headers: { 'sec-fetch-site': 'cross-site' } }));
  assert.equal(response.status, 403);
  handler = createSlipMatchStatesHandler({ access: async () => free, read: reads });
  response = await handler(request());
  assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /fixtureId|liveClock|forecast/);
  handler = createSlipMatchStatesHandler({ access: async () => { throw new Error('private access diagnostic'); }, read: reads });
  response = await handler(request()); assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private access diagnostic/);
});

test('invalid and oversized bodies fail before storage and private errors stay generic', async () => {
  const handler = createSlipMatchStatesHandler({ access: async () => full, read: () => assert.fail('invalid body reached storage') });
  for (const body of ['invalid-json', '{}', JSON.stringify({ selections: [] }), JSON.stringify({ selections: Array(801).fill(watch()) })]) {
    assert.equal((await handler(request(body))).status, 400);
  }
  assert.equal((await handler(request({}, { headers: { 'content-type': 'text/plain', 'sec-fetch-site': 'same-origin' } }))).status, 400);
  assert.equal((await handler(request('x'.repeat(slipMatchRefreshRules.maximumRequestBytes + 1)))).status, 413);
});

test('one deduplicated read returns only exact originals and rechecks access after reading', async () => {
  const leg = watch(), foreign = state({ ...leg, fixtureId: randomUUID() }); let reads = 0, checks = 0;
  let handler = createSlipMatchStatesHandler({ access: async () => { checks++; return full; }, read: async (watches) => {
    reads++; assert.equal(watches.length, 1); assert.deepEqual(watches[0], leg);
    return { states: [state(leg), foreign], asOf: at };
  } });
  let response = await handler(request({ selections: [leg, leg] }));
  assert.equal(reads, 1); assert.equal(checks, 2); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { states: [state(leg)], asOf: at });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('vary'), 'Cookie'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  checks = 0;
  handler = createSlipMatchStatesHandler({ access: async () => ++checks === 1 ? full : free,
    read: async () => ({ states: [state(leg)], asOf: at }) });
  response = await handler(request()); assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /fixtureId|liveClock|forecast|1-0/);
});

test('successful missing observations explicitly clear stale current or replacement-cycle state', async () => {
  const leg = watch(), replacement = state({ ...leg, forecast: { ...leg.forecast, cycleId: randomUUID() } });
  const handler = createSlipMatchStatesHandler({ access: async () => full,
    read: async () => ({ states: [replacement], asOf: at }) });
  const response = await handler(request());
  const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.states.length, 1);
  assert.equal(data.states[0].status, 'unknown'); assert.equal(data.states[0].score, null);
  assert.equal(data.states[0].liveClock, null); assert.equal(data.states[0].outcome, 'pending');
  assert.deepEqual(data.states[0].forecast, leg.forecast);
});

test('rate limits and malformed reader responses release no partial observations', async () => {
  let handler = createSlipMatchStatesHandler({ access: async () => full, read: async () => { throw new MatchFeedError('rate-limited', 25); } });
  let response = await handler(request()); assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '25');
  handler = createSlipMatchStatesHandler({ access: async () => full, read: async () => ({ states: [state(watch(), { outcome: 'correct' })], asOf: at }) });
  response = await handler(request()); assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /fixtureId|forecast|liveClock/);
});

test('stored refresh batches sealed-result reads once, skips legacy lookups, and applies the session budget', async () => {
  const leg = watch(), legacy = watch({ fixtureId: randomUUID(), forecast: undefined });
  let transactions = 0, reads = 0, counter = 1;
  const tx = { $queryRaw: async () => [{ at: new Date(at) }], $executeRaw: async () => 1,
    rateLimitBucket: { findUniqueOrThrow: async () => ({ count: counter }) } };
  const database = { transaction: async (operation, options) => { transactions++; assert.equal(options.isolationLevel, 'RepeatableRead'); return operation(tx); } };
  const config = { production: false, cookies: { session: 'owner' }, key: (purpose, value) => `${purpose}:${value}` };
  const read = createStoredSlipMatchStates({ services: async () => ({ database, config }), resolveResults: async (_tx, selections, asOf) => {
    reads++; assert.equal(_tx, tx); assert.equal(asOf, at); assert.deepEqual(selections, [leg]);
    return [{ fixtureId: leg.fixtureId, family: leg.family, selection: leg.selection, forecast: leg.forecast,
      status: 'live', completed: false, regulationVerified: false, regulationHome: null, regulationAway: null,
      progress: { score: { home: 1, away: 0 }, liveClock: { phase: 'first-half', minute: 30 } } }];
  } });
  const result = await read([leg, leg, legacy], request());
  assert.equal(transactions, 1); assert.equal(reads, 1); assert.equal(result.states.length, 2);
  assert.deepEqual(result.states[0], state(leg)); assert.equal(result.states[1].status, 'unknown');
  counter = slipMatchRefreshRules.requestsPerMinute + 1;
  await assert.rejects(read([leg], request()), error => error.code === 'rate-limited');
  assert.equal(reads, 1, 'an exhausted session performs no forecast lookup');
});

test('rotating an invalid owner cookie cannot evade the stable entitled member budget', async () => {
  const leg = watch(), counts = new Map(); let reads = 0;
  const tx = { $queryRaw: async () => [{ at: new Date(at) }],
    $executeRaw: async (_query, key) => { counts.set(key, (counts.get(key) ?? 0) + 1); return 1; },
    rateLimitBucket: { findUniqueOrThrow: async ({ where }) => ({ count: counts.get(where.key) ?? 0 }) } };
  const database = { transaction: async operation => operation(tx) };
  const config = { production: false, cookies: { session: 'owner' }, key: (purpose, value) => `${purpose}:${value}` };
  const read = createStoredSlipMatchStates({ services: async () => ({ database, config }), resolveResults: async () => { reads++; return []; } });
  for (let index = 0; index < slipMatchRefreshRules.requestsPerMinute; index++) {
    await read([leg], request(undefined, { headers: { cookie: `owner=arbitrary-invalid-${index}; ${memberCookieName(false)}=stable-valid-member` } }));
  }
  await assert.rejects(read([leg], request(undefined, { headers: { cookie: `owner=another-invalid-cookie; ${memberCookieName(false)}=stable-valid-member` } })),
    error => error.code === 'rate-limited');
  assert.equal(reads, slipMatchRefreshRules.requestsPerMinute);
});

test('implicit local demo credentials use the normal budget while explicit sign-out and production stay closed', async () => {
  const variables = ['NODE_ENV', 'NEXT_PUBLIC_GOAL_HINT_DEMO', 'GOAL_HINT_DEMO_MEMBER'];
  const previous = new Map(variables.map(name => [name, process.env[name]]));
  const credentials = []; let reads = 0;
  const tx = { $queryRaw: async () => [{ at: new Date(at) }], $executeRaw: async () => 1,
    rateLimitBucket: { findUniqueOrThrow: async () => ({ count: 1 }) } };
  const database = { transaction: async operation => operation(tx) };
  const config = production => ({ production, cookies: { session: 'owner' }, key: (purpose, value) => {
    credentials.push(value); return `${purpose}:${value}`;
  } });
  const reader = production => createStoredSlipMatchStates({ services: async () => ({ database, config: config(production) }),
    resolveResults: async () => { reads++; return []; } });
  const noCookie = () => request(undefined, { headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' } });
  try {
    process.env.NODE_ENV = 'development'; process.env.NEXT_PUBLIC_GOAL_HINT_DEMO = 'true'; delete process.env.GOAL_HINT_DEMO_MEMBER;
    await reader(false)([watch()], noCookie());
    assert.deepEqual(credentials, [demoMember.token]); assert.equal(reads, 1);
    await assert.rejects(reader(false)([watch()], request(undefined, { headers: { cookie: `${memberCookieName(false)}=` } })),
      error => error.code === 'subscription-required');
    assert.equal(reads, 1, 'explicit signed-out cookie does not become an implicit demo session');
    await reader(false)([watch()], request(undefined, { headers: { cookie: `${memberCookieName(false)}=explicit-invalid` } }));
    assert.equal(credentials.at(-1), 'explicit-invalid', 'explicit cookies keep their own credential and cannot become the demo identity');
    await assert.rejects(reader(true)([watch()], noCookie()), error => error.code === 'subscription-required');
    process.env.NODE_ENV = 'production';
    await assert.rejects(reader(false)([watch()], noCookie()), error => error.code === 'subscription-required');
  } finally {
    for (const [name, value] of previous) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
