import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { subscriptionDayMs } from '../src/domain/subscription-period.ts';
import { defaultSlipCriteria } from '../src/domain/slip-builder.ts';
import { readCookie } from '../src/server/http/private-http.ts';
import { createMatchDetailHandler } from '../src/server/matches/detail-http.ts';
import { createMatchFeedHandler } from '../src/server/matches/feed-http.ts';
import { createAccessCodes } from '../src/server/members/access-codes.ts';
import { createGatedReads } from '../src/server/members/gated-reads.ts';
import { createMemberAuth } from '../src/server/members/member-auth.ts';
import { createMemberSessions, memberCookieName } from '../src/server/members/member-sessions.ts';
import { createSettingsService } from '../src/server/members/settings.ts';
import { createViewerAccess } from '../src/server/members/viewer-access.ts';
import { createBestSlipsHandler } from '../src/server/slips/best-slips-http.ts';
import { createSlipMatchStatesHandler } from '../src/server/slips/slip-match-states.ts';
import { MysqlServerUnavailableError } from './helpers/mysql-instance.mjs';
import { paidDatabase } from './helpers/paid-database.mjs';
import { scenarios, now as kickoff, today } from './helpers/paywall-fixtures.mjs';

test('stored account access controls Matches, Best Slips and Builder through the paid-access matrix', { timeout: 180_000 }, async t => {
  let fixture;
  try { fixture = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => fixture.close());
  const { database, config: databaseConfig } = fixture;
  const config = { ...databaseConfig, production: false, cookies: { session: 'synthetic-owner' } };
  const originalCreation = Date.parse('2026-11-02T12:00:00.123Z');
  let time = originalCreation;
  const now = () => time;
  const settings = createSettingsService(database, { now, environment: null });
  const auth = createMemberAuth({ database, config, now, adminPhone: () => false, adminPasswordHash: () => null });
  const codes = createAccessCodes({ database, config, now });
  const sessions = createMemberSessions({ database, config, now });
  const planId = randomUUID(), owner = 'synthetic-owner';
  await database.transaction(async tx => {
    await tx.subscriptionSettings.create({ data: { id: 1, paywallMode: 'on', trialDays: 0, updatedAt: new Date(time), updatedBy: owner } });
    await tx.subscriptionPlan.create({ data: { id: planId, name: 'Test day', durationDays: 1, priceUgx: 1000, active: true,
      sortOrder: 1, createdAt: new Date(time), updatedAt: new Date(time) } });
  });
  const password = 'synthetic member password';
  async function register(phone) {
    const result = await auth.register(phone, password, { member: null });
    assert.equal(result.status, 'authenticated');
    return result;
  }
  const none = await register('256700001011');
  const paid = await register('256700001012');
  const granted = await register('256700001013');
  assert.equal((await codes.adjustCredit(paid.accountId, 1000, 'Synthetic test credit', owner)).status, 'saved');
  const paidPeriod = await codes.purchaseWithCredit(await sessions.verify(paid.token), { planId, requestKey: randomUUID(), accepted: true });
  assert.equal(paidPeriod.status, 'created');
  assert.equal(paidPeriod.grant.source, 'credit');
  assert.equal(+paidPeriod.grant.startsAt, originalCreation);
  const grant = await codes.manual({ phone: granted.phone, durationDays: 4, amountReceivedUgx: 0, note: 'Synthetic grant' }, owner);
  assert.equal(grant.status, 'created');
  assert.equal(grant.grant.source, 'manual');
  await database.transaction(async tx => {
    await tx.memberAccount.update({ where: { id: none.accountId }, data: { phoneVerifiedAt: new Date(time) } });
    await tx.subscriptionSettings.update({ where: { id: 1 }, data: { allowUnsubscribedMembers: true, trialDays: 3 } });
  });
  const trial = await register('256700001014');
  const storedTrial = await database.query(tx => tx.accessCode.findFirstOrThrow({ where: { accountId: trial.accountId, source: 'trial' } }));
  assert.equal(+storedTrial.startsAt, originalCreation);
  assert.equal(+storedTrial.endsAt, originalCreation + 3 * subscriptionDayMs);

  // Authorization uses a separate process-style settings service from the writer above.
  const viewer = createViewerAccess({ services: async () => ({ config, database, auth: null }), now, failOnUnavailable: true });
  const resolve = request => viewer(name => readCookie(request, name));
  const cookieName = memberCookieName(config.production);
  const request = (path, token, body) => new Request(`https://goalhint.test${path}`, {
    headers: { ...(token ? { cookie: `${cookieName}=${token}` } : {}),
      ...(body ? { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' } : {}) },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  const { feed, detail } = scenarios.scheduled;
  const fixtureId = detail.fixture.fixtureId;
  const feedApi = createMatchFeedHandler(async () => feed, { now: () => kickoff }, resolve);
  const detailApi = createMatchDetailHandler(async () => detail, resolve);
  const selection = { fixtureId, kickoffAt: kickoff, homeTeam: { id: 'home', name: 'Home' }, awayTeam: { id: 'away', name: 'Away' },
    competition: { id: 'league', name: 'League', country: null }, family: 'match-result', selection: 'away-win',
    odds: '7.73', probability: 0.6173, oddsBasis: 'bookmaker' };
  const bestSlip = { rank: 1, matchCount: 1, totalOdds: '7.73', averageProbability: 0.6173, outcome: 'pending', completed: false,
    slip: { id: 'synthetic-best-slip', totalOdds: '7.73', averageProbability: 0.6173, selections: [selection] } };
  const bestApi = createBestSlipsHandler({ access: resolve, read: async () => ({ day: today, state: 'generated', slips: [bestSlip],
    searchLimited: false, partialCoverage: false }) });
  const observation = { fixtureId, family: selection.family, selection: selection.selection, status: 'unknown',
    score: null, liveClock: null, outcome: 'pending' };
  const matchesApi = createSlipMatchStatesHandler({ access: resolve, read: async () => ({ states: [observation], asOf: kickoff }) });
  const builderResult = { state: 'generated', data: { slips: [bestSlip.slip] } };

  async function check(label, token, full) {
    const expected = { tier: full ? 'full' : 'free', signedIn: Boolean(token) };
    const builder = createGatedReads({ resolveAccess: () => resolve(request('/en/slips?build=1', token)), readSlips: async () => {
      assert.ok(full, `${label}: locked Builder touched its source`);
      return builderResult;
    } });
    const [matches, match, best, states, oracle] = await Promise.all([
      feedApi(request('/api/matches', token)),
      detailApi(request(`/api/matches/${fixtureId}`, token), { params: Promise.resolve({ id: fixtureId }) }),
      bestApi(request('/api/best-slips', token)),
      matchesApi(request('/api/slips/match-states', token, { selections: [{ fixtureId, kickoffAt: kickoff,
        homeTeam: { id: 'home' }, awayTeam: { id: 'away' }, family: selection.family, selection: selection.selection, probability: selection.probability }] })),
      feedApi(request('/api/matches?sort=probability', token)),
      full ? builder.slips(defaultSlipCriteria(today)).then(result => assert.deepEqual(result, builderResult, label))
        : assert.rejects(builder.slips(defaultSlipCriteria(today)), { code: 'subscription-required' }),
    ]);
    for (const response of [matches, match, best]) {
      assert.equal(response.status, 200, label);
      assert.equal(response.headers.get('cache-control'), 'private, no-store', label);
    }
    const [feedBody, detailBody, bestBody] = await Promise.all([matches.json(), match.json(), best.json()]);
    for (const body of [feedBody, detailBody, bestBody]) assert.deepEqual(body.access, expected, label);
    assert.equal(Boolean(bestBody.slips[0].slip), full, label);
    if (full) {
      assert.match(JSON.stringify(feedBody), /SENTINEL-REASON/, label);
      assert.match(JSON.stringify(detailBody), /SENTINEL-REASON/, label);
    } else {
      assert.doesNotMatch(JSON.stringify([feedBody, detailBody]), /SENTINEL-|7\.73|home-win/, label);
      assert.equal(bestBody.slips[0].preview[0].pick, null, label);
    }
    assert.equal(states.status, full ? 200 : 403, `${label}: Builder match-state request`);
    assert.equal(oracle.status, full ? 200 : 403, `${label}: probability order request`);
  }

  for (const [label, who, entitled] of [
    ['guest', null, false], ['unentitled verified member', none, false], ['trial at creation', trial, true],
    ['paid at start', paid, true], ['admin grant at start', granted, true],
  ]) await check(`on: ${label}`, who?.token, entitled);

  assert.equal((await settings.setMode(owner, 'off')).status, 'saved');
  for (const [label, who] of [['guest', null], ['unentitled', none], ['active trial', trial], ['active paid', paid], ['admin grant', granted]]) {
    await check(`off: ${label}`, who?.token, Boolean(who));
  }
  time = +paidPeriod.grant.endsAt;
  await check('off: expired paid', paid.token, true);
  assert.equal((await settings.setMode(owner, 'on')).status, 'saved');
  time--;
  await check('on: paid one millisecond before expiry', paid.token, true);
  time++;
  await check('on: paid at exact expiry', paid.token, false);
  const secondDevice = await auth.login(trial.phone, password, '198.51.100.48');
  assert.equal(secondDevice.status, 'authenticated');
  time = +storedTrial.endsAt - 1;
  await check('on: trial one millisecond before expiry on another device', secondDevice.token, true);
  time++;
  await check('on: trial at exact expiry on original device', trial.token, false);
  await check('on: trial at exact expiry on second device', secondDevice.token, false);
  await check('on: unexpired admin grant', granted.token, true);
  time = +grant.grant.endsAt;
  await check('on: admin grant at exact expiry', granted.token, false);
  assert.equal((await settings.setMode(owner, 'off')).status, 'saved');
  await check('off: expired trial', trial.token, true);
  await check('off: expired grant', granted.token, true);
  const retainedPaid = await database.query(tx => tx.accessCode.findUniqueOrThrow({ where: { id: paidPeriod.grant.id } }));
  assert.equal(retainedPaid.revokedAt, null);
  assert.equal(+retainedPaid.endsAt, +paidPeriod.grant.endsAt);
});
