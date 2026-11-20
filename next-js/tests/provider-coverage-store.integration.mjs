import assert from "node:assert/strict";
import test from "node:test";
import { createHistoricalReferenceCheckpoint } from "../src/server/football/history-reference-checkpoint.ts";
import { createFootballHistorySource } from "../src/server/football/history-source.ts";
import { apiFootballRequestKey } from "../src/server/football/api-football-adapter.ts";
import { API_FOOTBALL_CONTRACT_VERSION } from "../src/server/football/api-football-contract.ts";
import { createMysqlProviderCoverageStore } from "../src/server/football/provider-coverage-store.ts";
import { withPredictionPipeline } from "./prediction-pipeline.mjs";

test("coverage checkpoints commit normalized work atomically and replay privately after a transaction rolls back",
  { timeout: 360_000 }, async (t) => {
    await withPredictionPipeline(t, async ({ a, b, instance, setTime }) => {
      await instance.executeAdmin(`
        GRANT SELECT, INSERT ON goal_hint_test.FootballHistorySourcePage TO 'cutoff_app'@'127.0.0.1';
        GRANT SELECT, INSERT, UPDATE (revision, status, reason, attempts, updatedAt, lastAttemptAt, lastResponseId,
          lastCompleteAt, nextRetryAt, remaining) ON goal_hint_test.FootballProviderCoverage TO 'cutoff_app'@'127.0.0.1';
      `);
      const first = createMysqlProviderCoverageStore(a), other = createMysqlProviderCoverageStore(b);
      const at = Date.now() - 60_000, leaseMs = 1000, accountKey = "a".repeat(64);
      const target = { resource: "fixture", endpoint: "fixtures", scope: { context: "current", accountKey, fixtureId: 123 },
        parameters: { id: "123" }, page: 1, section: "fixture" };
      const body = Buffer.from('{"get":"fixtures","parameters":{"id":"123"},"errors":[],"results":1,"paging":{"current":1,"total":1},"response":[{"fixture":{"id":123}}]}');
      const probeId = "e".repeat(64), probe = () => a.query((tx) => tx.apiQuotaAccount.findUnique({ where: { id: probeId } }));
      setTime(at);
      assert.equal(await first.stage(target, { status: "not_requested" }), true);
      assert.equal(await first.stage(target, { status: "queued", remaining: 1 }), true);
      assert.equal((await first.read(target)).attempts, 0);
      const ticket = await first.begin(target, { leaseMs });
      assert.ok(ticket);
      assert.equal(await other.begin(target, { leaseMs }), null);
      const receipt = await first.retain(ticket, { observedAt: at, body });
      assert.equal(await first.retain(ticket, { observedAt: at, body }), receipt);
      assert.equal(await a.query((tx) => tx.footballHistorySourcePage.count({ where: { id: receipt } })), 1);
      await assert.rejects(first.complete(ticket, { status: "complete", responseId: receipt }, async (tx) => {
        await tx.apiQuotaAccount.create({ data: { id: probeId } });
        throw new Error("Synthetic normalization interruption.");
      }), { name: "DatabaseOperationError" });
      assert.equal(await probe(), null);
      assert.equal((await first.read(target)).status, "fetching");

      setTime(at + leaseMs + 1);
      const replayed = await other.retained(target, { notBefore: at, now: at + leaseMs + 1, maxResponseBytes: 1024 });
      assert.deepEqual(replayed, { responseId: receipt, body, retrievedAt: at });
      const recovery = await other.begin(target, { leaseMs });
      assert.ok(recovery && recovery.revision > ticket.revision);
      assert.equal(await first.complete(ticket, { status: "complete", responseId: receipt }, async () => assert.fail("stale callback")), null);
      const recover = await other.complete(recovery, { status: "complete", responseId: receipt },
        async (tx) => tx.apiQuotaAccount.create({ data: { id: probeId } }));
      assert.equal(recover.progress.status, "complete");
      assert.equal(recover.progress.lastCompleteAt, at);
      assert.equal(recover.progress.attempts, 2);
      assert.equal((await probe()).id, probeId);
      const duplicate = await first.begin(target, { leaseMs });
      assert.equal((await first.complete(duplicate, { status: "complete", responseId: receipt },
        async () => assert.fail("duplicate callback"))).value, null);

      const current = await first.begin(target, { leaseMs });
      const failed = await first.fail(current, { status: "blocked_by_access", reason: "operation-not-authorized", remaining: null });
      assert.equal(failed.progress.lastResponseId, receipt);
      assert.equal(failed.progress.lastCompleteAt, at);
      assert.equal(failed.progress.remaining, null);
      assert.equal(await other.begin(target, { leaseMs }), null);
      const resumed = await other.begin(target, { leaseMs, resumeBlocked: true });
      assert.ok(resumed);
      setTime(at + 2 * leaseMs);
      const newReceipt = await other.retain(resumed, { observedAt: at + leaseMs + 1, body });
      const lateProbeId = "f".repeat(64);
      const late = await other.complete(resumed, { status: "complete", responseId: newReceipt }, async (tx) => {
        await tx.apiQuotaAccount.create({ data: { id: lateProbeId } });
        await tx.$executeRaw`SET timestamp = ${(at + 3 * leaseMs) / 1000}`;
      });
      assert.equal(late, null);
      assert.equal(await a.query((tx) => tx.apiQuotaAccount.findUnique({ where: { id: lateProbeId } })), null);
      assert.equal((await first.read(target)).lastResponseId, receipt);

      const history = createFootballHistorySource(a), observedAt = at + 5000;
      setTime(observedAt);
      const reference = { endpoint: "teamStatistics", parameters: { league: "39", season: "2025", team: "10", date: "2025-11-08" } };
      const checkpoint = createHistoricalReferenceCheckpoint({ store: first, accountKey, save: history.savePage, now: () => observedAt });
      const projection = await checkpoint.begin(reference);
      assert.equal(await history.hasPage(reference), false);
      assert.ok(projection);
      const rows = [{ league: { id: 39, season: 2025 }, team: { id: 10 }, fixtures: {}, goals: {} }];
      const requestKey = apiFootballRequestKey(accountKey, reference.endpoint, reference.parameters);
      await first.archive.save({ requestKey, rowCount: 1, body: Buffer.from(JSON.stringify({ get: "teams/statistics",
        parameters: reference.parameters, errors: [], results: 4, paging: { current: 1, total: 1 }, response: rows[0] })),
      provenance: { provider: "api-football", endpoint: reference.endpoint, contractVersion: API_FOOTBALL_CONTRACT_VERSION,
        requestParameters: reference.parameters, retrievedAt: observedAt, fromCache: false, currentPage: 1, totalPages: 1 } });
      assert.equal(await projection.save({ ...reference, rows, retrievedAt: observedAt }, 0), true);
      assert.equal(await history.hasPage(reference), true);
      const projectedCheckpoint = await first.read({ ...reference, resource: "historical-reference",
        scope: { context: "historical", accountKey }, page: 1, section: "reference" });
      assert.equal(projectedCheckpoint.status, "complete");
      const archived = await a.query((tx) => tx.footballHistorySourcePage.findUnique({ where: { id: projectedCheckpoint.lastResponseId } }));
      assert.equal(archived.endpoint, "raw:teamStatistics");
    }, { migrationTimeoutMs: 240_000 });
  });
