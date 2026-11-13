import assert from "node:assert/strict";
import test from "node:test";
import { createHistoryImportJob, historyImportEnvelopes, latestHistoryImportSlot } from "../src/server/football/history-import-jobs.ts";

test("archive batches use bounded, stable envelopes and the lowest enrichment priority", () => {
  const slot = latestHistoryImportSlot(Date.parse("2026-11-13T10:38:00Z"));
  const batch = historyImportEnvelopes(slot);
  assert.deepEqual(batch, historyImportEnvelopes(slot));
  assert.equal(new Set(batch.map(({ idempotencyKey }) => idempotencyKey)).size, batch.length);
  assert.ok(batch.every(({ priority, notBefore, expiresAt, timeoutMs }) => priority === 0 && notBefore === slot && expiresAt - slot > timeoutMs));
});

test("archive progress uses the owned job lease and keeps quota, retry and provider coverage distinct", async () => {
  const rows = new Map();
  const tx = { footballHistoryImportStatus: { upsert: async ({ where: { phase }, update, create }) => {
    rows.set(phase, rows.has(phase) ? { ...rows.get(phase), ...update } : create);
  } } };
  const database = { transaction: async (operation) => operation(tx) };
  const slot = latestHistoryImportSlot(Date.parse("2026-11-13T10:38:00Z"));
  const signal = new AbortController().signal, lease = { jobId: "fixture-lease" };
  let owned = true;
  const queue = { assertOwned: async (transaction, provided) => {
    assert.equal(transaction, tx);
    assert.equal(provided, lease);
    if (!owned) throw new Error("lost lease");
    return slot;
  } };
  const context = { checkpoint: async () => {}, lease, signal };
  const coverage = { imported: 2, remaining: 1, unavailable: 3 };
  const steps = {
    fixtures: async () => ({ complete: false, stopped: "quota-denied", coverage }),
    details: async () => ({ complete: true, stopped: null, coverage: { ...coverage, remaining: 0 } }),
    replay: async () => { throw new Error("synthetic storage failure"); },
  };
  const job = createHistoryImportJob({ database, queue, steps, enabled: true });
  const run = (phase) => job.handle({ phase, slot }, context);
  assert.deepEqual(await run("fixtures"), { status: "succeeded" });
  assert.deepEqual(rows.get("fixtures"), { phase: "fixtures", status: "waiting-quota", coverage, updatedAt: new Date(slot) });
  assert.deepEqual(await run("details"), { status: "succeeded" });
  assert.equal(rows.get("details").status, "caught-up");
  assert.equal(rows.get("details").coverage.unavailable, 3);
  assert.deepEqual(await run("replay"), { status: "failed", reason: "handler-failed", retryable: true });
  assert.equal(rows.get("replay").status, "retrying");
  assert.deepEqual(await run("odds-mapping"), { status: "succeeded" });
  assert.equal(rows.get("odds-mapping").status, "unavailable");

  owned = false;
  await assert.rejects(run("fixtures"), /lost lease/u);
  assert.equal(rows.get("fixtures").status, "waiting-quota");
});
