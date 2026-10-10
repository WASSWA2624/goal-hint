import assert from 'node:assert/strict';
import test from 'node:test';
import { monitoringPolicy, monitoringAuthority, monitoringSnapshot, memoryMonitoring, MONITOR_NOW } from './helpers/monitoring-fixtures.mjs';
import { MonitoringError, monitoringPolicySchema, monitoringSnapshotSchema, parseMonitoring } from '../src/server/monitoring/monitoring-contract.ts';
import { createOperationsMonitor, createLocalMonitoringSink } from '../src/server/monitoring/monitoring-alerts.ts';
import { evaluateMonitoring } from '../src/server/monitoring/monitoring-rules.ts';
import { monitoringCostFromUsage, summarizeMobileVitals, discoveryMeasurementStatus } from '../src/server/monitoring/monitoring-evidence.ts';
import { createServerMeasurements, installServerMeasurements, withServerMeasurement } from '../src/server/monitoring/server-measurements.ts';
import { createPublicResponseCache } from '../src/server/cache/public-cache.ts';
import { createMonitoringInspector } from '../src/server/monitoring/monitoring-scan.ts';
import { runMonitoringCommand } from '../src/server/monitoring/monitoring-command.ts';

test('monitoring rejects unapproved settings, raw payloads, secrets and unbounded dimensions', async () => {
  for (const changes of [{ owner: undefined }, { destination: 'https://secret@example.test' }, { retentionMs: Infinity },
    { lookbackDays: 8 }, { thresholds: {} }, { headers: { authorization: 'secret' } }])
    assert.throws(() => parseMonitoring(monitoringPolicySchema, monitoringPolicy(changes)), MonitoringError);
  for (const changes of [{ error: 'raw-private-error' }, { correlations: [{ url: '/matches?secret=query' }] },
    { metrics: { ...monitoringSnapshot().metrics, '/visitor/query': 1 } }, { correlations: Array(51).fill({}) }])
    assert.throws(() => parseMonitoring(monitoringSnapshotSchema, monitoringSnapshot(MONITOR_NOW, changes)), MonitoringError);
  for (const authority of [monitoringAuthority({ authorize: () => false }), monitoringAuthority({ verifyPolicy: () => false }),
    monitoringAuthority({ authorize: () => { throw new Error('secret'); } })]) {
    let touched = false;
    const inspector = createMonitoringInspector({ policy: monitoringPolicy(), authority, database: { transaction() { touched = true; } } });
    await assert.rejects(inspector.inspect(), (e) => e.reason === 'unauthorized' && !e.message.includes('secret'));
    const monitor = createOperationsMonitor({ policy: monitoringPolicy(), authority, store: { transaction() { touched = true; } }, sink: createLocalMonitoringSink() });
    await assert.rejects(monitor.observe(monitoringSnapshot()), MonitoringError); assert.equal(touched, false);
  }
  for (const args of [[], ['notify'], ['inspect','--binding','x.json'], ['notify','--binding','x.ts','--force']])
    await assert.rejects(runMonitoringCommand(args, new AbortController().signal), MonitoringError);
});

test('failure, staleness, quota, expiry and payable-cost injections produce owned actionable deduplicated alerts', async () => {
  const h = memoryMonitoring(() => MONITOR_NOW), snapshot = monitoringSnapshot();
  snapshot.metrics['failed-jobs'] = 2; snapshot.metrics['missing-locks'] = 1; snapshot.metrics['stale-data'] = 3;
  Object.assign(snapshot.quota, { remaining: 4000, essentialRemaining: 4000, rateLimited: 1, credentialFailure: true,
    expiresAt: MONITOR_NOW + 10_000, resetPending: true });
  snapshot.costs[0].committedUsd = '36'; snapshot.costs[1].committedUsd = '101';
  assert.ok((await h.monitor.observe(snapshot)).changed > 5);
  assert.equal((await h.monitor.observe(snapshot)).changed, 0);
  await h.monitor.deliver(); await h.monitor.deliver();
  const messages = h.sink.read(), rules = messages.map((m) => `${m.rule}:${m.scope}`);
  for (const key of ['failed-jobs:application','missing-locks:application','stale-data:application','quota-pressure:football',
    'essential-reserve:football','rate-limited:football','credential-failure:football','subscription-expiry:football','cost-pressure:football','cost-cap:ai'])
    assert.ok(rules.includes(key), key);
  assert.equal(new Set(messages.map((m) => m.id)).size, messages.length);
  assert.ok(messages.every((m) => m.owner === 'synthetic-incident-owner' && m.runbook === 'docs/operations-monitoring.md'));
  assert.equal(messages.find((m) => m.rule === 'missing-locks').severity, 'critical');
  assert.ok(!JSON.stringify(messages).includes('ownerToken'));
});

test('concurrent scans and deliveries deduplicate, retry uncertain delivery with the same id, and fence revocation', async () => {
  let now = MONITOR_NOW, attempts = [], fail = true;
  const sink = { destination: 'local-test', async publish(message) { attempts.push(message.id); if (fail) throw new Error('private-transport-error'); } };
  const h = memoryMonitoring(() => now, { sink }), snapshot = monitoringSnapshot(); snapshot.metrics['failed-jobs'] = 1;
  const other = createOperationsMonitor({ policy: monitoringPolicy(), authority: monitoringAuthority(), store: h.store, sink });
  await Promise.all([h.monitor.observe(snapshot), other.observe(snapshot)]);
  assert.equal(h.state().slots.length, 1);
  assert.equal((await h.monitor.deliver()).failed, 1);
  await other.deliver(); assert.equal(attempts.length, 1);
  now += 30_001; fail = false; await Promise.all([h.monitor.deliver(), other.deliver()]);
  assert.equal(attempts.length, 2); assert.equal(attempts[0], attempts[1]);
  const revoked = createOperationsMonitor({ policy: monitoringPolicy(), store: h.store, sink,
    authority: monitoringAuthority({ authorize: () => false }) });
  await assert.rejects(revoked.deliver(), MonitoringError); assert.equal(attempts.length, 2);
});

test('unknown evidence cannot resolve an alert; resolution/reopening, reminders and finite retention remain bounded', async () => {
  let now = MONITOR_NOW; const h = memoryMonitoring(() => now), bad = monitoringSnapshot(); bad.metrics['failed-jobs'] = 1;
  await h.monitor.observe(bad); await h.monitor.deliver(); const first = h.sink.read()[0];
  const unknown = monitoringSnapshot(now); unknown.metrics['failed-jobs'] = null;
  await h.monitor.observe(unknown);
  assert.equal(h.state().slots.find((s) => s.message.rule === 'failed-jobs').message.status, 'firing');
  await h.monitor.observe(monitoringSnapshot(now)); await h.monitor.deliver();
  assert.equal(h.sink.read().find((m) => m.rule === 'failed-jobs' && m.status === 'resolved').incidentId, first.incidentId);
  await h.monitor.observe(bad); await h.monitor.deliver();
  const reopened = h.sink.read().filter((m) => m.rule === 'failed-jobs' && m.status === 'firing').at(-1);
  assert.notEqual(reopened.incidentId, first.incidentId); assert.notEqual(reopened.id, first.id);
  now += 30_000; await h.monitor.observe({ ...bad, at: now }); assert.equal(h.state().slots.find((s) => s.message.rule === 'failed-jobs').message.changedAt, now);
  now += 60_001; await h.monitor.deliver(); assert.equal(h.state().slots.length, 0); assert.equal(h.sink.read().length, 0);
});

test('monthly football cap, distinct budgets, exact usage rates and stale/partial costs never imply free capacity', () => {
  const snapshot = monitoringSnapshot();
  snapshot.costs[0].committedUsd = '44.99'; snapshot.costs[2].committedUsd = '99';
  let rules = evaluateMonitoring(snapshot, monitoringPolicy());
  assert.equal(rules.find((r) => r.rule === 'cost-pressure' && r.scope === 'football').active, true);
  assert.equal(rules.find((r) => r.rule === 'cost-cap' && r.scope === 'football').active, false);
  snapshot.costs[0].invoicedUsd = '45.01';
  assert.equal(evaluateMonitoring(snapshot, monitoringPolicy()).find((r) => r.rule === 'cost-cap' && r.scope === 'football').active, true);
  snapshot.costs[0].capUsd = '46'; assert.throws(() => evaluateMonitoring(snapshot, monitoringPolicy()), MonitoringError);
  snapshot.costs[0].capUsd = '45'; snapshot.costs[0].coverage = 'partial'; snapshot.costs[1].measuredAt -= 120_000;
  rules = evaluateMonitoring(snapshot, monitoringPolicy());
  assert.equal(rules.find((r) => r.rule === 'evidence-pending' && r.scope === 'football').active, true);
  assert.equal(rules.find((r) => r.rule === 'cost-cap' && r.scope === 'ai').active, null);
  const cost = { ...monitoringSnapshot().costs[0] }; delete cost.committedUsd; delete cost.invoicedUsd;
  const observed = monitoringCostFromUsage({ ...cost, usage: [{ units: 3, perUnits: 2, rateUsd: '0.000000000001' }], fixedChargesUsd: '40.123456789012', invoiceUsd: null });
  assert.equal(observed.committedUsd, '40.123456789014'); assert.equal(observed.invoicedUsd, null);
  assert.throws(() => monitoringCostFromUsage({ ...cost, usage: [{ units: 1, perUnits: 1, rateUsd: 0.5 }], fixedChargesUsd: '0', invoiceUsd: null }), MonitoringError);
});

test('older snapshots and stale notification owners cannot clear or acknowledge newer incidents', async () => {
  let now = MONITOR_NOW, entered, release;
  const started = new Promise((resolve) => { entered = resolve; });
  const sink = { destination: 'local-test', async publish() { entered(); await new Promise((resolve) => { release = resolve; }); } };
  const h = memoryMonitoring(() => now, { sink }), bad = monitoringSnapshot(); bad.metrics['failed-jobs'] = 1;
  await h.monitor.observe(bad); const delivery = h.monitor.deliver(); await started;
  now += 1000; await h.monitor.observe(monitoringSnapshot(now));
  const resolvedId = h.state().slots[0].message.id;
  await h.monitor.observe(bad); assert.equal(h.state().slots[0].message.id, resolvedId);
  // Stop this delivery after the old in-flight request completes; the new payload must remain unacknowledged.
  release();
  // A replacement sink fails promptly if the loop attempts the newer message.
  sink.publish = async () => { throw new Error('synthetic-new-delivery-not-yet-sent'); };
  await delivery;
  const slot = h.state().slots.find((s) => s.message.rule === 'failed-jobs');
  assert.equal(slot.message.status, 'resolved'); assert.notEqual(slot.deliveredId, resolvedId);
});

test('server/cache measurement is opt-in, bounded, expires, omits request values and cannot break stored reads', async () => {
  let now = MONITOR_NOW; const collector = createServerMeasurements(1000, () => now);
  for (let i = 0; i < 1000; i++) collector.record('feed', 'hit', 10);
  collector.record('/private-search-query', 'success', 1); collector.record('detail', 'miss', NaN);
  assert.equal(collector.read().series.length, 1); assert.equal(collector.read().series[0].count, 1000);
  now += 1000; assert.equal(collector.read().series.length, 0);
  await assert.rejects(installServerMeasurements({ evidenceRef: 'unapproved', retentionMs: 1000, verifyPolicy: () => false }), MonitoringError);
  const session = await installServerMeasurements({ evidenceRef: 'synthetic-local-only', retentionMs: 1000, verifyPolicy: () => true });
  try {
    const handler = withServerMeasurement('feed', async () => Response.json({ stored: true }));
    await handler(new Request('http://local.test/?secret=private-search'));
    assert.equal(session.read().series[0].key, 'feed:success'); assert.ok(!JSON.stringify(session.read()).includes('secret'));
  } finally { session.close(); }
  const events = [], cache = createPublicResponseCache({ lookup: async () => { throw new Error('private'); }, reconcile: async () => ({ acknowledged: 0, removed: 0 }) }, () => now,
    (...event) => { events.push(event); throw new Error('telemetry unavailable'); });
  assert.deepEqual(await cache.read({ key: 'x', tags: [], lifetimeMs: 5, deadlineAt: now + 5, parse: (v) => v }, async () => ({ stored: true })), { stored: true });
  assert.equal(events[0][1], 'unavailable');
});

test('mobile p75 retains laboratory/field/source labels and no production traffic is invented', () => {
  const input = { evidenceRef: 'synthetic-lab', source: 'laboratory', environment: 'local', device: 'mobile', measuredAt: MONITOR_NOW, metric: 'LCP', values: [3000, 1000, 2500, 2000] };
  const lab = summarizeMobileVitals(input, () => true);
  assert.equal(lab.p75, 2500); assert.equal(lab.withinTarget, true); assert.equal(lab.productionFieldEvidence, false);
  const field = summarizeMobileVitals({ ...input, source: 'field', environment: 'production', metric: 'CLS', values: [0.2, 0.1, 0, 0.05] }, () => true);
  assert.equal(field.p75, 0.1); assert.equal(field.productionFieldEvidence, true);
  assert.throws(() => summarizeMobileVitals({ ...input, source: 'field', environment: 'production' },
    (value) => value.evidenceRef === 'synthetic-lab' && value.source === 'laboratory' && value.environment === 'local'), MonitoringError);
  assert.throws(() => summarizeMobileVitals(input, () => false));
  assert.throws(() => summarizeMobileVitals({ ...input, values: [], visitorId: 'x' }, () => true), MonitoringError);
  assert.equal(discoveryMeasurementStatus.returningVisits, 'disabled-pending-analytics-decision');
  assert.equal(discoveryMeasurementStatus.searchImpressions, 'pending-authorized-search-source');
});
