import "server-only";

import { MARKET_RULE_VERSION, marketSelections, type MarketFamily } from "../../domain/markets.ts";
import { settleMarketSelection, type CycleEligibility } from "../../domain/market-settlement.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { JobLease, JobQueue } from "../jobs/job-contract.ts";
import { defineJob } from "../jobs/job-registry.ts";
import { historyFail } from "../predictions/history-contract.ts";
import { createMysqlPredictionHistoryStore } from "../predictions/history-mysql-store.ts";
import { historyId } from "../predictions/history-input.ts";
import { assertHistorySeal, historyJson, historyTime, storedCycle, storedRevision } from "../predictions/history-read.ts";
import { resultStatus, storedFixtureResult } from "../results/result-read.ts";
import { SETTLEMENT_JOB_TYPE, settlementFamily, settlementPayload, settlementRevisionSchema, type SettlementRevision } from "./settlement-contract.ts";

type Tx = Prisma.TransactionClient;
const families = Object.keys(marketSelections) as MarketFamily[];
const sourceKinds = ["fixture-result", "cycle-closed", "cycle-voided", "schedule-lifecycle", "lifecycle-conflict", "eligibility-closed", "revision-published"];
const serverNow = async (tx: Tx) => historyTime((await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at);

async function revision(tx: Tx, id: string): Promise<SettlementRevision> {
  const row = await tx.marketSettlementRevision.findUniqueOrThrow({ where: { id } });
  const [seal] = await tx.$queryRaw<{ validIntegrity: bigint }[]>`SELECT integrity = SHA2(CAST(body AS CHAR), 256) AS validIntegrity FROM MarketSettlementRevision WHERE id = ${id}`;
  assertHistorySeal(seal?.validIntegrity);
  const parsed = settlementRevisionSchema.safeParse(historyJson(row.body));
  if (!parsed.success) return historyFail("invalid-state");
  const v = parsed.data;
  if (v.id !== id || v.fixtureId !== row.fixtureId || v.cycleId !== row.cycleId || v.family !== row.family || v.batchId !== row.batchId ||
    v.previousId !== row.previousId || v.resultId !== row.resultId || v.lockedSetId !== row.lockedSetId || v.inputHash !== row.inputHash || v.at !== row.at.getTime()) return historyFail("invalid-state");
  const { fixtureId, cycleId, family, ruleVersion, lockedSetId, selection, source, selectedProbability,
    resultId, resultUsable, status, reason, cycleState, voidReason } = v;
  if (evidenceFingerprint({ fixtureId, cycleId, family, ruleVersion, lockedSetId, selection, source, selectedProbability,
    resultId, resultUsable, status, reason, cycleState, voidReason }) !== v.inputHash) return historyFail("invalid-state");
  return freezeEvidence(v);
}

/** Projects only immutable locks. All provider I/O belongs to result synchronization. */
export function createMarketSettlementService(options: Readonly<{ database: DatabaseRuntime; queue: JobQueue }>) {
  const { database, queue } = options, history = createMysqlPredictionHistoryStore(database);
  async function projection(tx: Tx, fixtureId: string) {
    const fixture = await tx.footballFixture.findUniqueOrThrow({ where: { id: fixtureId } });
    const cursor = await tx.fixtureLifecycleState.findUnique({ where: { fixtureId } });
    const resultState = await tx.fixtureResultState.findUnique({ where: { fixtureId } });
    const result = resultState?.resultId ? await storedFixtureResult(tx, fixtureId, resultState.resultId) : null;
    const status = resultStatus.parse(fixture.status);
    const resultUsable = result !== null && cursor?.issue == null && result.status === status &&
      result.regulation.home === fixture.regulationHome && result.regulation.away === fixture.regulationAway &&
      (result.regulationVerifiedAt === null ? fixture.regulationVerifiedAt === null
        : fixture.regulationVerifiedAt !== null && result.regulationVerifiedAt <= fixture.regulationVerifiedAt.getTime()) &&
      result.regulation.evidenceRef === fixture.regulationEvidenceRef;
    const rows = await tx.predictionCycle.findMany({ where: { fixtureId }, orderBy: { ordinal: "asc" }, select: { id: true } });
    const cycles = [];
    for (const row of rows) {
      const cycle = (await storedCycle(tx, row.id))!;
      const lock = cycle.lockedSetId ? await storedRevision(tx, cycle.lockedSetId) : null;
      if (lock && (lock.cycleId !== cycle.id || lock.fixtureId !== fixtureId)) return historyFail("invalid-state");
      const eligibility: CycleEligibility = cycle.state !== "void" ? { eligible: true } : { eligible: false,
        reason: cycle.voidReason === "formal-postponement" ? "postponed-cycle"
          : cycle.voidReason === "locked-cutoff-invalidated" ? "cutoff-invalidated" : "ineligible-cycle" };
      const markets = [];
      for (const family of families) {
        const item = lock?.candidate.markets[family];
        const market = item?.available ? item.market : null;
        const outcome = settleMarketSelection(family, market?.selection ?? null, {
          status: cursor?.issue && cycle.state !== "void" ? "unknown" : status, cycleEligibility: eligibility,
          regulationScore: resultUsable && result?.regulation.verified ? { verified: true,
            period: "regulation-including-stoppage-time", home: result.regulation.home!, away: result.regulation.away! } : null,
        });
        const pointer = await tx.marketSettlement.findUnique({ where: { cycleId_family: { cycleId: cycle.id, family } } });
        const previous = pointer ? await revision(tx, pointer.revisionId) : null;
        const historicalVoid = previous?.cycleState === "void" && cycle.state === "void";
        const base = { fixtureId, cycleId: cycle.id, family, ruleVersion: MARKET_RULE_VERSION, lockedSetId: cycle.lockedSetId,
          selection: market?.selection ?? null, source: market?.source ?? null, selectedProbability: market?.selectedProbability ?? null,
          resultId: historicalVoid ? previous.resultId : market ? result?.id ?? null : null,
          resultUsable: historicalVoid ? previous.resultUsable : market ? resultUsable : false,
          status: outcome.status, reason: !lock ? cycle.state === "open" ? "awaiting-locked-selection" : "no-locked-selection"
            : item && !item.available ? item.reason : outcome.reason,
          cycleState: cycle.state, voidReason: cycle.voidReason } as const;
        if (previous && (previous.fixtureId !== fixtureId || previous.cycleId !== cycle.id || previous.family !== family ||
          previous.lockedSetId !== null && previous.lockedSetId !== cycle.lockedSetId)) return historyFail("invalid-state");
        markets.push({ base, inputHash: evidenceFingerprint(base), previous });
      }
      cycles.push({ cycle, markets });
    }
    return { fixture, result, cycles };
  }
  const service = {
    async settleFixture(fixtureId: string, lease?: JobLease) {
      historyId.parse(fixtureId);
      return history.withFixtureTransaction(fixtureId, async (_writer, tx) => {
        if (lease) {
          if (lease.job.envelope.type !== SETTLEMENT_JOB_TYPE || lease.job.envelope.handlerVersion !== 1 ||
            settlementPayload.parse(lease.job.envelope.payload).fixtureId !== fixtureId) return historyFail("invalid-request");
          await queue.assertOwned(tx, lease);
        }
        const snapshot = await projection(tx, fixtureId), at = await serverNow(tx);
        const changes = snapshot.cycles.flatMap((entry) => entry.markets).filter((entry) => entry.previous?.inputHash !== entry.inputHash);
        if (changes.length) {
          const version = (await tx.footballFixture.update({ where: { id: fixtureId }, data: { dataVersion: { increment: 1 } }, select: { dataVersion: true } })).dataVersion;
          const batchId = evidenceFingerprint({ fixtureId, version, changes: changes.map((entry) => entry.inputHash) });
          await tx.settlementBatch.create({ data: { id: batchId, fixtureId, fixtureVersion: version, at: new Date(at) } });
          for (const { base, inputHash, previous } of changes) {
            const correction = previous?.lockedSetId != null && (previous.status === "correct" || previous.status === "incorrect") &&
              (previous.resultId !== base.resultId || previous.status !== base.status || previous.reason !== base.reason);
            const id = evidenceFingerprint({ batchId, cycleId: base.cycleId, family: base.family });
            const value: SettlementRevision = { ...base, id, batchId, inputHash, previousId: previous?.id ?? null, at,
              kind: !previous ? "initial" : correction ? "correction" : "transition",
              correctedAt: correction ? at : previous?.correctedAt ?? null };
            const body = evidenceSerialize(value);
            await tx.$executeRaw`INSERT INTO MarketSettlementRevision (id, fixtureId, cycleId, family, batchId, previousId, resultId, lockedSetId, inputHash, at, integrity, body)
              VALUES (${id}, ${fixtureId}, ${base.cycleId}, ${base.family}, ${batchId}, ${value.previousId}, ${value.resultId}, ${value.lockedSetId}, ${inputHash}, ${new Date(at)},
                SHA2(CAST(CAST(${body} AS JSON) AS CHAR), 256), CAST(${body} AS JSON))`;
            await tx.marketSettlement.upsert({ where: { cycleId_family: { cycleId: base.cycleId, family: base.family } },
              create: { fixtureId, cycleId: base.cycleId, family: base.family, revisionId: id }, update: { revisionId: id } });
          }
          await tx.predictionChangeEvent.create({ data: { fixtureId, version, settlementId: batchId, kind: "market-settlement", at: new Date(at) } });
        }
        // A late/duplicate event is acknowledged against the latest locked state,
        // never by replaying an obsolete score or reopening an old cycle.
        const events = await tx.predictionChangeEvent.findMany({ where: { fixtureId, kind: { in: sourceKinds }, settlementReceipt: null }, select: { version: true } });
        if (events.length) await tx.settlementEventReceipt.createMany({ data: events.map(({ version }) => ({ fixtureId, version, at: new Date(at) })) });
        if (lease) await queue.assertOwned(tx, lease);
        return freezeEvidence({ fixtureId, changed: changes.length, consumed: events.length });
      });
    },
    async pending(limit = 100): Promise<readonly string[]> {
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return historyFail("invalid-request");
      // No global timestamp cursor: receipts remain discoverable after crashes,
      // and cycles created without an outbox event are covered by the second arm.
      return database.query(async (tx) => (await tx.$queryRaw<{ fixtureId: string }[]>`
        SELECT f.id AS fixtureId FROM FootballFixture f WHERE
          EXISTS (SELECT 1 FROM PredictionChangeEvent e LEFT JOIN SettlementEventReceipt r ON r.fixtureId=e.fixtureId AND r.version=e.version
            WHERE e.fixtureId=f.id AND e.kind IN ('fixture-result','cycle-closed','cycle-voided','schedule-lifecycle','lifecycle-conflict','eligibility-closed','revision-published') AND r.fixtureId IS NULL)
          OR EXISTS (SELECT 1 FROM PredictionCycle c WHERE c.fixtureId=f.id AND
            (SELECT COUNT(*) FROM MarketSettlement s WHERE s.cycleId=c.id) < 4)
        ORDER BY f.id LIMIT ${limit}`).map((row) => row.fixtureId));
    },
    async reconcile(limit = 100) {
      const targets = await service.pending(limit), receipts = [];
      for (const fixtureId of targets) receipts.push(await service.settleFixture(fixtureId));
      return freezeEvidence(receipts);
    },
    async forFixture(fixtureId: string) {
      historyId.parse(fixtureId);
      return database.transaction(async (tx) => {
        const snapshot = await projection(tx, fixtureId);
        return freezeEvidence({ fixtureId, fixtureVersion: snapshot.fixture.dataVersion, applicableCycleId: snapshot.fixture.activeCycleId,
          cycles: snapshot.cycles.map(({ cycle, markets }) => ({ cycle, applicable: cycle.id === snapshot.fixture.activeCycleId,
            markets: markets.map(({ base, inputHash, previous }) => {
              const isCurrent = previous?.inputHash === inputHash;
              return { family: base.family, settlement: previous, isCurrent,
                eligibleForCounting: isCurrent && cycle.id === snapshot.fixture.activeCycleId && cycle.state === "closed" &&
                  previous?.selection !== null && (previous?.status === "correct" || previous?.status === "incorrect") };
            }) })) });
      }, { isolationLevel: "RepeatableRead" });
    },
    async audit(cycleId: string, family: MarketFamily) {
      historyId.parse(cycleId); settlementFamily.parse(family);
      return database.transaction(async (tx) => {
        const rows = await tx.marketSettlementRevision.findMany({ where: { cycleId, family } });
        const values = await Promise.all(rows.map(async (row) => {
          const value = await revision(tx, row.id);
          return { ...value, result: value.resultId ? await storedFixtureResult(tx, value.fixtureId, value.resultId) : null };
        }));
        // Chain order is stable even when multiple corrections share a millisecond.
        const byPrevious = new Map(values.map((value) => [value.previousId, value])), ordered = [];
        let value = byPrevious.get(null);
        while (value) { ordered.push(value); if (ordered.length > values.length) return historyFail("invalid-state"); value = byPrevious.get(value.id); }
        if (ordered.length !== values.length) return historyFail("invalid-state");
        return freezeEvidence(ordered);
      }, { isolationLevel: "RepeatableRead" });
    },
  };
  return Object.freeze(service);
}

/** Register with the existing private worker. Watchdog/scheduler calls reconcile
 * to recover missed enqueue/dispatch, including exhausted or interrupted jobs. */
export function createMarketSettlementJob(service: ReturnType<typeof createMarketSettlementService>) {
  return defineJob({ type: SETTLEMENT_JOB_TYPE, handlerVersion: 1, payload: settlementPayload,
    async handle(payload, context) {
      if (context.signal.aborted) return { status: "failed", reason: "worker-stopping", retryable: true };
      try { await service.settleFixture(payload.fixtureId, context.lease); return { status: "succeeded" }; }
      catch { return { status: "failed", reason: "handler-failed", retryable: true }; }
    },
  });
}
