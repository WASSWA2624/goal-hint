import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { parseFixtureSnapshot } from '../src/domain/fixture-snapshot.ts';
import { matchFeedRecordSchema } from '../src/domain/match-feed.ts';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { CatalogInputError } from '../src/server/football/catalog-input.ts';
import { CatalogStoreError } from '../src/server/football/catalog-mysql-store.ts';
import { liveWorkload, teamCodeBounds, teamCodeImportsEnabled } from '../src/server/live/live-plan.ts';
import { latestOddsSlot, oddsCatalogEnvelope, oddsSlotEnvelopes } from '../src/server/odds/odds-jobs.ts';
import { createTeamCodeJobDefinitions, latestTeamCodesSlot, TEAM_CODES_HANDLER_VERSION, TEAM_CODES_MAX_REQUESTS, TEAM_CODES_PRIORITY,
  TEAM_CODES_REQUESTS_PER_SEASON, TEAM_CODES_SEASONS_PER_SLOT, TEAM_CODES_SLOT_MS, TEAM_CODES_TYPE, teamCodeJobOutcome,
  teamCodesEnvelope } from '../src/server/teams/team-code-jobs.ts';
import { teamCodeScopeKey } from '../src/server/teams/team-code-mysql-store.ts';
import { createTeamCodeService, selectTeamCodeTargets, teamCodeCheckDue, TEAM_CODE_CANDIDATE_PAGE, TEAM_CODE_CANDIDATE_PAGES,
  TEAM_CODE_FAILED_RECHECK_MS, TEAM_CODE_PROVIDER_WINDOW_MS, TEAM_CODE_RECHECK_MS, TEAM_CODE_SEASON_RESERVE_MS,
  TEAM_CODE_WINDOW } from '../src/server/teams/team-code-service.ts';
import { fixture } from './helpers/client-state-fixtures.mjs';
import { liveRecord } from './helpers/live-refresh-fixtures.mjs';

// Team codes for tight phone cards. Synthetic candidates, receipts, quota counters and clocks only; no provider call
// and no database. The MySQL store and the real catalog import run in tests/team-codes.integration.mjs.
const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-11T09:20:00.000Z'), SLOT = Date.parse('2026-10-11T09:00:00.000Z');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const EXPIRED = { status: 'failed', reason: 'eligibility-expired', retryable: false };
const allowance = (plan) => ({ floor: plan.odds.floor, spare: plan.odds.spare, reserve: plan.odds.reserve });
const PRO = liveWorkload(7_500, 5, 'Pro', 300), FREE = liveWorkload(100, 1, 'Free', 10);
const day = (used, oddsUsed = 0, remaining = 7_500 - used) => ({ remaining, used, oddsUsed });
const candidate = (competitionId, firstKickoff, season = 2026, teamsWithoutCode = 2) =>
  Object.freeze({ seasonId: `season-${competitionId}-${season}`, competitionId, season, firstKickoff, teamsWithoutCode });
const receipt = (overrides = {}) => Object.freeze({ id: '00000000-0000-4000-8000-000000000000', requestFingerprint: hash('request'),
  fingerprint: hash('batch'), status: 'complete', observedAt: NOW, recordedAt: NOW, receivedCount: 20, importedCount: 20, rejectedCount: 0,
  requestsDispatched: 1, fixtureIds: [], changedFixtureIds: [], reasons: [], ...overrides });

test('fixture teams publish a validated code; payloads cached before codes still parse', () => {
  const old = fixture();
  assert.equal('code' in old.homeTeam, false, 'the pre-code shape still parses unchanged');
  const coded = parseFixtureSnapshot({ ...old, homeTeam: { ...old.homeTeam, code: 'MUN' }, awayTeam: { ...old.awayTeam, code: null } });
  assert.equal(coded.homeTeam.code, 'MUN'); assert.equal(coded.awayTeam.code, null);
  for (const code of ['mun', ' MUN', 'M-U', 'A', 'ABCDEF', '', 'MÜN', 42]) {
    assert.throws(() => parseFixtureSnapshot({ ...old, homeTeam: { ...old.homeTeam, code } }), undefined, String(code));
  }
  // The feed record (and with it the detail response and the client refresh parse) reuses the same team schema.
  assert.equal(liveRecord({ homeTeam: { id: 'team-a', name: 'Manchester United', code: 'MUN', logoUrl: null } }).homeTeam.code, 'MUN');
  assert.equal(matchFeedRecordSchema.safeParse({ ...liveRecord(), awayTeam: { id: 'team-b', name: 'B', code: 'b' } }).success, false);
  assert.equal(matchFeedRecordSchema.parse({ ...liveRecord(), awayTeam: { id: 'team-b', name: 'B' } }).awayTeam.code, undefined);
});

test('a competition-season is due unless a stored answer is under 30 days old or a failed one under a day', () => {
  assert.equal(teamCodeCheckDue(undefined, NOW), true, 'never checked');
  const check = (settled, failed) => ({ settledAt: settled === null ? null : NOW - settled, failedAt: failed === null ? null : NOW - failed });
  assert.equal(teamCodeCheckDue(check(TEAM_CODE_RECHECK_MS - 1, null), NOW), false, 'a codeless league is not re-requested for 30 days');
  assert.equal(teamCodeCheckDue(check(TEAM_CODE_RECHECK_MS, null), NOW), true);
  assert.equal(teamCodeCheckDue(check(null, TEAM_CODE_FAILED_RECHECK_MS - 1), NOW), false, 'a failed receipt backs off for a day');
  assert.equal(teamCodeCheckDue(check(null, TEAM_CODE_FAILED_RECHECK_MS), NOW), true);
  assert.equal(teamCodeCheckDue(check(10 * DAY, 2 * DAY), NOW), false, 'a later failure never reopens a settled league');
  assert.equal(teamCodeCheckDue(check(40 * DAY, HOUR), NOW), false, 'an old settlement still waits out a fresh failure');
  assert.deepEqual([TEAM_CODE_RECHECK_MS, TEAM_CODE_FAILED_RECHECK_MS], [30 * DAY, DAY]);
});

test('targets run nearest kickoff first, skip recently checked leagues and stop at the limit', () => {
  const candidates = [candidate(40, NOW + 5 * HOUR), candidate(39, NOW + 2 * HOUR), candidate(61, NOW + HOUR), candidate(78, NOW + HOUR),
    candidate(140, NOW + 3 * DAY), candidate(135, NOW + 2 * DAY)];
  const checks = new Map([[teamCodeScopeKey(candidates[2]), { settledAt: NOW - 10 * DAY, failedAt: null }],
    [teamCodeScopeKey(candidates[0]), { settledAt: null, failedAt: NOW - 2 * DAY }]]);
  const targets = selectTeamCodeTargets(candidates, checks, NOW, 3);
  assert.deepEqual(targets.map((target) => target.competitionId), [78, 39, 40], '61 was checked 10 days ago; ties order by league id');
  assert.ok(Object.isFrozen(targets));
  assert.deepEqual(selectTeamCodeTargets(candidates, checks, NOW, 0), []);
  assert.throws(() => selectTeamCodeTargets(candidates, checks, NOW, -1), RangeError);
  assert.notEqual(teamCodeScopeKey({ competitionId: 39, season: 2026 }), teamCodeScopeKey({ competitionId: 39, season: 2025 }));
  assert.equal(teamCodeScopeKey({ competitionId: 39, season: 2026 }), teamCodeScopeKey(candidate(39, NOW)), 'the key depends only on the query');
});

function serviceHarness(candidates, options = {}) {
  const reads = [], requests = [];
  const store = {
    async candidates(window, limit) { reads.push({ kind: 'candidates', window, limit }); return candidates; },
    async checks(targets, since) { reads.push({ kind: 'checks', targets: targets.length, since }); return options.checks ?? new Map(); },
  };
  const importer = { async import(request) {
    requests.push(request);
    const answer = options.answer?.(request, requests.length) ?? receipt();
    if (answer instanceof Error) throw answer;
    return answer;
  } };
  const service = createTeamCodeService({ store, importer, retentionEvidenceRef: 'synthetic-retention', bounds: teamCodeBounds, clock: () => NOW });
  return { reads, requests, service };
}

test('a sweep imports at most its seasons through the catalog teams import, at enrichment priority and bounded', async () => {
  const candidates = [candidate(61, NOW + HOUR), candidate(39, NOW + 2 * HOUR), candidate(40, NOW + 5 * HOUR), candidate(78, NOW + DAY),
    candidate(140, NOW + 3 * DAY), candidate(135, NOW + 2 * DAY, 2025)];
  const checks = new Map([[teamCodeScopeKey(candidates[1]), { settledAt: NOW - 29 * DAY, failedAt: null }],
    [teamCodeScopeKey(candidates[3]), { settledAt: NOW - 31 * DAY, failedAt: null }]]);
  const h = serviceHarness(candidates, { checks, answer: (request) => receipt({ requestsDispatched: request.selection.query.competitionId === 40 ? 2 : 1 }) });
  const summary = await h.service.sweep({ now: NOW, maxSeasons: TEAM_CODES_SEASONS_PER_SLOT, remainingMs: () => 10 * MINUTE });
  assert.deepEqual(h.reads, [{ kind: 'candidates', window: { from: NOW - TEAM_CODE_WINDOW.beforeMs, to: NOW + TEAM_CODE_WINDOW.afterMs }, limit: 200 },
    { kind: 'checks', targets: 6, since: NOW - TEAM_CODE_RECHECK_MS }]);
  assert.deepEqual(h.requests.map((request) => request.selection), [61, 40, 78, 135].map((competitionId) =>
    ({ kind: 'teams', query: { competitionId, season: competitionId === 135 ? 2025 : 2026 } })), '39 was checked 29 days ago, 78 31 days ago');
  for (const request of h.requests) {
    assert.match(request.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    assert.equal(request.retentionEvidenceRef, 'synthetic-retention');
    assert.equal(request.bounds.priority, 'enrichment', 'never the essential reserve');
    assert.equal(request.bounds.maxRequests, TEAM_CODES_REQUESTS_PER_SEASON); assert.equal(request.bounds.retry.maxAttempts, TEAM_CODES_REQUESTS_PER_SEASON);
    assert.equal(request.bounds.deadlineAt, NOW + TEAM_CODE_PROVIDER_WINDOW_MS); assert.equal(request.bounds.cacheMaxAgeMs, 0);
  }
  assert.equal(new Set(h.requests.map((request) => request.id)).size, 4);
  assert.deepEqual({ ...summary, seasons: summary.seasons.map((season) => [season.competitionId, season.status, season.requestsDispatched]) },
    { candidates: 6, due: 4, seasons: [[61, 'complete', 1], [40, 'complete', 2], [78, 'complete', 1], [135, 'complete', 1]],
      requestsDispatched: 5, uncertain: false, stopped: null });
  assert.ok(Object.isFrozen(summary) && Object.isFrozen(summary.seasons));
  assert.ok(TEAM_CODES_SEASONS_PER_SLOT * TEAM_CODES_REQUESTS_PER_SEASON === TEAM_CODES_MAX_REQUESTS);
});

test('nothing due makes no request; a failed receipt stops the sweep and storage faults are uncertain', async () => {
  const candidates = [candidate(61, NOW + HOUR), candidate(39, NOW + 2 * HOUR), candidate(40, NOW + 3 * HOUR)];
  const settled = new Map(candidates.map((entry) => [teamCodeScopeKey(entry), { settledAt: NOW - DAY, failedAt: null }]));
  let h = serviceHarness(candidates, { checks: settled });
  assert.deepEqual(await h.service.sweep({ now: NOW, maxSeasons: 4, remainingMs: () => 10 * MINUTE }),
    { candidates: 3, due: 0, seasons: [], requestsDispatched: 0, uncertain: false, stopped: null });
  assert.equal(h.requests.length, 0);

  h = serviceHarness(candidates, { answer: (_request, n) => n === 2 ? receipt({ status: 'failed', requestsDispatched: 2, importedCount: 0 }) : receipt() });
  let summary = await h.service.sweep({ now: NOW, maxSeasons: 4, remainingMs: () => 10 * MINUTE });
  assert.equal(h.requests.length, 2, 'provider or quota trouble ends the slot; the failed receipt backs that league off');
  assert.deepEqual([summary.stopped, summary.requestsDispatched, summary.uncertain, summary.seasons.map((season) => season.status)],
    ['failed-receipt', 3, false, ['complete', 'failed']]);

  for (const [error, stopped] of [[new CatalogStoreError('unavailable'), 'unavailable'], [new CatalogStoreError('coordination-failed'), 'unavailable'],
    [new CatalogStoreError('conflicting-import'), 'refused'], [new CatalogInputError('operation-not-authorized'), 'refused'], [new Error('boom'), 'refused']]) {
    h = serviceHarness(candidates, { answer: (_request, n) => n === 2 ? error : receipt() });
    summary = await h.service.sweep({ now: NOW, maxSeasons: 4, remainingMs: () => 10 * MINUTE });
    assert.equal(h.requests.length, 2);
    assert.deepEqual([summary.stopped, summary.uncertain, summary.requestsDispatched, summary.seasons.length], [stopped, true, 1, 1], error.message);
  }
});

test('selection pages past recently checked leagues in kickoff order, so codeless leagues never starve unchecked ones', async () => {
  // Leagues that stay codeless after their check remain candidates; 230 of them kick off before the first unchecked one.
  const all = Array.from({ length: 1_300 }, (_, index) => candidate(1_000 + index, NOW + index * MINUTE));
  const order = (left, right) => left.firstKickoff - right.firstKickoff || left.competitionId - right.competitionId || left.season - right.season;
  const harness = (settledCount) => {
    const reads = [], requests = [];
    const settled = new Set(all.slice(0, settledCount).map(teamCodeScopeKey));
    const store = {
      async candidates(window, limit, after = null) {
        reads.push({ kind: 'candidates', limit, after: after && after.competitionId });
        return all.filter((entry) => after === null || order(entry, after) > 0).slice(0, limit);
      },
      async checks(targets, since) {
        reads.push({ kind: 'checks', targets: targets.length });
        assert.equal(since, NOW - TEAM_CODE_RECHECK_MS);
        return new Map(targets.filter((entry) => settled.has(teamCodeScopeKey(entry)))
          .map((entry) => [teamCodeScopeKey(entry), { settledAt: NOW - DAY, failedAt: null }]));
      },
    };
    const importer = { async import(request) { requests.push(request.selection.query.competitionId); return receipt(); } };
    return { reads, requests, service: createTeamCodeService({ store, importer, retentionEvidenceRef: 'synthetic-retention', bounds: teamCodeBounds, clock: () => NOW }) };
  };
  let h = harness(230);
  let summary = await h.service.sweep({ now: NOW, maxSeasons: 4, remainingMs: () => 10 * MINUTE });
  assert.deepEqual(h.requests, [1_230, 1_231, 1_232, 1_233], 'the nearest unchecked leagues, behind 230 checked ones');
  assert.deepEqual(h.reads, [{ kind: 'candidates', limit: TEAM_CODE_CANDIDATE_PAGE, after: null }, { kind: 'checks', targets: 200 },
    { kind: 'candidates', limit: TEAM_CODE_CANDIDATE_PAGE, after: 1_199 }, { kind: 'checks', targets: 200 }],
  'the second page starts after the last candidate of the first and the read stops once four are due');
  assert.deepEqual([summary.candidates, summary.due, summary.stopped], [400, 4, null]);

  h = harness(1_300);
  summary = await h.service.sweep({ now: NOW, maxSeasons: 4, remainingMs: () => 10 * MINUTE });
  assert.deepEqual([h.requests.length, summary.candidates, summary.due], [0, TEAM_CODE_CANDIDATE_PAGE * TEAM_CODE_CANDIDATE_PAGES, 0],
    'the read is bounded: five pages, then the sweep waits for the window to move');
  assert.equal(h.reads.filter((entry) => entry.kind === 'candidates').length, TEAM_CODE_CANDIDATE_PAGES);

  h = harness(198);
  summary = await h.service.sweep({ now: NOW, maxSeasons: 4, remainingMs: () => 10 * MINUTE });
  assert.deepEqual(h.requests, [1_198, 1_199, 1_200, 1_201], 'targets that straddle a page boundary keep their kickoff order');
  assert.equal(TEAM_CODE_CANDIDATE_PAGE <= 500, true, 'a page fits the store bound');
});

test('a season whose earliest codeless kickoff moves between page reads is requested once per sweep', async () => {
  // Page 1 ends with league 1_199. Before page 2 is read, a concurrent catalog write moves league 1_198's earliest
  // codeless fixture later (its first fixture's team got a code), so the keyset read returns it again.
  const first = Array.from({ length: TEAM_CODE_CANDIDATE_PAGE }, (_, index) => candidate(1_000 + index, NOW + index * MINUTE));
  const second = [candidate(1_198, NOW + 300 * MINUTE), candidate(1_400, NOW + 301 * MINUTE)];
  const settled = new Set(first.slice(0, 198).map(teamCodeScopeKey)), requests = [], checked = [];
  const store = {
    async candidates(_window, _limit, after = null) { return after === null ? first : second; },
    async checks(targets) {
      checked.push(targets.map((entry) => entry.competitionId));
      return new Map(targets.filter((entry) => settled.has(teamCodeScopeKey(entry))).map((entry) => [teamCodeScopeKey(entry), { settledAt: NOW - DAY, failedAt: null }]));
    },
  };
  const importer = { async import(request) { requests.push(request.selection.query.competitionId); return receipt(); } };
  const service = createTeamCodeService({ store, importer, retentionEvidenceRef: 'synthetic-retention', bounds: teamCodeBounds, clock: () => NOW });
  const summary = await service.sweep({ now: NOW, maxSeasons: 4, remainingMs: () => 10 * MINUTE });
  assert.deepEqual(requests, [1_198, 1_199, 1_400]);
  assert.deepEqual(checked[1], [1_400], 'the repeated season is neither re-checked nor re-selected');
  assert.deepEqual([summary.candidates, summary.due], [202, 3]);
});

test('a season starts only while its provider window and write fit, and never after the job is aborted', async () => {
  const candidates = [candidate(61, NOW + HOUR), candidate(39, NOW + 2 * HOUR)];
  let remaining = TEAM_CODE_SEASON_RESERVE_MS;
  let h = serviceHarness(candidates, { answer: () => { remaining -= 1; return receipt(); } });
  const summary = await h.service.sweep({ now: NOW, maxSeasons: 4, remainingMs: () => remaining });
  assert.deepEqual([h.requests.length, summary.stopped], [1, 'time']);
  const controller = new AbortController(); controller.abort();
  h = serviceHarness(candidates);
  assert.equal((await h.service.sweep({ now: NOW, maxSeasons: 4, remainingMs: () => DAY, signal: controller.signal })).stopped, 'aborted');
  assert.equal(h.requests.length, 0);
});

test('team-code envelopes carry only the hourly slot, sit below every odds job and expire with their slot', () => {
  assert.equal(latestTeamCodesSlot(NOW), SLOT); assert.equal(latestTeamCodesSlot(SLOT), SLOT);
  const envelope = teamCodesEnvelope(SLOT);
  assert.deepEqual([envelope.type, envelope.handlerVersion, envelope.payload, envelope.notBefore, envelope.expiresAt, envelope.priority, envelope.refresh],
    [TEAM_CODES_TYPE, TEAM_CODES_HANDLER_VERSION, { slot: SLOT }, SLOT, SLOT + TEAM_CODES_SLOT_MS, TEAM_CODES_PRIORITY, null]);
  assert.equal(teamCodesEnvelope(SLOT).idempotencyKey, envelope.idempotencyKey, 'a restart re-enqueues the same row');
  assert.notEqual(teamCodesEnvelope(SLOT + HOUR).idempotencyKey, envelope.idempotencyKey);
  const odds = [oddsCatalogEnvelope(NOW), ...oddsSlotEnvelopes(latestOddsSlot(NOW), 7)];
  assert.ok(odds.every((entry) => entry.priority > envelope.priority), 'odds claim the shared enrichment worker first');
  assert.ok(Object.isFrozen(envelope));
  for (const slot of [SLOT + 1, Number.NaN, 1.5]) assert.throws(() => teamCodesEnvelope(slot), RangeError);
});

test('team-code imports follow the odds eligibility: never on Free or slow plans, and the owner can turn them off', () => {
  const on = parseRuntimePolicy({}), off = parseRuntimePolicy({ GOAL_HINT_TEAM_CODES_IMPORT_ENABLED: 'false' });
  assert.equal(teamCodeImportsEnabled(on, PRO), true);
  assert.equal(teamCodeImportsEnabled(off, PRO), false);
  assert.equal(teamCodeImportsEnabled(on, FREE), false, 'Free has no spare (and slow pacing)');
  assert.equal(teamCodeImportsEnabled(on, liveWorkload(75_000, 12, 'Ultra', 30)), false, 'slow pacing keeps them off whatever the spare');
  const bounds = teamCodeBounds(NOW + MINUTE);
  assert.deepEqual([bounds.priority, bounds.maxRequests, bounds.maxPages, bounds.retry.maxAttempts, bounds.cacheMaxAgeMs], ['enrichment', 2, 1, 2, 0]);
  assert.ok(Object.isFrozen(bounds));
});

function jobHarness(options = {}) {
  const sweeps = [], usages = [];
  const state = { enabled: true, usage: day(0), at: NOW, summary: summaryOf(), failure: null, ...options };
  const service = { async sweep(request) { sweeps.push(request); if (state.failure) throw state.failure; return state.summary; } };
  const [job, ...others] = createTeamCodeJobDefinitions({ service, enabled: () => state.enabled, usage: async () => state.usage,
    allowance: options.allowance ?? allowance(PRO), now: () => state.at });
  assert.equal(others.length, 0);
  const context = { lease: { jobId: hash('job'), attemptId: hash('attempt') }, signal: new AbortController().signal,
    remainingMs: () => 9 * MINUTE, checkpoint: async () => {}, recordUsage: async (usage) => { usages.push(usage); } };
  return { sweeps, usages, state, job, context };
}
function summaryOf(overrides = {}) {
  return { candidates: 9, due: 2, seasons: [{ competitionId: 61, season: 2026, teamsWithoutCode: 4, status: 'complete', requestsDispatched: 1, importedTeams: 18 },
    { competitionId: 39, season: 2026, teamsWithoutCode: 2, status: 'partial', requestsDispatched: 2, importedTeams: 20 }],
  requestsDispatched: 3, uncertain: false, stopped: null, ...overrides };
}

test('disabled team-code jobs and Free plans expire without a provider call; spare quota allows one bounded sweep', async () => {
  let h = jobHarness({ enabled: false });
  assert.equal(await h.job.eligible({ slot: SLOT }, h.context.signal), false, 'disabled jobs expire at their first checkpoint');
  assert.deepEqual(await h.job.handle({ slot: SLOT }, h.context), EXPIRED);
  assert.deepEqual([h.sweeps.length, h.usages.length], [0, 0]);

  // Even with the switch on, the Free plan's allowance has no room for the slot's ceiling.
  h = jobHarness({ allowance: allowance(FREE), usage: { remaining: 100, used: 0, oddsUsed: 0 } });
  assert.ok(FREE.odds.spare < TEAM_CODES_MAX_REQUESTS);
  assert.deepEqual(await h.job.handle({ slot: SLOT }, h.context), EXPIRED, 'Free: no requests');
  assert.equal(h.sweeps.length, 0);

  h = jobHarness({ usage: day(720) });
  assert.deepEqual(await h.job.handle({ slot: SLOT }, h.context), { status: 'succeeded' });
  assert.equal(h.sweeps.length, 1);
  assert.deepEqual([h.sweeps[0].now, h.sweeps[0].maxSeasons], [NOW, TEAM_CODES_SEASONS_PER_SLOT]);
  assert.equal(h.sweeps[0].remainingMs(), 9 * MINUTE);
  assert.deepEqual(h.usages.map((usage) => [usage.provider, usage.phase, usage.requests, usage.costReference]), [['football', 'completed', 3, null]]);
  assert.match(h.usages[0].requestReference, /^[a-f0-9]{64}$/u);
});

test('the shared spare gate: team codes need their whole ceiling under the spare odds have left, and never the reserve', async () => {
  const pro = allowance(PRO);
  let h = jobHarness({ usage: day(3_000, pro.spare - TEAM_CODES_MAX_REQUESTS) });
  assert.deepEqual(await h.job.handle({ slot: SLOT }, h.context), { status: 'succeeded' }, 'enrichment spend so far plus 8 fits');
  h = jobHarness({ usage: day(3_000, pro.spare - TEAM_CODES_MAX_REQUESTS + 1) });
  assert.deepEqual(await h.job.handle({ slot: SLOT }, h.context), EXPIRED, 'odds (or earlier sweeps) spent the spare');
  assert.equal(h.sweeps.length, 0);
  h = jobHarness({ usage: day(7_500 - pro.reserve - TEAM_CODES_MAX_REQUESTS + 1) });
  assert.deepEqual(await h.job.handle({ slot: SLOT }, h.context), EXPIRED, 'ordinary work past its plan keeps the reserve');
  h = jobHarness({ usage: null });
  assert.deepEqual(await h.job.handle({ slot: SLOT }, h.context), { status: 'failed', reason: 'rate-limited', retryable: true },
    'before the new provider day opens, the job retries within its slot');
  h = jobHarness({ at: SLOT + TEAM_CODES_SLOT_MS });
  assert.deepEqual(await h.job.handle({ slot: SLOT }, h.context), EXPIRED);
  assert.equal(h.sweeps.length, 0);
  // The sweep never runs past its slot, even when the attempt would allow it.
  h = jobHarness({ at: SLOT + TEAM_CODES_SLOT_MS - 2 * MINUTE });
  await h.job.handle({ slot: SLOT }, h.context);
  assert.equal(h.sweeps[0].remainingMs(), 2 * MINUTE);
});

test('sweep outcomes: storage faults retry, refusals fail, everything else keeps its receipts and succeeds', async () => {
  for (const [stopped, outcome] of [[null, { status: 'succeeded' }], ['failed-receipt', { status: 'succeeded' }], ['time', { status: 'succeeded' }],
    ['aborted', { status: 'succeeded' }], ['unavailable', { status: 'failed', reason: 'handler-failed', retryable: true }],
    ['refused', { status: 'failed', reason: 'non-retryable', retryable: false }]]) {
    assert.deepEqual(teamCodeJobOutcome({ stopped }), outcome, String(stopped));
  }
  let h = jobHarness({ summary: summaryOf({ seasons: [], due: 0, requestsDispatched: 0 }) });
  assert.deepEqual(await h.job.handle({ slot: SLOT }, h.context), { status: 'succeeded' });
  assert.equal(h.usages.length, 0, 'a slot with nothing due records no usage');
  h = jobHarness({ summary: summaryOf({ uncertain: true, stopped: 'unavailable', requestsDispatched: 1 }) });
  assert.deepEqual(await h.job.handle({ slot: SLOT }, h.context), { status: 'failed', reason: 'handler-failed', retryable: true });
  assert.deepEqual(h.usages.map((usage) => [usage.phase, usage.requests]), [['uncertain', 1]]);
  h = jobHarness({ failure: new Error('selection read failed') });
  assert.deepEqual(await h.job.handle({ slot: SLOT }, h.context), { status: 'failed', reason: 'handler-failed', retryable: true });
  assert.equal(h.usages.length, 0, 'selection reads run before any provider call');
});
