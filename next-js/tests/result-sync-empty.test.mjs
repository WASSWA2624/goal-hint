import assert from "node:assert/strict";
import test from "node:test";
import { parseUtcInstant } from "../src/domain/calendar.ts";
import { evidenceFingerprint } from "../src/server/evidence/evidence-input.ts";
import { createResultSyncService } from "../src/server/results/result-sync-service.ts";
import { parseResultSyncPolicy } from "../src/server/results/result-sync-policy.ts";
import { resultHash, resultPolicy, resultAuthority, resultProvider } from "./helpers/result-sync-fixtures.mjs";
import { catalogFixture, catalogResponse } from "./helpers/catalog-fixtures.mjs";

const NOW = parseUtcInstant("2026-10-09T08:00:00Z"), accountId = resultHash("empty-poll-account");
function setup(options = {}) {
  const clock = { now: () => NOW }, policy = resultPolicy({ cadence: { liveMs: null, dateMs: 60_000, activeMs: 60_000 } });
  let owned = null;
  const saved = [], applied = [], schedules = [], order = [], pending = [...(options.pending ?? [])], tracked = options.tracked ?? [];
  const provider = resultProvider(clock, { accountId, ...options.provider });
  const store = {
    async acquire(ownerId, leaseMs) { return owned = { accountId, ownerId, fence: 1n, until: NOW + leaseMs,
      nextLiveAt: 0, nextDateAt: 0, liveFailures: 0, dateFailures: 0 }; },
    async renew(_lease, leaseMs) { return owned = { ...owned, until: NOW + leaseMs }; }, async release() { owned = null; },
    async tracked() { return tracked; }, async pending() { return pending; },
    async save(_lease, batch) { order.push("save"); saved.push(batch); },
    async apply(_lease, batch) { order.push(`apply:${batch.id}`); applied.push(batch); pending.splice(0, pending.length); },
    async schedule(_lease, channel, nextAt, failures, error) {
      order.push("schedule"); schedules.push({ channel, nextAt, failures, error });
      if (options.loseLeaseAtSchedule && schedules.length > 1) throw new Error("synthetic expired fence");
      owned = { ...owned, ...(channel === "date" ? { nextDateAt: nextAt, dateFailures: failures } : { nextLiveAt: nextAt, liveFailures: failures }) };
    }, async attempts() {},
  };
  const service = createResultSyncService({ accountId, clock, policy, store, adapter: provider.adapter.evidence,
    authority: resultAuthority(options.authority) });
  return { service, provider, saved, applied, schedules, order, policy, pending };
}

test("a verified complete empty poll keeps quota and fenced cadence without durable empty work", async () => {
  const state = setup();
  assert.equal(await state.service.runOnce(), true);
  assert.equal(state.provider.network.length, 1); assert.equal(state.provider.reservations.length, 1);
  assert.equal(state.saved.length, 0); assert.equal(state.applied.length, 0);
  assert.deepEqual(state.schedules.at(-1), { channel: "date", nextAt: NOW + 60_000, failures: 0, error: null });
  assert.equal(await state.service.runOnce(), true); assert.equal(state.provider.network.length, 1);
  await state.service.stop();
});

test("complete responses outside tracked coverage also have no recoverable fixture effects", async () => {
  const state = setup({ provider: { rows: [catalogFixture(101, { competitionId: 99, kickoff: "2026-10-09T11:00:00Z" })] } });
  assert.equal(await state.service.runOnce(), true); assert.equal(state.saved.length, 0);
  assert.equal(state.provider.network.length, 1); assert.equal(state.schedules.at(-1).failures, 0);
});

test("partial, failed or malformed empty responses retain durable source receipts and error backoff", async () => {
  for (const provider of [{ status: 503 }, { paging: { current: 1, total: 2 } },
    { respond: (url) => catalogResponse(url, [catalogFixture(101, { fixture: { id: 0 } })]) }]) {
    const state = setup({ provider });
    assert.equal(await state.service.runOnce(), true);
    assert.equal(state.saved.length, 1); assert.equal(state.applied.length, 1);
    assert.equal(state.saved[0].observations.length, 0); assert.notEqual(state.saved[0].error, null);
    assert.equal(state.schedules.at(-1).failures, 1); assert.notEqual(state.schedules.at(-1).error, null);
    await state.service.stop();
  }
});

test("nonempty observations preserve durable save-before-apply behavior", async () => {
  const tracked = [{ fixtureId: "6998da8a-27b0-4586-910d-513c673c9341", externalId: 101, competitionId: 39, season: 2026,
    kickoffAt: NOW + 3_600_000 * 3, status: "scheduled", retrievedAt: NOW, firstTrackedAt: NOW, firstFinalAt: null,
    lastSyncAt: NOW, nextCheckAt: NOW + 60_000, failures: 0 }];
  const state = setup({ tracked, provider: { rows: [catalogFixture(101, { kickoff: "2026-10-09T11:00:00Z" })] } });
  assert.equal(await state.service.runOnce(), true);
  assert.equal(state.saved.length, 1); assert.equal(state.saved[0].observations.length, 1);
  assert.ok(state.order.indexOf("save") < state.order.indexOf(`apply:${state.saved[0].id}`));
});

test("previously durable empty batches still recover before the next poll", async () => {
  const policy = parseResultSyncPolicy(resultPolicy({ cadence: { liveMs: null, dateMs: 60_000, activeMs: 60_000 } }));
  const batch = { id: resultHash("old-empty-batch"), accountId, policyHash: evidenceFingerprint(policy), channel: "date", date: "2026-10-09",
    receivedAt: NOW - 60_000, requestedIds: [], observations: [], error: null, requestsDispatched: 1 };
  const state = setup({ pending: [batch] });
  assert.equal(await state.service.runOnce(), true);
  assert.equal(state.applied.length, 1); assert.equal(state.applied[0].id, batch.id); assert.equal(state.pending.length, 0);
  assert.equal(state.saved.length, 0); assert.equal(state.order[0], `apply:${batch.id}`);
});

test("an empty poll still requires response authority and the final schedule's lease fence", async () => {
  const unapproved = setup({ authority: { verifyResponse: () => false } });
  await assert.rejects(unapproved.service.runOnce(), (error) => error.reason === "unauthorized");
  assert.equal(unapproved.saved.length, 0); assert.equal(unapproved.schedules.length, 1);
  const expired = setup({ loseLeaseAtSchedule: true });
  assert.equal(await expired.service.runOnce(), false); assert.equal(expired.saved.length, 0);
  assert.equal(expired.schedules.length, 2); assert.equal(expired.provider.network.length, 1);
});
