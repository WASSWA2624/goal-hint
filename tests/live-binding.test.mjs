import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountStatusReader, createQuotaRouter, LiveAccountError, parseAccountStatus, planMinuteLimit,
  PROVIDER_DAY_SETTLE_MS } from '../src/server/live/live-account.ts';
import { missingOwnerApprovals, OwnerApprovalError, ownerEvidenceVerifier, parseOwnerApprovals } from '../src/server/live/live-approvals.ts';
import { liveWorkload, REFRESH_REQUESTS_PER_JOB, resultSyncPolicy, selectionPolicy, liveReferences, publicationPolicy,
  providerFallbackPolicy, cutoffPolicy, lifecyclePolicy, fallbackRefreshPlan, refreshEnvelopeFor } from '../src/server/live/live-plan.ts';
import { parseRefreshPlan } from '../src/server/refresh/refresh-input.ts';
import { refreshReference } from '../src/server/refresh/refresh-input.ts';
import { latestSelectionOccurrence } from '../src/server/live/live-runner.ts';
import { liveReadiness, LiveConfigurationError } from '../src/server/live/live-runtime.ts';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { parseResultSyncPolicy } from '../src/server/results/result-sync-policy.ts';
import { parseSelectionPolicy, selectionWindow } from '../src/server/selection/selection-input.ts';
import { dailySelectionEnvelope } from '../src/server/selection/selection-trigger.ts';
import { parsePublicationPolicy } from '../src/server/predictions/publication-input.ts';
import { parseProviderFallbackPolicy } from '../src/server/fallback/fallback-adapter.ts';
import { parseCutoffPolicy } from '../src/server/predictions/cutoff-input.ts';
import { parseLifecyclePolicy } from '../src/server/predictions/lifecycle-input.ts';

// Synthetic accounts, approvals and responses only; no provider or database is contacted.
const DAY = 86_400_000, NOW = Date.parse('2026-10-10T12:00:00.000Z');
const status = (overrides = {}) => ({ get: 'status', parameters: [], errors: [], results: 1, paging: { current: 1, total: 1 },
  response: { account: { firstname: 'Synthetic', lastname: 'Owner', email: 'Owner@Example.test' },
    subscription: { plan: 'Free', end: '2027-01-01T00:00:00+00:00', active: true }, requests: { current: 10, limit_day: 100 }, ...overrides } });
const refsEnv = {
  NODE_ENV: 'production', GOAL_HINT_OPERATION_SCOPE: 'production', GOAL_HINT_FOOTBALL_ENABLED: 'true', API_FOOTBALL_KEY: 'synthetic-key',
  API_FOOTBALL_PAYABLE_MONTHLY_USD_CENTS: '0', GOAL_HINT_BUDGET_APPROVAL_REF: 'synthetic-budget', GOAL_HINT_FOOTBALL_PRIVATE_USE_REF: 'synthetic-private-use',
  GOAL_HINT_FOOTBALL_ACCOUNT_EVIDENCE_REF: 'synthetic-account', GOAL_HINT_COMPETITION_IDS: '39,140', GOAL_HINT_INFRASTRUCTURE_MONTHLY_BUDGET_USD_CENTS: '0',
  GOAL_HINT_EVIDENCE_POLICY_REF: 'synthetic-evidence', GOAL_HINT_FRESHNESS_POLICY_REF: 'synthetic-freshness', GOAL_HINT_JOB_REQUEST_LIMIT: '2',
  GOAL_HINT_JOB_TIMEOUT_SECONDS: '120', GOAL_HINT_PIPELINE_INTEGRITY_REF: 'synthetic-integrity', GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF: 'synthetic-rights',
  GOAL_HINT_QUALITY_QUALIFICATION_REF: 'synthetic-quality', GOAL_HINT_RELEASE_APPROVAL_REF: 'synthetic-release',
};

function memoryQuotaStore(clock) {
  const accounts = new Map(), periods = new Map(), attempts = new Map();
  return { periods, async transaction(accountId, operation) {
    return operation({
      now: async () => clock.now, account: async () => structuredClone(accounts.get(accountId) ?? null),
      saveAccount: async (state) => { accounts.set(accountId, structuredClone(state)); },
      period: async (id) => structuredClone(periods.get(id) ?? null), savePeriod: async (state) => { periods.set(state.id, structuredClone(state)); },
      attempt: async (id) => structuredClone(attempts.get(id) ?? null), inFlight: async () => null,
      saveAttempt: async (attempt) => { attempts.set(attempt.id, structuredClone(attempt)); },
      rollingAttempts: async () => [], periodAttempts: async () => [], unresolvedBefore: async () => 0, queueHead: async () => null,
    });
  } };
}

test('account status parsing keeps a stable credential-free identity and documented plan limits', () => {
  const free = parseAccountStatus(status(), NOW);
  assert.equal(free.dailyLimit, 100); assert.equal(free.usedToday, 10); assert.equal(free.minuteLimit, 10); assert.equal(free.secondLimit, 1);
  assert.match(free.accountKey, /^[a-f0-9]{64}$/u);
  const upper = parseAccountStatus(status({ account: { email: 'owner@example.test' } }), NOW);
  assert.equal(upper.accountKey, free.accountKey, 'email case does not split the account');
  const mega = parseAccountStatus(status({ subscription: { plan: 'Mega', end: null, active: true }, requests: { current: 0, limit_day: 150000 } }), NOW);
  assert.equal(mega.minuteLimit, 900); assert.equal(mega.secondLimit, 12); assert.equal(mega.expiresAt, null);
  assert.equal(planMinuteLimit('Unknown Custom'), 10);
  assert.equal(parseAccountStatus(status({ requests: { current: 500, limit_day: 100 } }), NOW).usedToday, 100);
  assert.throws(() => parseAccountStatus({ errors: { token: 'synthetic rejection' }, response: [] }, NOW),
    (error) => error instanceof LiveAccountError && error.reason === 'credential-failure');
  assert.throws(() => parseAccountStatus({ errors: [], response: [] }, NOW), (error) => error.reason === 'unavailable');
});

test('the status reader enforces the football gate before sending the server-only key', async () => {
  const policy = parseRuntimePolicy(refsEnv), seen = [];
  const reader = createAccountStatusReader({ policy, verifyEvidence: () => true, clock: { now: () => NOW },
    fetcher: async (url, init) => { seen.push({ url: String(url), key: init.headers['x-apisports-key'] }); return Response.json(status()); } });
  assert.equal((await reader()).plan, 'Free');
  assert.deepEqual(seen, [{ url: 'https://v3.football.api-sports.io/status', key: 'synthetic-key' }]);
  const denied = createAccountStatusReader({ policy, verifyEvidence: () => false, fetcher: async () => assert.fail('no dispatch without approval') });
  await assert.rejects(denied());
});

test('quota router opens one durable limiter per account plan and settled UTC provider day', async () => {
  const clock = { now: Date.parse('2026-10-10T00:00:30.000Z') }, store = memoryQuotaStore(clock);
  let body = status();
  const router = createQuotaRouter({ store, clock: { now: () => clock.now }, readStatus: async () => parseAccountStatus(body, clock.now) });
  const request = { requestId: 'a'.repeat(64), workKey: 'b'.repeat(64), priority: 'daily-inputs', deadlineAt: clock.now + 60_000, timeoutMs: 1000 };
  assert.deepEqual(await router.limiter.reserve(request), { status: 'denied', reason: 'reset-unconfirmed' });
  await assert.rejects(router.refresh(), (error) => error.reason === 'settling');
  clock.now = Date.parse('2026-10-10T00:00:00.000Z') + PROVIDER_DAY_SETTLE_MS;
  const first = await router.refresh();
  assert.equal(first.startsAt, Date.parse('2026-10-10T00:00:00.000Z')); assert.equal(first.endsAt, first.startsAt + DAY);
  assert.equal(await router.remaining(), 90);
  assert.deepEqual(await router.limiter.complete({ periodId: 'c'.repeat(64) }, { kind: 'success' }), { status: 'denied', reason: 'dispatch-expired' });
  body = status({ requests: { current: 40, limit_day: 100 } });
  assert.equal((await router.refresh()).accountId, first.accountId);
  assert.equal(await router.remaining(), 60, 'provider usage only ever tightens the same day');
  body = status({ requests: { current: 5, limit_day: 100 } });
  await router.refresh(); assert.equal(await router.remaining(), 60, 'a higher provider count cannot restore spent capacity');
  body = status({ subscription: { plan: 'Pro', end: '2027-01-01T00:00:00+00:00', active: true }, requests: { current: 41, limit_day: 7500 } });
  const upgraded = await router.refresh();
  assert.notEqual(upgraded.accountId, first.accountId); assert.equal(await router.remaining(), 7459, 'an upgrade is seeded from verified usage');
  clock.now = first.endsAt + PROVIDER_DAY_SETTLE_MS;
  assert.equal(router.current(), null);
  body = status({ subscription: { plan: 'Pro', end: '2027-01-01T00:00:00+00:00', active: true }, requests: { current: 0, limit_day: 7500 } });
  const next = await router.refresh();
  assert.equal(next.startsAt, first.endsAt); assert.notEqual(next.accountId, upgraded.accountId);
  clock.now += 3 * DAY;
  assert.equal((await router.refresh()).startsAt, Math.floor(clock.now / DAY) * DAY, 'missed days reconcile from provider usage');
  body = status({ subscription: { plan: 'Pro', end: '2026-10-01T00:00:00+00:00', active: true } });
  await assert.rejects(router.refresh(), (error) => error.reason === 'subscription-expired');
  body = status({ subscription: { plan: 'Pro', end: null, active: false } });
  await assert.rejects(router.refresh(), (error) => error.reason === 'subscription-inactive');
});

test('workload scales from verified limits without code changes', () => {
  const free = liveWorkload(100, 1, 'Free');
  assert.equal(free.importDays, 2, 'the free plan only requests the dates it can serve');
  assert.equal(free.cadence.liveMs, null); assert.ok(free.cadence.dateMs >= 3_000_000 && free.cadence.dateMs <= 7_200_000);
  assert.equal(free.workers, 1);
  const freeRequests = 14 + free.refreshCapacity * REFRESH_REQUESTS_PER_JOB + Math.ceil(DAY / free.cadence.dateMs);
  assert.ok(freeRequests + free.refreshFloor - Math.floor(100 * 0.25) <= 100, `free plan fits its day (${freeRequests})`);
  assert.ok(free.refreshCapacity > 0);
  const mega = liveWorkload(150_000, 12, 'Mega');
  assert.equal(mega.importDays, 7);
  assert.equal(mega.cadence.liveMs, 15_000); assert.equal(mega.cadence.dateMs, 60_000); assert.equal(mega.cadence.activeMs, 60_000);
  assert.equal(mega.refreshCapacity, 2000); assert.equal(mega.workers, 6);
  for (const limit of [1, 100, 7500, 75_000, 150_000]) {
    const workload = liveWorkload(limit, 12);
    assert.ok(workload.refreshCapacity >= 0 && workload.refreshFloor <= Math.min(limit, 120_000));
    parseResultSyncPolicy(resultSyncPolicy(liveReferences(parseRuntimePolicy(refsEnv)), workload, [{ competitionId: 39, season: 2026 }]));
  }
});

test('every generated policy passes its owning service parser', () => {
  const policy = parseRuntimePolicy(refsEnv), refs = liveReferences(policy), workload = liveWorkload(100, 1, 'Free');
  const selection = parseSelectionPolicy(selectionPolicy(policy, refs, workload));
  assert.deepEqual(selection.competitionIds, [39, 140]); assert.equal(selection.refreshCapacity, workload.refreshCapacity);
  assert.equal(selection.importDays, 2);
  assert.equal('importDays' in parseSelectionPolicy(selectionPolicy(policy, refs, liveWorkload(150_000, 12, 'Mega'))), false,
    'full-horizon plans keep the original policy shape');
  parsePublicationPolicy(publicationPolicy(refs)); parseProviderFallbackPolicy(providerFallbackPolicy(refs));
  parseCutoffPolicy(cutoffPolicy(refs)); parseLifecyclePolicy(lifecyclePolicy(refs));
});

test('daily selection is scheduled at 21:00 UTC (00:00 EAT) with one durable key per run date', () => {
  assert.equal(new Date(latestSelectionOccurrence(Date.parse('2026-10-10T20:59:59Z'))).toISOString(), '2026-10-09T21:00:00.000Z');
  assert.equal(new Date(latestSelectionOccurrence(Date.parse('2026-10-10T21:00:00Z'))).toISOString(), '2026-10-10T21:00:00.000Z');
  const bounds = { maxAttempts: 16, timeoutMs: 2_700_000, leaseMs: 60_000, fallbackReserveMs: 0, backoff: { baseMs: 60_000, maxMs: 3_600_000 }, expiresAfterMs: 2 * DAY };
  const occurrence = Date.parse('2026-10-09T21:00:00Z'), envelope = dailySelectionEnvelope(occurrence, bounds);
  assert.equal(envelope.notBefore, selectionWindow(occurrence).startInclusive);
  assert.deepEqual(dailySelectionEnvelope(occurrence, bounds), envelope);
  assert.throws(() => dailySelectionEnvelope(occurrence + 1, bounds));
  assert.throws(() => dailySelectionEnvelope(occurrence, { ...bounds, expiresAfterMs: 8 * DAY }));
});

test('owner approvals verify exact references per requirement and readiness names every gap', () => {
  const approvals = parseOwnerApprovals({ version: 1, owner: 'Synthetic owner', approvals: [
    { requirement: 'budget-approval', reference: 'synthetic-budget', approvedAt: '2026-10-10', decision: 'Synthetic approval.' }] });
  const verify = ownerEvidenceVerifier(approvals);
  assert.equal(verify('synthetic-budget', 'budget-approval'), true);
  assert.equal(verify('synthetic-budget', 'release-approval'), false);
  assert.equal(verify('other', 'budget-approval'), false);
  const missing = missingOwnerApprovals(parseRuntimePolicy(refsEnv), verify);
  assert.ok(missing.some((item) => item.startsWith('GOAL_HINT_RELEASE_APPROVAL_REF')));
  assert.ok(!missing.some((item) => item.startsWith('GOAL_HINT_BUDGET_APPROVAL_REF')));
  assert.throws(() => parseOwnerApprovals({ version: 1, owner: 'x', approvals: [] }), OwnerApprovalError);
  assert.throws(() => liveReadiness(parseRuntimePolicy({ ...refsEnv, GOAL_HINT_OPERATION_SCOPE: 'shadow',
    GOAL_HINT_SHADOW_MAX_JOBS: '1', GOAL_HINT_SHADOW_BUDGET_USD_CENTS: '1', GOAL_HINT_SHADOW_PROTOCOL_REF: 'synthetic-protocol' })),
  (error) => error instanceof LiveConfigurationError && error.issues.some((issue) => issue.includes('GOAL_HINT_OPERATION_SCOPE')));
});

test('slow per-minute plans wait out the rolling minute and skip cutoffs the queue cannot reach', () => {
  const free = liveWorkload(100, 1, 'Free', 10), mega = liveWorkload(150_000, 12, 'Mega', 900);
  assert.equal(free.pacing, 'slow'); assert.equal(mega.pacing, 'standard');
  assert.equal(liveWorkload(100, 1, 'Free').pacing, 'standard', 'an unknown minute limit keeps the original timings');
  assert.equal(free.refreshLeadMs, free.refreshCapacity * 5 * 60_000, 'one worker drains the whole budget before the last cutoff');
  assert.equal(mega.refreshLeadMs, 2 * 60 * 60_000, 'large plans cap the lead at two hours');
  const policy = parseRuntimePolicy(refsEnv), refs = liveReferences(policy);
  const selection = parseSelectionPolicy(selectionPolicy(policy, refs, free));
  assert.equal(selection.refreshLeadMs, free.refreshLeadMs);
  assert.equal(selection.refresh.timeoutMs, 300_000); assert.equal(selection.refresh.fallbackReserveMs, 200_000);
  assert.equal(parseSelectionPolicy(selectionPolicy(policy, refs, mega)).refresh.timeoutMs, 120_000);

  const now = Date.parse('2026-10-10T08:00:00Z'), jobId = 'a'.repeat(64);
  const member = (pacing, cutoffInMs) => ({ jobId, now, cycle: { cutoffAt: now + cutoffInMs },
    entry: { envelope: { ...refreshEnvelopeFor(pacing), expiresAt: now + 3_600_000 } },
    context: { fixtureId: '0ae713f1-54af-45e1-814c-8902e59ae2f6', fixtureVersion: 1n, provider: 'api-football', externalFixtureId: 1234,
      home: { teamId: '25be93db-17de-4132-ac27-a3ce599f87ad', externalId: 1 }, away: { teamId: '2ed7644e-34d7-42f7-a1db-8a4e15ffcbad', externalId: 2 },
      // The evidence cutoff precedes analysis; the cycle carries the publication cutoff.
      kickoffAt: now + cutoffInMs + 300_000, analysisAt: now, cutoffAt: now, cycleId: 'cfe189b5-82b6-4f14-9479-917ca029ba09',
      runId: '27dec311-9453-4b58-9603-d4443307d8ea' } });
  for (const pacing of ['slow', 'standard']) {
    const candidate = member(pacing, 3_600_000), plan = fallbackRefreshPlan(candidate, refs, pacing);
    assert.equal(plan.evidence.requestId, refreshReference(jobId, 'evidence'));
    parseRefreshPlan(plan, candidate);
    if (pacing === 'slow') {
      assert.equal(plan.observation.bounds.timeoutMs, 75_000, 'a status read can wait for the next rolling-minute slot');
      assert.ok(plan.fallback.bounds.retry.maxAttempts * plan.fallback.bounds.retry.maxDelayMs >= 60_000);
      assert.equal(plan.fallback.bounds.maxRequests, 1, 'waiting never adds a second dispatch');
    }
  }
  assert.throws(() => fallbackRefreshPlan(member('slow', 120_000), refs, 'slow'), (error) => error.reason === 'ineligible' && error.detail === 'insufficient-time');
  assert.throws(() => fallbackRefreshPlan({ ...member('slow', 3_600_000), entry: { envelope: { ...refreshEnvelopeFor('standard'), expiresAt: now + 3_600_000 } } }, refs, 'slow'),
    (error) => error.reason === 'ineligible', 'a job created with the old short reserve is skipped instead of failing validation');
});
