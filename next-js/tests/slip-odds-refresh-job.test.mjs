import assert from "node:assert/strict";
import test from "node:test";
import { createSlipOddsRefreshJob, slipOddsRefreshFixtureLimit } from "../src/server/odds/slip-odds-refresh-job.ts";
import { slipOddsRefreshEnvelope } from "../src/server/odds/slip-odds-refresh-slot.ts";

const publicationSlot = Date.parse("2026-11-26T22:30:00Z");
const payload = { publicationSlot };
const { idempotencyKey: jobId } = slipOddsRefreshEnvelope(publicationSlot);
const date = "2026-11-27";

function fixtureRefresh(overrides = {}, contextOverrides = {}) {
  const requests = [], usage = [];
  const definition = createSlipOddsRefreshJob({
    enabled: () => true,
    policy: () => ({}),
    candidates: async () => [{ fixtureId: 11, date }, { fixtureId: 22, date }],
    usage: async () => ({ remaining: 100, used: 10, oddsUsed: 2 }),
    allowance: { floor: 50, spare: 20, reserve: 5 },
    service: { async importFixture(request) {
      requests.push(request);
      return { status: "complete", requestsDispatched: 1 };
    } },
    now: () => publicationSlot - 300_000,
    ...overrides,
  });
  const context = { lease: { jobId, attemptId: "a".repeat(64) }, signal: new AbortController().signal,
    async checkpoint() {}, async recordUsage(record) { usage.push(record); }, remainingMs: () => 300_000, ...contextOverrides };
  return { run: () => definition.handle(payload, context), requests, usage };
}

test("targeted refresh uses distinct fixture receipts under the publication slot and honors its cap", async () => {
  const { run, requests, usage } = fixtureRefresh({ candidates: async (slot, limit) => {
    assert.equal(slot, publicationSlot);
    assert.equal(limit, slipOddsRefreshFixtureLimit);
    return Array.from({ length: limit + 1 }, (_, index) => ({ fixtureId: index + 1, date }));
  } });
  assert.deepEqual(await run(), { status: "succeeded" });
  assert.equal(requests.length, slipOddsRefreshFixtureLimit);
  assert.ok(requests.every((request) => request.slot === publicationSlot && request.date === date && request.kind === "prices"));
  assert.equal(new Set(requests.map(({ id }) => id)).size, slipOddsRefreshFixtureLimit);
  assert.equal(usage.reduce((total, record) => total + record.requests, 0), slipOddsRefreshFixtureLimit);
});

test("a verified empty cohort succeeds without provider or quota work", async () => {
  const { run, requests } = fixtureRefresh({ candidates: async () => [], usage: async () => assert.fail("No provider candidate") });
  assert.deepEqual(await run(), { status: "succeeded" });
  assert.deepEqual(requests, []);
});

test("an incomplete refresh cannot release its publisher", async () => {
  const noSpare = fixtureRefresh({ usage: async () => ({ remaining: 3, used: 100, oddsUsed: 2 }) });
  assert.deepEqual(await noSpare.run(), { status: "failed", reason: "rate-limited", retryable: false });
  assert.deepEqual(noSpare.requests, []);
  const late = fixtureRefresh({}, { remainingMs: () => 1_000 });
  assert.deepEqual(await late.run(), { status: "failed", reason: "timeout", retryable: false });
  assert.deepEqual(late.requests, []);
  const partial = fixtureRefresh({
    service: { importFixture: async () => ({ status: "partial", requestsDispatched: 1, error: null }) },
  });
  assert.deepEqual(await partial.run(), { status: "failed", reason: "handler-failed", retryable: false });
  assert.equal(partial.usage[0].requests, 1);
});
