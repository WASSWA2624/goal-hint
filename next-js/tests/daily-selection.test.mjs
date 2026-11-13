import assert from 'node:assert/strict';
import test from 'node:test';
import { addReportingDays, getReportingDate, isInWindow, parseReportingDate } from '../src/domain/calendar.ts';
import { DailySelectionError } from '../src/server/selection/selection-contract.ts';
import { parseSelectionPolicy, selectionWindow } from '../src/server/selection/selection-input.ts';
import { selectionDateState } from '../src/server/selection/selection-read.ts';
import { createDailySelectionService } from '../src/server/selection/selection-service.ts';
import { createHourlyFixtureReconciler } from '../src/server/selection/selection-fixture-reconciliation.ts';
import { createDailySelectionTrigger, dailySelectionSchedule } from '../src/server/selection/selection-trigger.ts';
import { createBearerJobIdentity } from '../src/server/jobs/job-trigger.ts';
import { API_FOOTBALL_CONTRACT_VERSION } from '../src/server/football/api-football-contract.ts';
import { CatalogStoreError } from '../src/server/football/catalog-mysql-store.ts';
import { degradedAction, selectionPolicy, selectionAuthority, SELECTION_FOR } from './helpers/selection-fixtures.mjs';

const denied = (reason) => (error) => error instanceof DailySelectionError && error.reason === reason;
test('7 October run uses Kampala midnight and exactly 7–13 October with an exclusive next boundary', () => {
  const occurrence = Date.parse('2026-10-06T21:00:00Z'), window = selectionWindow(occurrence);
  assert.equal(window.runDate, '2026-10-07'); assert.equal(window.startInclusive, occurrence);
  assert.equal(window.endExclusive, Date.parse('2026-10-13T21:00:00Z'));
  assert.equal(window.lastDate, '2026-10-13');
  for (let offset = 0; offset < 7; offset++) {
    const kickoff = occurrence + offset * 86_400_000;
    assert.ok(isInWindow(kickoff, window)); assert.equal(getReportingDate(kickoff), addReportingDays(parseReportingDate('2026-10-07'), offset));
  }
  assert.equal(isInWindow(window.startInclusive - 1, window), false);
  assert.equal(isInWindow(window.endExclusive - 1, window), true); assert.equal(isInWindow(window.endExclusive, window), false);
  assert.throws(() => selectionWindow(occurrence + 1), denied('invalid-request'));
  assert.equal(dailySelectionSchedule.cron, '0 21 * * *');
});
test('missing or unverified competition/eligibility policy blocks before storage or imports', async () => {
  assert.throws(() => parseSelectionPolicy(null), denied('policy-required'));
  for (const policy of [selectionPolicy({ competitionIds: [] }), selectionPolicy({ eligibleStatuses: ['live'] }),
    { ...selectionPolicy(), imaginaryApproval: true }]) assert.throws(() => parseSelectionPolicy(policy), denied('invalid-request'));
  const service = createDailySelectionService({ cutoff: { scheduleRun: async () => {} }, policy: selectionPolicy(), authority: selectionAuthority({ verifyPolicy: () => false }),
    importer: { import() { assert.fail('must not import'); } }, store: { acquire() { assert.fail('must not acquire'); } } });
  await assert.rejects(service.run(SELECTION_FOR), denied('policy-required'));
});
test('degraded dates never become No fixtures even when their committed known subset is empty', () => {
  const manifest = { entries: [], coverage: [{ date: '2026-10-09', status: 'failed', importId: null, missingCoverage: ['missing-page'] }] };
  assert.equal(selectionDateState(manifest, '2026-10-09').state, 'data-unavailable');
  manifest.coverage[0].status = 'partial'; assert.equal(selectionDateState(manifest, '2026-10-09').state, 'data-unavailable');
  manifest.entries.push({ kickoffAt: Date.parse('2026-10-09T09:00:00Z') });
  assert.equal(selectionDateState(manifest, '2026-10-09').state, 'partial');
  manifest.coverage[0].status = 'complete'; assert.equal(selectionDateState(manifest, '2026-10-09').state, 'selected');
  manifest.entries = []; assert.equal(selectionDateState(manifest, '2026-10-09').state, 'no-fixtures');
});
test('protected scheduled trigger authenticates before parsing, enqueues only, and retains the original occurrence on retries', async () => {
  const queued = [], secret = 's'.repeat(48), policy = selectionPolicy();
  const trigger = createDailySelectionTrigger({ identity: createBearerJobIdentity(() => secret),
    queue: { async enqueue(envelope) { queued.push(envelope); return { id: 'stable-job-id', state: 'pending' }; } },
    bounds: { maxAttempts: 3, timeoutMs: 30_000, leaseMs: 1000, fallbackReserveMs: 0, backoff: policy.refresh.backoff, expiresAfterMs: 86_400_000 } });
  const request = (body, authorization = `Bearer ${secret}`, method = 'POST') => new Request('https://synthetic.invalid/private/daily-selection', {
    method, headers: { authorization, 'content-type': 'application/json' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await trigger(request({ malformed: true }, 'Bearer wrong'))).status, 401); assert.equal(queued.length, 0);
  assert.equal((await trigger(request({}, `Bearer ${secret}`, 'GET'))).status, 405);
  assert.equal((await trigger(request({ scheduledFor: SELECTION_FOR + 1 }))).status, 400);
  assert.equal((await trigger(request({ scheduledFor: SELECTION_FOR, arbitraryPolicy: true }))).status, 400);
  assert.equal((await trigger(request({ scheduledFor: SELECTION_FOR }))).status, 202);
  assert.equal((await trigger(request({ scheduledFor: SELECTION_FOR }))).status, 202);
  assert.deepEqual(queued[0], queued[1]); assert.equal(queued[0].refresh, null); assert.equal(queued[0].type, 'daily.selection');
  assert.equal(queued[0].payload.scheduledFor, SELECTION_FOR);
});
test('lost renewal ownership prevents manifest commit and dispatch after a provider call', async () => {
  let renewals = 0, committed = 0, dispatched = 0;
  const lease = { runId: 'synthetic-run', ownerId: 'synthetic-owner', fence: 1 };
  const store = { acquire: async () => lease, inspect: async () => null, renew: async () => { if (++renewals > 1) throw new Error('lost'); },
    release: async () => {}, beginImport: async () => ({ id: 'import', request: {} }), finishImport: async () => {},
    commit: async () => { committed++; }, reconcile: async () => { dispatched++; } };
  const service = createDailySelectionService({ cutoff: { scheduleRun: async () => {} }, policy: selectionPolicy(), authority: selectionAuthority(), store, importer: { import: async () => {} } });
  await assert.rejects(service.run(SELECTION_FOR)); assert.equal(committed, 0); assert.equal(dispatched, 0);
});

test('failed optional fixture lookup leaves the date coverage retry and degraded commit intact', async () => {
  const scheduledFor = SELECTION_FOR + 3_600_000, observedAt = scheduledFor + 60_000;
  const date = getReportingDate(scheduledFor), receiptId = 'complete-date-receipt';
  const policy = selectionPolicy({ importDays: 1 });
  const lease = { runId: '00000000-0000-4000-8000-000000000001', ownerId: 'synthetic-owner', fence: 1 };
  const confirmed = '00000000-0000-4000-8000-000000000002', omitted = '00000000-0000-4000-8000-000000000003';
  const failures = [], calls = [], commits = [];
  const query = async (operation) => operation({
    dailyRun: { findFirst: async () => ({ leaseExpiresAt: new Date(observedAt + 600_000) }) },
    dailyRunImport: { findMany: async () => [{ id: receiptId, eatDate: new Date(date) }] },
    footballImport: { findMany: async () => [{ id: receiptId, status: 'complete', observedAt: new Date(observedAt),
      requestsDispatched: 1, rejectedCount: 0, fixtureIds: [confirmed], provenance: [{ provider: 'api-football', endpoint: 'fixtures',
        contractVersion: API_FOOTBALL_CONTRACT_VERSION, retrievedAt: observedAt, fromCache: false, currentPage: 1, totalPages: 1,
        requestParameters: { date, timezone: 'Africa/Kampala' } }] }] },
    footballFixture: { findMany: async () => [{ id: confirmed, externalId: 10n }, { id: omitted, externalId: 20n }] },
  });
  const reconciler = createHourlyFixtureReconciler({ database: { query }, policy: parseSelectionPolicy(policy),
    clock: { now: () => observedAt }, onLookupFailure: (...failure) => failures.push(failure),
    importer: { async import(request) {
      calls.push(request.selection.query.fixtureIds);
      throw new CatalogStoreError('coordination-failed');
    } } });
  const store = { acquire: async () => lease, inspect: async () => null, renew: async () => {}, release: async () => {},
    beginImport: async () => null, async commit(_lease, _policy, action, identities) {
      if (action === null) throw new DailySelectionError('incomplete-import');
      commits.push({ action, identities });
    }, reconcile: async () => ({ total: 0 }) };
  const service = createDailySelectionService({ cutoff: { scheduleRun: async () => {} }, policy, authority: selectionAuthority(), store,
    importer: { import() { assert.fail('existing date receipts should be reused'); } }, reconcileHourly: reconciler.reconcile });
  await assert.rejects(service.runHourly(scheduledFor), denied('incomplete-import'));
  assert.equal((await service.runHourly(scheduledFor, undefined, degradedAction)).status, 'committed');
  assert.deepEqual(calls, [[20], [20]]);
  assert.deepEqual(failures, [['coordination-failed', 1], ['coordination-failed', 1]]);
  assert.deepEqual(commits, [{ action: degradedAction, identities: [] }]);
});
