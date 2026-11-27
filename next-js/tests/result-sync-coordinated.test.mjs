import assert from "node:assert/strict";
import test from "node:test";
import { parseUtcInstant } from "../src/domain/calendar.ts";
import { coordinatedResultDefaults, finalStatus, liveDiscoveryInterval, missingFromLiveFeed, pollingInterval, requiresResultInvestigation,
  sharedLiveFixtures } from "../src/server/results/result-sync-policy.ts";
import { createResultSyncService } from "../src/server/results/result-sync-service.ts";
import { catalogFixture, catalogResponse } from "./helpers/catalog-fixtures.mjs";
import { resultAuthority, resultHash, resultPolicy, resultProvider } from "./helpers/result-sync-fixtures.mjs";

const at = parseUtcInstant("2026-11-20T21:04:00Z"), minute = 60_000, hour = 60 * minute;
const accountId = resultHash("coordinated-result-policy");
const policy = resultPolicy({ coordinated: true, approachMs: coordinatedResultDefaults.approachMs });
const fixture = (overrides = {}) => ({ fixtureId: "6998da8a-27b0-4586-910d-513c673c9341", externalId: 101,
  competitionId: 39, season: 2026, kickoffAt: at - 10 * minute, status: "live", retrievedAt: at,
  firstTrackedAt: at - hour, firstFinalAt: null, lastSyncAt: at, nextCheckAt: null, failures: 0, delayReason: null, ...overrides });

function setup(rows, respond, discovery, firstLiveAt = 0, accept = () => true, captureEvents = false) {
  let now = at;
  const clock = { now: () => now }, provider = resultProvider(clock, { accountId, respond }), events = [], reports = [];
  let owned;
  const apply = async (_lease, batch) => {
    events.push(["apply", batch]);
    for (const { fixtureId } of batch.missingLiveFixtures ?? []) {
      const index = rows.findIndex(row => row.fixtureId === fixtureId);
      rows[index] = { ...rows[index], delayReason: missingFromLiveFeed, nextCheckAt: at };
    }
    return batch.observations.filter(accept).map(({ fixtureId, kickoffAt, status, retrievedAt, regulationScore }) => ({
      fixtureId, kickoffAt, status, retrievedAt, firstFinalAt: finalStatus(status) ? retrievedAt : null,
      finalConfirmed: finalStatus(status) && regulationScore?.verified === true,
      ...(batch.liveEvents?.some(row => row.fixtureId === fixtureId) ? { liveEvents: "written" } : {}),
    }));
  };
  const store = {
    async acquire(ownerId, ms) { return owned = { accountId, ownerId, fence: 1n, until: at + ms, nextLiveAt: firstLiveAt,
      nextDateAt: at + hour, liveFailures: 0, dateFailures: 0 }; },
    async renew() { return owned; }, async release() {}, async tracked() { return rows; }, async pending() { return []; },
    async save(_lease, batch) { events.push(["save", batch]); }, apply,
    async schedule(_lease, channel, nextAt, failures, reason) {
      owned = { ...owned, nextLiveAt: nextAt, liveFailures: failures };
      events.push([channel, nextAt, reason]);
    },
    async attempts(_lease, records) { events.push(["attempts", records]); },
  };
  const service = createResultSyncService({ accountId, clock, policy, store, authority: resultAuthority(),
    adapter: captureEvents ? { ...provider.adapter.evidence, liveFixtures: provider.adapter.evidence.liveFixtureDetails } : provider.adapter.evidence,
    verifyLiveEvents: () => captureEvents, onDiscoveredFixtures: discovery, onPoll: report => reports.push(report) });
  return { service, events, network: provider.network, reports, advance(ms) { now += ms; } };
}

test("idle discovery runs every five minutes and a fixture entering its 15-minute approach resumes the one-minute cadence", async () => {
  const idle = setup([], url => catalogResponse(url, []));
  assert.equal(await idle.service.runOnce(), true);
  assert.deepEqual(idle.network.map(row => row.url.searchParams.get("live")), ["all"]);
  assert.deepEqual(idle.events.at(-1), ["live", at + 5 * minute, null]);
  const candidate = fixture({ status: "scheduled", kickoffAt: at + 15 * minute });
  const paused = setup([candidate], url => catalogResponse(url, []), undefined, at + 4 * minute);
  assert.deepEqual(sharedLiveFixtures([candidate], policy, at), [candidate]);
  assert.equal(liveDiscoveryInterval(policy, true), 10_000);
  assert.equal(liveDiscoveryInterval(policy, false, true), minute);
  assert.equal(await paused.service.runOnce(), true);
  assert.equal(paused.network.length, 1);
  assert.deepEqual(paused.events.at(-1), ["live", at + minute, null]);
  const started = fixture();
  const active = setup([started], url => catalogResponse(url, [catalogFixture(101, {
    kickoff: new Date(started.kickoffAt).toISOString(), status: "1H",
  })]), undefined, at + minute);
  assert.equal(await active.service.runOnce(), true);
  assert.equal(active.network.length, 1);
  assert.deepEqual(active.events.at(-1), ["live", at + 10_000, null]);
  const interrupted = setup([fixture({ providerStatus: "SUSP" })], url => catalogResponse(url, [catalogFixture(101, {
    kickoff: new Date(started.kickoffAt).toISOString(), status: "SUSP",
  })]));
  assert.equal(await interrupted.service.runOnce(), true);
  assert.deepEqual(interrupted.events.at(-1), ["live", at + minute, null]);
});

test("a verified disappearance persists before requesting fixture identity and never manufactures full time", async () => {
  const known = fixture(), rows = [known];
  const syntheticLive = catalogFixture(101, { kickoff: new Date(known.kickoffAt).toISOString(), status: "HT" });
  const state = setup(rows, url => catalogResponse(url, url.searchParams.has("live") ? [] : [syntheticLive]));
  assert.equal(await state.service.runOnce(), true);
  const batches = state.events.filter(([kind]) => kind === "save").map(([, batch]) => batch);
  assert.deepEqual(batches[0].missingLiveFixtures, [{ fixtureId: known.fixtureId, competitionId: 39, season: 2026 }]);
  assert.deepEqual(batches[0].observations, []);
  assert.equal(batches[1].channel, "ids");
  assert.deepEqual(batches[1].observations.map(({ status, providerStatus }) => [status, providerStatus]), [["live", "HT"]]);
  assert.equal(state.network.length, 2);
  const invalid = setup([known], url => catalogResponse(url, [], { paging: { current: 1, total: 2 } }));
  assert.equal(await invalid.service.runOnce(), true);
  assert.equal(invalid.events.some(([kind, batch]) => kind === "save" && batch.missingLiveFixtures?.length), false);
  assert.equal(invalid.network.length, 1, "an incomplete broad response does not imply disappearance");
});

test("verified discovery imports unknown in-scope rows using the already-counted response", async () => {
  const unknown = fixture(), rows = [];
  const state = setup(rows, url => catalogResponse(url, [catalogFixture(101, {
    kickoff: new Date(unknown.kickoffAt).toISOString(), status: "1H",
  })]), async (response, context) => {
    assert.equal(response.requestsDispatched, 1);
    assert.equal(response.provenance[0].requestParameters.live, "all");
    assert.deepEqual(context.unknownIds, [101]);
    rows.push(unknown);
  });
  assert.equal(await state.service.runOnce(), true);
  assert.equal(state.network.length, 1);
  assert.equal(state.events.find(([kind]) => kind === "save")[1].observations[0].fixtureId, unknown.fixtureId);
  assert.deepEqual(state.events.filter(([kind]) => kind === "live").at(-1), ["live", at + 10_000, null]);
});

test("a shared live sweep seals changed timelines across matches and does not archive unchanged copies", async () => {
  const first = fixture(), second = fixture({ fixtureId: "57cc86b9-0d27-47ec-9eec-d10c7be7a996", externalId: 102 });
  let elapsed = 5;
  const state = setup([first, second], url => catalogResponse(url, [first, second].map((row, index) => ({
    ...catalogFixture(row.externalId, { kickoff: new Date(row.kickoffAt).toISOString(), status: "1H" }),
    events: [{ time: { elapsed: index === 0 ? elapsed : 9, extra: null }, team: { id: 10 }, type: "Goal", detail: "Normal Goal" }],
  }))), undefined, 0, undefined, true);
  assert.equal(await state.service.runOnce(), true);
  assert.equal(state.network.length, 1);
  assert.deepEqual(state.events.find(([kind]) => kind === "save")[1].liveEvents.map(row => row.events.items[0].elapsed), [5, 9]);
  assert.deepEqual(state.reports[0], { channel: "live", requests: 1, fixtures: 2, applied: 2, liveEvents: 2,
    status: "completed", providerToDatabaseMs: 0 });
  state.advance(10_000);
  assert.equal(await state.service.runOnce(), true);
  assert.equal(state.events.filter(([kind]) => kind === "save").at(-1)[1].liveEvents, undefined);
  elapsed = 6;
  state.advance(10_000);
  assert.equal(await state.service.runOnce(), true);
  assert.deepEqual(state.events.filter(([kind]) => kind === "save").at(-1)[1].liveEvents.map(row => row.fixtureId), [first.fixtureId]);
});

test("overdue fixtures stay queued hourly through 48 hours and daily thereafter", () => {
  const recent = fixture({ status: "scheduled", kickoffAt: at - 48 * hour + 1 });
  const investigation = { ...recent, kickoffAt: at - 48 * hour };
  const longUnresolved = { ...recent, kickoffAt: at - 70 * 24 * hour };
  assert.equal(pollingInterval(recent, policy, at), hour);
  assert.equal(requiresResultInvestigation(recent, at), false);
  assert.equal(requiresResultInvestigation(investigation, at), true);
  assert.equal(pollingInterval(investigation, policy, at), 24 * hour);
  assert.equal(pollingInterval(longUnresolved, policy, at), 24 * hour);
  const finalWithoutRegulation = { ...longUnresolved, status: "finished-extra-time", firstFinalAt: at - 65 * 24 * hour, finalConfirmed: false };
  assert.equal(pollingInterval(finalWithoutRegulation, policy, at), 24 * hour);
  assert.equal(pollingInterval({ ...finalWithoutRegulation, kickoffAt: at - 2 * hour, firstFinalAt: at - minute }, policy, at), minute);
  assert.equal(requiresResultInvestigation(finalWithoutRegulation, at), true);
  assert.equal(pollingInterval({ ...finalWithoutRegulation, finalConfirmed: true }, policy, at), null);
});

test("an unapplied provider status cannot refresh a fixture or shorten an overdue retry", async () => {
  const known = fixture({ status: "scheduled", kickoffAt: at - 40 * hour, retrievedAt: at - hour,
    lastSyncAt: at, lastVerifiedAt: at - hour });
  const syntheticFinal = catalogFixture(known.externalId, { kickoff: new Date(known.kickoffAt).toISOString(), status: "FT" });
  const state = setup([known], url => catalogResponse(url, [syntheticFinal]), undefined, at + hour, () => false);
  assert.equal(await state.service.runOnce(), true);
  assert.equal(state.network.length, 1, "an attempted clock may not postpone the verified-status recheck");
  const batch = state.events.find(([kind]) => kind === "save")[1];
  assert.equal(batch.observations[0].status, "finished-regulation");
  assert.equal(known.status, "scheduled");
  assert.deepEqual(state.events.at(-1), ["attempts", [{ fixtureId: known.fixtureId, nextAt: at + hour, failures: 1,
    error: "unverified-provider-fixture" }]]);
});
