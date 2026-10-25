import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRuntimePolicy } from '../src/server/config/runtime-policy.ts';
import { liveWorkload, liveMatchPolicy, liveReferences } from '../src/server/live/live-plan.ts';
import { createLiveQuotaAdmission } from '../src/server/live/live-detail-quota.ts';
import { parseLiveMatchPolicy } from '../src/server/live-match/live-match-service.ts';

const workload = (limit = 7500, enabled = true, primary = false) => liveWorkload(limit, 5, 'Pro', 300, primary, enabled);
const request = priority => ({ priority });
const period = (overrides = {}) => ({ id: 'a'.repeat(64), used: 0, dayRemaining: 7500, priorityUsed: {}, ...overrides });
const noHistory = { periodAttempts() { assert.fail('new periods use durable counters, not an unbounded history read'); } };

test('live details are opt-in, never run on Free or slow plans, and fit alongside the protected daily work', () => {
  assert.deepEqual(parseRuntimePolicy({}).choices.liveDetails, { enabled: false });
  assert.deepEqual(parseRuntimePolicy({ GOAL_HINT_LIVE_DETAILS_ENABLED: 'true' }).choices.liveDetails, { enabled: true });
  assert.throws(() => parseRuntimePolicy({ GOAL_HINT_LIVE_DETAILS_ENABLED: 'yes' }));
  for (const enabled of [false, true]) for (const primary of [false, true]) {
    for (const [limit, plan, minute] of [[100, 'Free', 10], [7500, 'Pro', 300], [75000, 'Ultra', 450], [150000, 'Mega', 900], [75000, 'Ultra', 30]]) {
      const value = liveWorkload(limit, 12, plan, minute, primary, enabled), usable = Math.min(limit, 120000);
      const details = value.liveDetails;
      assert.equal(details.eligible, enabled && plan !== 'Free' && minute >= 60);
      assert.equal(details.requests, details.eligible ? Math.floor(usable * .2) : 0);
      assert.ok(details.floor + details.requests <= usable);
      assert.equal(value.odds.floor, details.floor + details.requests);
      assert.equal(value.odds.floor + value.odds.spare, usable);
      assert.ok(value.refreshFloor <= details.floor);
      assert.ok(value.refreshCapacity <= liveWorkload(limit, 12, plan, minute, primary).refreshCapacity);
      assert.equal(details.intervalMs, 60000);
    }
  }
});

test('production detail policy uses separate fixture endpoints, single-dispatch bounds and bounded corrections', () => {
  const policy = parseRuntimePolicy({ GOAL_HINT_EVIDENCE_POLICY_REF: 'test-evidence', GOAL_HINT_FRESHNESS_POLICY_REF: 'test-freshness',
    GOAL_HINT_PIPELINE_INTEGRITY_REF: 'test-integrity', GOAL_HINT_FOOTBALL_PRIVATE_USE_REF: 'test-retention',
    GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF: 'test-public' });
  const value = parseLiveMatchPolicy(liveMatchPolicy(liveReferences(policy), workload(), [{ competitionId: 39, season: 2026 }]));
  assert.equal(value.request.maxRequests, 1); assert.equal(value.request.maxPages, 1); assert.equal(value.request.cacheMaxAgeMs, 0);
  assert.equal(value.request.retry.maxAttempts, 8, 'limiter pacing can wait without a second provider dispatch');
  assert.equal(value.finalWindowMs, 3 * 86400000); assert.equal(value.finalIntervalMs, 900000);
  assert.ok(value.requestWindowMs + value.tickMs < value.leaseMs);
});

test('detail and enrichment use separate exact caps while ordinary work remains eligible', async () => {
  const plan = workload(), admit = createLiveQuotaAdmission(() => plan);
  assert.equal(await admit(noHistory, period(), request('live-details')), true);
  assert.equal(await admit(noHistory, period({ used: 1500, priorityUsed: { 'live-details': 1500 }, dayRemaining: 6000 }), request('live-details')), false);
  assert.equal(await admit(noHistory, period({ used: 1500, priorityUsed: { 'live-details': 1500 }, dayRemaining: 6000 }), request('results-cutoff')), true);
  // On Pro almost the whole remaining day is reserved for ordinary work plus details.
  assert.equal(plan.odds.spare, 1);
  assert.equal(await admit(noHistory, period(), request('enrichment')), true);
  assert.equal(await admit(noHistory, period({ used: 1, dayRemaining: 7499, priorityUsed: { enrichment: 1 } }), request('enrichment')), false);
  assert.equal(await admit(noHistory, period({ used: 1, dayRemaining: 7499, priorityUsed: { enrichment: 1 } }), request('live-details')), true);
});

test('remaining ordinary obligations and the reserve stop optional dispatches exactly at their boundary', async () => {
  const plan = workload(), admit = createLiveQuotaAdmission(() => plan), owed = plan.liveDetails.floor;
  assert.equal(await admit(noHistory, period({ dayRemaining: owed }), request('live-details')), false);
  assert.equal(await admit(noHistory, period({ dayRemaining: owed + 1 }), request('live-details')), true);
  assert.equal(await admit(noHistory, period({ used: owed, priorityUsed: { 'daily-inputs': owed }, dayRemaining: plan.liveDetails.reserve }), request('live-details')), false);
  assert.equal(await admit(noHistory, period({ used: owed, priorityUsed: { 'daily-inputs': owed }, dayRemaining: plan.liveDetails.reserve + 1 }), request('live-details')), true);
  assert.equal(await createLiveQuotaAdmission(() => workload(7500, false))(noHistory, period(), request('live-details')), false);
  assert.equal(await createLiveQuotaAdmission(() => null)(noHistory, period(), request('enrichment')), false);
});

test('external and previous-plan spending cannot masquerade as completed ordinary work', async () => {
  const plan = workload(75000), admit = createLiveQuotaAdmission(() => plan);
  const onlyOrdinaryLeft = period({ used: 75000 - plan.liveDetails.floor, dayRemaining: plan.liveDetails.floor, priorityUsed: {} });
  assert.equal(await admit(noHistory, onlyOrdinaryLeft, request('live-details')), false);
  assert.equal(await admit(noHistory, onlyOrdinaryLeft, request('enrichment')), false);
  assert.equal(await admit(noHistory, onlyOrdinaryLeft, request('results-cutoff')), true);
});

test('a legacy provider day counts all prior dispatches once, including uncertain attempts', async () => {
  let reads = 0, saves = 0;
  const tx = { async savePeriod() { saves++; }, async periodAttempts() { reads++; return [
    { priority: 'live-details', dispatchedAt: 1, state: 'uncertain' },
    { priority: 'enrichment', dispatchedAt: 2, state: 'completed' },
    { priority: 'live-details', dispatchedAt: null, state: 'expired' },
  ]; } };
  const value = period({ used: 2, dayRemaining: 7498, priorityUsed: undefined });
  const admit = createLiveQuotaAdmission(() => workload());
  assert.equal(await admit(tx, value, request('live-details')), true);
  assert.equal(await admit(tx, value, request('live-details')), true);
  assert.equal(reads, 1); assert.equal(saves, 1); assert.deepEqual(value.priorityUsed, { 'live-details': 1, enrichment: 1 });
});

test('legacy bootstrap uses the bounded aggregate and persists it even when admission is denied', async () => {
  let reads = 0; const saved = [];
  const tx = { ...noHistory,
    async priorityCounts(id) { assert.equal(id, 'a'.repeat(64)); reads++; return { 'live-details': 1500 }; },
    async savePeriod(value) { saved.push(structuredClone(value)); },
  };
  const value = period({ used: 1500, dayRemaining: 6000, priorityUsed: undefined }), admit = createLiveQuotaAdmission(() => workload());
  assert.equal(await admit(tx, value, request('live-details')), false);
  assert.deepEqual(saved[0].priorityUsed, { 'live-details': 1500 });
  assert.equal(await admit(tx, value, request('live-details')), false);
  assert.equal(reads, 1); assert.equal(saved.length, 1);
});

test('stable account/day admission persists across a plan account change and fails closed without a durable counter', async () => {
  const plan = workload(), budgets = new Map(), admit = createLiveQuotaAdmission(() => plan, () => 'b'.repeat(64));
  const tx = { ...noHistory, async consumeBudget(key, maximum) {
    const used = budgets.get(key) ?? 0;
    if (used >= maximum) return false;
    budgets.set(key, used + 1); return true;
  } };
  const first = period({ startsAt: 0, endsAt: 86400000 }), upgraded = period({ id: 'c'.repeat(64), startsAt: 0, endsAt: 86400000 });
  assert.equal(await admit(tx, first, request('live-details')), true);
  assert.equal(await admit(tx, upgraded, request('live-details')), true);
  assert.equal(budgets.size, 1);
  assert.equal([...budgets.values()][0], 2);
  assert.equal(await admit(noHistory, first, request('live-details')), false);
  assert.equal(await createLiveQuotaAdmission(() => plan, () => null)(tx, first, request('live-details')), false);
});
