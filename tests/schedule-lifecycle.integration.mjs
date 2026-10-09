import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { evidenceHash } from './helpers/evidence-fixtures.mjs';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { ScheduleLifecycleError } from '../src/server/predictions/lifecycle-contract.ts';
import { createFootballCatalogStore } from '../src/server/football/catalog-mysql-store.ts';
import { createFootballCatalogImporter } from '../src/server/football/catalog-service.ts';
import { createMysqlDailySelectionStore } from '../src/server/selection/selection-mysql-store.ts';
import { lifecycleAuthority, lifecycleInput, lifecyclePolicy } from './helpers/lifecycle-fixtures.mjs';
import { catalogFixture, catalogRequest, createSyntheticCatalogAdapter } from './helpers/catalog-fixtures.mjs';
import { degradedAction, selectionPolicy, catalogSelectionAuthority } from './helpers/selection-fixtures.mjs';
import { PUBLICATION_NOW } from './helpers/publication-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

const execute = promisify(execFile);
const denied = (reason) => (error) => error instanceof ScheduleLifecycleError && error.reason === reason;

test('audited schedule lifecycle on isolated genuine MySQL', { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const { a, b, history, catalog, publisher, first, second, queue, setup, totals, target, setTime } = p;
    const service = (database = a, overrides = {}) => createScheduleLifecycleService({ database,
      cutoff: database === b ? second : first, policy: lifecyclePolicy(), authority: lifecycleAuthority(), ...overrides });
    const lifecycle = service(), other = service(b);
    const observed = (state, changes = {}, at = PUBLICATION_NOW + 10_000) => {
      setTime(at); return lifecycleInput(state, at, changes);
    };
    const cycle = (state) => history.findCycle(state.cycle.id);
    const jobs = (state) => a.query(async (tx) => ({
      refresh: await tx.durableJob.count({ where: { refreshFixtureId: state.fixture.id } }),
      cutoff: await tx.durableJob.count({ where: { type: 'prediction.cutoff', envelopeJson: { path: '$.payload.fixtureId', equals: state.fixture.id } } }),
      cycles: await tx.predictionCycle.count({ where: { fixtureId: state.fixture.id } }),
    }));

    await t.test('migration, append-only permissions and event bindings are enforced', async () => {
      await execute(process.execPath, ['--conditions=react-server', 'scripts/database.mjs', 'verify'], { env: p.env, windowsHide: true, timeout: 60_000 });
      const tables = await a.query((tx) => tx.$queryRaw`SELECT ENGINE, TABLE_COLLATION FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('FixtureLifecycleState','FixtureLifecycleObservation')`);
      assert.equal(tables.length, 2); assert.ok(tables.every((row) => row.ENGINE === 'InnoDB' && row.TABLE_COLLATION === 'utf8mb4_bin'));
      await assert.rejects(a.query((tx) => tx.$executeRaw`UPDATE FixtureLifecycleObservation SET reason = 'rewritten'`));
      await assert.rejects(a.query((tx) => tx.$executeRaw`DELETE FROM FixtureLifecycleObservation`));
      await assert.rejects(a.query((tx) => tx.$executeRaw`INSERT INTO PredictionChangeEvent (fixtureId, version, kind, at)
        VALUES ('10000000-0000-4000-8000-000000000001', 1, 'schedule-lifecycle', UTC_TIMESTAMP(3))`));
    });
    await t.test('ordinary delay revises one cycle and its cutoff job without AI work or manifest changes', async () => {
      const state = await setup(3005), manifest = evidenceFingerprint(state.selected.manifest), before = await jobs(state);
      const input = observed(state, { kickoffAt: state.cycle.kickoffAt + 3_600_000 });
      const results = await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? lifecycle : other).observe(input)));
      assert.ok(results.every((result) => result.id === results[0].id));
      const next = await cycle(state), after = await jobs(state);
      assert.equal(next.state, 'open'); assert.equal(next.scheduleVersion, 2);
      assert.equal(next.cutoffAt, input.fixture.kickoff - 300_000);
      assert.equal(after.refresh, before.refresh); assert.equal(after.cycles, before.cycles);
      assert.equal(after.cutoff, before.cutoff + 1);
      assert.equal(evidenceFingerprint((await createMysqlDailySelectionStore(a, queue).inspect(state.selected.selected.runId)).manifest), manifest);
      assert.equal((await history.scheduleHistory(next.id)).length, 2);
    });
    await t.test('earlier cutoff already passed locks only eligible historical publications', async () => {
      setTime(PUBLICATION_NOW); const state = await setup(3006), published = await publisher.publish(state.input, state.lease);
      await lifecycle.observe(observed(state, { kickoffAt: PUBLICATION_NOW + 301_000 }));
      const locked = await cycle(state);
      assert.equal(locked.state, 'closed'); assert.equal(locked.lockedSetId, published.revision.id);
      assert.equal(locked.closedAt, PUBLICATION_NOW + 1000);
      setTime(PUBLICATION_NOW); const invalid = await setup(3007); await publisher.publish(invalid.input, invalid.lease);
      await lifecycle.observe(observed(invalid, { kickoffAt: PUBLICATION_NOW + 299_000 }));
      assert.equal((await cycle(invalid)).state, 'closed'); assert.equal((await cycle(invalid)).lockedSetId, null);
    });
    await t.test('a later delay cannot undo a cutoff reached before the observation', async () => {
      setTime(PUBLICATION_NOW); const state = await setup(3000); await publisher.publish(state.input, state.lease);
      await lifecycle.observe(observed(state, { kickoffAt: state.cycle.kickoffAt + 3_600_000 }, state.cycle.cutoffAt + 1000));
      const closed = await cycle(state);
      assert.equal(closed.state, 'closed'); assert.equal(closed.closedAt, state.cycle.cutoffAt);
      assert.ok(closed.lockedSetId); assert.equal(closed.scheduleVersion, 2);
    });
    await t.test('early play closes before scheduled cutoff and later scheduled evidence remains a conflict', async () => {
      setTime(PUBLICATION_NOW); const state = await setup(3008), published = await publisher.publish(state.input, state.lease);
      const input = observed(state, { status: 'LIVE', actualStartedAt: PUBLICATION_NOW + 1 });
      await lifecycle.observe(input); const closed = await cycle(state);
      assert.equal(closed.state, 'closed'); assert.equal(closed.closedAt, input.actualStartedAt);
      assert.equal(closed.lockedSetId, published.revision.id);
      const conflict = await lifecycle.observe(observed(state, {}, PUBLICATION_NOW + 20_000));
      assert.equal(conflict.outcome, 'conflict'); assert.equal(conflict.reason, 'status-regressed-after-play');
      assert.equal((await cycle(state)).lockedSetId, published.revision.id);
    });
    await t.test('start correction after lock voids a breached forecast and retains its exact reference', async () => {
      setTime(PUBLICATION_NOW); const state = await setup(3009), published = await publisher.publish(state.input, state.lease);
      setTime(state.cycle.cutoffAt); const original = await first.close(target(state));
      await lifecycle.observe(observed(state, { status: 'LIVE', actualStartedAt: PUBLICATION_NOW - 1 }, state.cycle.cutoffAt + 1));
      const voided = await cycle(state);
      assert.equal(voided.state, 'void'); assert.equal(voided.voidReason, 'locked-cutoff-invalidated');
      assert.equal(voided.lockedSetId, published.revision.id); assert.equal(voided.lockedAt, original.operation.cycle.lockedAt);
      assert.equal(voided.closedAt, original.operation.cycle.closedAt);
      assert.deepEqual(await second.close(target(state)), original);
      assert.deepEqual(await history.lockedRevision(voided.id), published.revision);
    });
    await t.test('earlier kickoff correction invalidates a lock; a later delay never reopens it', async () => {
      setTime(PUBLICATION_NOW); const state = await setup(3010), published = await publisher.publish(state.input, state.lease);
      setTime(state.cycle.cutoffAt); await first.close(target(state));
      await lifecycle.observe(observed(state, { kickoffAt: PUBLICATION_NOW + 299_000 }, state.cycle.cutoffAt + 1));
      assert.equal((await cycle(state)).voidReason, 'locked-cutoff-invalidated');
      assert.equal((await cycle(state)).lockedSetId, published.revision.id);
      setTime(PUBLICATION_NOW); const delayed = await setup(3011); await publisher.publish(delayed.input, delayed.lease);
      setTime(delayed.cycle.cutoffAt); await first.close(target(delayed));
      await lifecycle.observe(observed(delayed, { kickoffAt: delayed.cycle.kickoffAt + 86_400_000 }, delayed.cycle.cutoffAt + 1));
      assert.equal((await cycle(delayed)).state, 'closed');
    });
    await t.test('formal postponement preserves an unlocked prediction and repeated delays create no cycle', async () => {
      setTime(PUBLICATION_NOW); const state = await setup(3012), published = await publisher.publish(state.input, state.lease);
      const before = await jobs(state);
      await lifecycle.observe(observed(state, { status: 'PST', kickoffAt: null }));
      const firstVoid = await cycle(state);
      assert.equal(firstVoid.state, 'void'); assert.equal(firstVoid.voidReason, 'formal-postponement');
      assert.equal(firstVoid.currentSetId, published.revision.id); assert.equal(firstVoid.lockedSetId, null);
      assert.equal((await history.displayForCycle(firstVoid.id)).revision.id, published.revision.id);
      await lifecycle.observe(observed(state, { status: 'PST', kickoffAt: state.cycle.kickoffAt + 86_400_000 }, PUBLICATION_NOW + 20_000));
      assert.deepEqual(await jobs(state), before);
      assert.equal((await cycle(state)).voidedAt, firstVoid.voidedAt);
      await first.close(target(state)); // An old cutoff delivery acknowledges the void receipt.
    });
    await t.test('only the next daily selection creates the rescheduled cycle; old manifest stays sealed', async () => {
      setTime(PUBLICATION_NOW); const state = await setup(3013), originalManifest = evidenceFingerprint(state.selected.manifest);
      await lifecycle.observe(observed(state, { status: 'PST' }));
      await lifecycle.observe(observed(state, {}, PUBLICATION_NOW + 20_000));
      const handoff = await a.query((tx) => tx.selectionCycleEligibility.findUniqueOrThrow({ where: { previousCycleId: state.cycle.id } }));
      await lifecycle.observe(observed(state, {}, PUBLICATION_NOW + 30_000));
      assert.equal((await a.query((tx) => tx.selectionCycleEligibility.findUniqueOrThrow({ where: { id: handoff.id } }))).eligibleAfter.getTime(), handoff.eligibleAfter.getTime());
      const store = createMysqlDailySelectionStore(a, queue), policy = selectionPolicy();
      policy.refresh.type = state.selected.manifest.entries[0].envelope.type;
      setTime(PUBLICATION_NOW + 40_000);
      const sameDay = await store.acquire('2026-10-09', policy, evidenceHash('same-day-resume'));
      assert.equal(evidenceFingerprint(await store.commit(sameDay, policy, null)), originalManifest); await store.release(sameDay);
      assert.equal((await jobs(state)).cycles, 1);
      setTime(Date.parse('2026-10-10T08:00:00Z'));
      const lease = await store.acquire('2026-10-10', policy, evidenceHash('next-selection'));
      const next = await store.commit(lease, policy, degradedAction); await store.release(lease);
      const member = next.entries.find((entry) => entry.fixtureId === state.fixture.id);
      assert.ok(member); assert.notEqual(member.cycleId, state.cycle.id);
      assert.equal((await history.findCycle(member.cycleId)).ordinal, 2);
      assert.equal((await cycle(state)).state, 'void');
      assert.equal((await catalog.fixtureByProviderId(3013)).id, state.fixture.id);
      assert.equal(evidenceFingerprint((await store.inspect(state.selected.selected.runId)).manifest), originalManifest);
      const secondCycle = await history.findCycle(member.cycleId), againAt = Date.parse('2026-10-10T12:00:00Z');
      setTime(againAt); await lifecycle.observe(lifecycleInput({ ...state, cycle: secondCycle }, againAt, { status: 'PST' }));
      setTime(againAt + 1000); await lifecycle.observe(lifecycleInput({ ...state, cycle: secondCycle }, againAt + 1000));
      setTime(Date.parse('2026-10-11T08:00:00Z'));
      const thirdLease = await store.acquire('2026-10-11', policy, evidenceHash('third-selection'));
      const third = await store.commit(thirdLease, policy, degradedAction); await store.release(thirdLease);
      const thirdMember = third.entries.find((entry) => entry.fixtureId === state.fixture.id);
      assert.equal((await history.findCycle(thirdMember.cycleId)).ordinal, 3);
      assert.equal((await history.findCycle(secondCycle.id)).state, 'void');
      assert.equal((await history.cyclesForFixture(state.fixture.id)).length, 3);
    });
    await t.test('canceled, abandoned and awarded observations void but retain result evidence', async () => {
      for (const [id, status, reason] of [[3014, 'CANC', 'fixture-canceled'], [3015, 'ABD', 'fixture-abandoned'], [3016, 'AWD', 'fixture-awarded']]) {
        setTime(PUBLICATION_NOW); const state = await setup(id);
        const receipt = await lifecycle.observe(observed(state, { status, raw: { goals: { home: 2, away: 1 } } }));
        assert.equal((await cycle(state)).voidReason, reason);
        assert.deepEqual(receipt.observation.reportedGoals, { home: 2, away: 1 });
        assert.equal((await lifecycle.refreshEligibility(state.fixture.id)).trackResult, true);
        if (status === 'AWD') {
          await lifecycle.observe(observed(state, { status: 'FT', raw: {
            goals: { home: 2, away: 1 }, score: { fulltime: { home: 2, away: 1 } },
          } }, PUBLICATION_NOW + 20_000));
          assert.deepEqual((await catalog.fixtureByProviderId(id)).regulationScore,
            { verified: true, period: 'regulation-including-stoppage-time', home: 2, away: 1 });
          await lifecycle.observe(observed(state, { status: 'FT' }, PUBLICATION_NOW + 30_000));
          assert.equal((await catalog.fixtureByProviderId(id)).regulationScore.home, 2);
          assert.equal((await cycle(state)).voidReason, reason);
        }
      }
    });
    await t.test('moving outside the forward window stops refresh while observations remain trackable', async () => {
      setTime(PUBLICATION_NOW); const state = await setup(3017), before = await jobs(state);
      await lifecycle.observe(observed(state, { kickoffAt: Date.parse('2026-11-12T12:00:00Z') }));
      const eligibility = await lifecycle.refreshEligibility(state.fixture.id);
      assert.equal(eligibility.eligible, false); assert.equal(eligibility.reason, 'outside-window'); assert.equal(eligibility.trackResult, true);
      assert.equal((await jobs(state)).refresh, before.refresh);
      assert.equal((await lifecycle.history(state.fixture.id)).length, 1);
    });
    await t.test('equal-time conflict and unknown mapping block publication and retain explicit evidence', async () => {
      setTime(PUBLICATION_NOW); const state = await setup(3018);
      await lifecycle.observe(observed(state));
      const conflict = await lifecycle.observe(observed(state, { kickoffAt: state.cycle.kickoffAt + 1000 }));
      assert.equal(conflict.outcome, 'conflict'); assert.equal((await cycle(state)).kickoffAt, state.cycle.kickoffAt);
      assert.equal((await lifecycle.refreshEligibility(state.fixture.id)).reason, 'same-time-conflicting-evidence');
      const input = structuredClone(state.input); input.observation.retrievedAt = PUBLICATION_NOW + 10_000;
      assert.equal((await publisher.publish(input, state.lease)).refresh.reason, 'status-ineligible');
      await lifecycle.observe(observed(state, { status: 'MYSTERY' }, PUBLICATION_NOW + 20_000));
      assert.equal((await lifecycle.refreshEligibility(state.fixture.id)).reason, 'unresolved-status-mapping');
      await lifecycle.observe(observed(state, {}, PUBLICATION_NOW + 30_000));
      assert.equal((await lifecycle.refreshEligibility(state.fixture.id)).eligible, true);
    });
    await t.test('older observations never replace schedule; older actual-start proof still invalidates locks', async () => {
      setTime(PUBLICATION_NOW); const state = await setup(3019); await publisher.publish(state.input, state.lease);
      await lifecycle.observe(observed(state, { kickoffAt: state.cycle.kickoffAt + 1000 }));
      setTime(state.cycle.cutoffAt + 1000); await first.close(target(state));
      const stale = lifecycleInput(state, PUBLICATION_NOW + 1, { status: 'LIVE', actualStartedAt: PUBLICATION_NOW - 1 });
      const receipt = await lifecycle.observe(stale);
      assert.equal(receipt.outcome, 'stale'); assert.equal((await cycle(state)).voidReason, 'locked-cutoff-invalidated');
      assert.equal((await cycle(state)).kickoffAt, state.cycle.kickoffAt + 1000);
    });
    await t.test('rescheduling races publication and closure without reopening or replacing a locked pick', async () => {
      for (const id of [3020, 3021, 3022]) {
        setTime(PUBLICATION_NOW); const state = await setup(id);
        const input = lifecycleInput(state, PUBLICATION_NOW, { kickoffAt: PUBLICATION_NOW + 299_000 });
        const results = await Promise.allSettled([lifecycle.observe(input), publisher.publish(state.input, state.lease), second.close(target(state))]);
        assert.equal(results[0].status, 'fulfilled');
        const closed = await cycle(state); assert.equal(closed.state, 'closed'); assert.equal(closed.lockedSetId, null);
        const locked = closed.lockedSetId, manifests = await jobs(state);
        await lifecycle.observe(observed(state, { kickoffAt: state.cycle.kickoffAt + 1000 }));
        assert.equal((await cycle(state)).state, 'closed'); assert.equal((await cycle(state)).lockedSetId, locked);
        assert.equal((await jobs(state)).refresh, manifests.refresh);
      }
    });
    await t.test('catalog uses the same coordinator and uncoordinated active schedule changes fail closed', async () => {
      setTime(PUBLICATION_NOW); const state = await setup(3023);
      const provider = createSyntheticCatalogAdapter({ rows: [catalogFixture(3023, { status: 'PST' })] });
      provider.clock.value = PUBLICATION_NOW + 10_000; setTime(provider.clock.value);
      const coordinated = createFootballCatalogStore(a, { clock: provider.clock, coordinateFixtureMutation: lifecycle.coordinateFixtureMutation });
      const importer = createFootballCatalogImporter({ adapter: provider.adapter, store: coordinated, authority: catalogSelectionAuthority, clock: provider.clock });
      await importer.import(catalogRequest({ kind: 'fixtures', query: { fixtureId: 3023 } }, provider.clock.value));
      assert.equal((await cycle(state)).voidReason, 'formal-postponement');
      assert.equal((await lifecycle.history(state.fixture.id)).length, 1);
      const before = await totals(state);
      provider.clock.value++; provider.network.length = 0;
      // The default importer now sees no change; use a new scheduled response to exercise the guard.
      const scheduledProvider = createSyntheticCatalogAdapter({ rows: [catalogFixture(3023)] });
      scheduledProvider.clock.value = provider.clock.value; setTime(provider.clock.value);
      const unsafe = createFootballCatalogImporter({ adapter: scheduledProvider.adapter, store: catalog,
        authority: catalogSelectionAuthority, clock: scheduledProvider.clock });
      await assert.rejects(unsafe.import(catalogRequest({ kind: 'fixtures', query: { fixtureId: 3023 } }, scheduledProvider.clock.value)));
      assert.deepEqual(await totals(state), before);
    });
    await t.test('authority failures, wrong identities and failed job scheduling roll back all effects', async () => {
      setTime(PUBLICATION_NOW); const state = await setup(3024), before = await totals(state);
      const input = observed(state, { kickoffAt: state.cycle.kickoffAt + 1000 });
      for (const overrides of [{ verifyObservation: () => false }, { verifyPolicy: async () => true }, { authorize: async () => {} }])
        await assert.rejects(service(a, { authority: lifecycleAuthority(overrides) }).observe(input), denied('unauthorized'));
      await assert.rejects(lifecycle.observe({ ...input, fixture: { ...input.fixture, homeTeam: { ...input.fixture.homeTeam, id: 999 } } }), denied('identity-unresolved'));
      const failed = service(a, { cutoff: { ...first, scheduleCycle: async () => { throw new Error('synthetic-enqueue-failure'); } } });
      await assert.rejects(failed.observe(input), denied('unavailable'));
      assert.deepEqual(await totals(state), before); assert.equal((await lifecycle.history(state.fixture.id)).length, 0);
    });
    await t.test('commit response loss replays the exact receipt with no duplicate transitions', async () => {
      setTime(PUBLICATION_NOW); const state = await setup(3025), input = observed(state, { status: 'PST' });
      let lose = true;
      const flaky = service(p.replica(undefined, async () => { if (lose) { lose = false; throw new Error('synthetic-response-loss'); } }));
      await assert.rejects(flaky.observe(input), denied('unavailable'));
      const before = await totals(state), receipt = await lifecycle.observe(input);
      assert.deepEqual(await other.observe(input), receipt); assert.deepEqual(await totals(state), before);
      assert.equal((await lifecycle.history(state.fixture.id)).length, 1);
    });
    await t.test('postponement after scheduled locking preserves the immutable lock and readable history', async () => {
      setTime(PUBLICATION_NOW); const state = await setup(3026), published = await publisher.publish(state.input, state.lease);
      setTime(state.cycle.cutoffAt); const locked = await first.close(target(state));
      await lifecycle.observe(observed(state, { status: 'PST' }, state.cycle.cutoffAt + 1));
      const voided = await cycle(state);
      assert.equal(voided.state, 'void'); assert.equal(voided.voidReason, 'formal-postponement');
      assert.equal(voided.lockedSetId, published.revision.id); assert.equal(voided.lockedAt, locked.operation.cycle.lockedAt);
      assert.deepEqual(await history.lockedRevision(voided.id), published.revision);
    });
    await t.test('an empty provider response cannot mark an absent live fixture terminal', async () => {
      setTime(PUBLICATION_NOW); const state = await setup(3027);
      await lifecycle.observe(observed(state, { status: 'LIVE' }));
      const before = await totals(state);
      const provider = createSyntheticCatalogAdapter({ rows: [] }); provider.clock.value = PUBLICATION_NOW + 10_000; setTime(provider.clock.value);
      const store = createFootballCatalogStore(a, { clock: provider.clock, coordinateFixtureMutation: lifecycle.coordinateFixtureMutation });
      const importer = createFootballCatalogImporter({ adapter: provider.adapter, store, authority: catalogSelectionAuthority, clock: provider.clock });
      await importer.import(catalogRequest({ kind: 'fixtures', query: { fixtureId: 3027 } }, provider.clock.value));
      assert.deepEqual(await totals(state), before); assert.equal((await lifecycle.history(state.fixture.id)).length, 1);
      assert.equal((await catalog.fixtureByProviderId(3027)).status, 'live');
    });
    await t.test('locking races corrected cutoff: preserve an existing lock as void or close without a pick', async () => {
      setTime(PUBLICATION_NOW); const state = await setup(3028), published = await publisher.publish(state.input, state.lease);
      setTime(state.cycle.cutoffAt);
      const input = lifecycleInput(state, state.cycle.cutoffAt, { kickoffAt: PUBLICATION_NOW + 299_000 });
      const results = await Promise.all([lifecycle.observe(input), second.close(target(state))]);
      assert.equal(results.length, 2);
      const final = await cycle(state);
      if (final.lockedSetId === null) assert.equal(final.state, 'closed');
      else { assert.equal(final.state, 'void'); assert.equal(final.lockedSetId, published.revision.id); }
      assert.equal((await jobs(state)).refresh, 1);
    });
    await t.test('verified conflicting live proof closes safely while the status disagreement stays explicit', async () => {
      setTime(PUBLICATION_NOW); const state = await setup(3029), published = await publisher.publish(state.input, state.lease);
      await lifecycle.observe(observed(state));
      const receipt = await lifecycle.observe(observed(state, { status: 'LIVE' }));
      assert.equal(receipt.outcome, 'conflict'); assert.equal((await cycle(state)).state, 'closed');
      assert.equal((await cycle(state)).lockedSetId, published.revision.id);
      assert.equal((await lifecycle.refreshEligibility(state.fixture.id)).reason, 'same-time-conflicting-evidence');
    });
  });
});
