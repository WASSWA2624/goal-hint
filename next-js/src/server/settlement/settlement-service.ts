import "server-only";

import type { MarketFamily } from "../../domain/markets.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { JobLease, JobQueue } from "../jobs/job-contract.ts";
import { defineJob } from "../jobs/job-registry.ts";
import { historyFail } from "../predictions/history-contract.ts";
import { createMysqlPredictionHistoryStore } from "../predictions/history-mysql-store.ts";
import { historyId } from "../predictions/history-input.ts";
import { historyTime } from "../predictions/history-read.ts";
import { planGoalMarketSettlements, persistGoalMarketSettlements, readGoalMarketSettlement } from "../predictions/goal-market-store.ts";
import { storedFixtureResult } from "../results/result-read.ts";
import { SETTLEMENT_JOB_TYPE, settlementFamily, settlementPayload, type SettlementRevision } from "./settlement-contract.ts";
import { storedSettlementProjection, storedSettlementRevision } from "./settlement-read.ts";
import { planImpliedMarketSettlements, persistImpliedMarketSettlements, readImpliedMarketSettlement } from "./implied-market-settlement.ts";

type Tx = Prisma.TransactionClient;
/** Change-event kinds that settlement must receipt. The history compaction census reads the same list. */
export const settlementSourceKinds = ["fixture-result", "cycle-closed", "cycle-voided", "schedule-lifecycle", "lifecycle-conflict", "eligibility-closed", "revision-published"];
const serverNow = async (tx: Tx) => historyTime((await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at);

/** Projects only immutable locks. All provider I/O belongs to result synchronization. */
export function createMarketSettlementService(options: Readonly<{ database: DatabaseRuntime; queue: JobQueue; extendedMarketsEnabled?: boolean }>) {
  const { database, queue } = options, history = createMysqlPredictionHistoryStore(database);
  // Explicit capability, enabled only after reviewed migrations/grants. Legacy deployments never query new tables.
  const extendedMarketsEnabled = options.extendedMarketsEnabled ?? false;
  if (typeof extendedMarketsEnabled !== "boolean") return historyFail("invalid-request");
  const service = {
    async settleFixture(fixtureId: string, lease?: JobLease) {
      historyId.parse(fixtureId);
      return history.withFixtureTransaction(fixtureId, async (_writer, tx) => {
        if (lease) {
          if (lease.job.envelope.type !== SETTLEMENT_JOB_TYPE || lease.job.envelope.handlerVersion !== 1 ||
            settlementPayload.parse(lease.job.envelope.payload).fixtureId !== fixtureId) return historyFail("invalid-request");
          await queue.assertOwned(tx, lease);
        }
        const snapshot = await storedSettlementProjection(tx, fixtureId), at = await serverNow(tx);
        const changes = snapshot.cycles.flatMap((entry) => entry.markets).filter((entry) => entry.previous?.inputHash !== entry.inputHash);
        const goals = extendedMarketsEnabled ? await planGoalMarketSettlements(tx, fixtureId) : [];
        const implied = extendedMarketsEnabled ? await planImpliedMarketSettlements(tx, fixtureId) : [];
        const goalChanges = goals.filter((entry) => entry.previous?.inputHash !== entry.inputHash);
        const impliedChanges = implied.filter((entry) => entry.previous?.inputHash !== entry.inputHash);
        const extendedChanges = [...goalChanges, ...impliedChanges];
        if (changes.length || extendedChanges.length) {
          const version = (await tx.footballFixture.update({ where: { id: fixtureId }, data: { dataVersion: { increment: 1 } }, select: { dataVersion: true } })).dataVersion;
          const batchId = evidenceFingerprint({ fixtureId, version, changes: changes.map((entry) => entry.inputHash),
            ...(extendedChanges.length ? { extended: extendedChanges.map((entry) => entry.inputHash) } : {}) });
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
                SHA2(CAST(JSON_EXTRACT(${body}, '$') AS CHAR), 256), JSON_EXTRACT(${body}, '$'))`;
            await tx.marketSettlement.upsert({ where: { cycleId_family: { cycleId: base.cycleId, family: base.family } },
              create: { fixtureId, cycleId: base.cycleId, family: base.family, revisionId: id }, update: { revisionId: id } });
          }
          if (goalChanges.length) await persistGoalMarketSettlements(tx, goalChanges, batchId, at);
          if (impliedChanges.length) await persistImpliedMarketSettlements(tx, impliedChanges, batchId, at);
          await tx.predictionChangeEvent.create({ data: { fixtureId, version, settlementId: batchId, kind: "market-settlement", at: new Date(at) } });
        }
        // A late/duplicate event is acknowledged against the latest locked state,
        // never by replaying an obsolete score or reopening an old cycle.
        const events = await tx.predictionChangeEvent.findMany({ where: { fixtureId, kind: { in: settlementSourceKinds }, settlementReceipt: null }, select: { version: true } });
        if (events.length) await tx.settlementEventReceipt.createMany({ data: events.map(({ version }) => ({ fixtureId, version, at: new Date(at) })) });
        if (lease) await queue.assertOwned(tx, lease);
        return freezeEvidence({ fixtureId, changed: changes.length + extendedChanges.length, consumed: events.length });
      });
    },
    async pending(limit = 100): Promise<readonly string[]> {
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return historyFail("invalid-request");
      // No global timestamp cursor: receipts remain discoverable after crashes,
      // and cycles created without an outbox event are covered by the second arm.
      return database.query(async (tx) => {
        const legacy = (await tx.$queryRaw<{ fixtureId: string }[]>`
        SELECT f.id AS fixtureId FROM FootballFixture f WHERE
          EXISTS (SELECT 1 FROM PredictionChangeEvent e LEFT JOIN SettlementEventReceipt r ON r.fixtureId=e.fixtureId AND r.version=e.version
            WHERE e.fixtureId=f.id AND e.kind IN ('fixture-result','cycle-closed','cycle-voided','schedule-lifecycle','lifecycle-conflict','eligibility-closed','revision-published') AND r.fixtureId IS NULL)
          OR EXISTS (SELECT 1 FROM PredictionCycle c WHERE c.fixtureId=f.id AND
            (SELECT COUNT(*) FROM MarketSettlement s WHERE s.cycleId=c.id) < 4)
        ORDER BY f.id LIMIT ${limit}`).map((row) => row.fixtureId);
        if (!extendedMarketsEnabled) return legacy;
        const extended = (await tx.$queryRaw<{ fixtureId: string }[]>`
          SELECT DISTINCT e.fixtureId FROM GoalMarketExtension e JOIN PredictionCycle c ON c.lockedSetId=e.revisionId
          WHERE c.state IN ('closed','void') AND JSON_LENGTH(JSON_EXTRACT(e.body, '$.markets')) >
            (SELECT COUNT(*) FROM ExtendedMarketSettlement s WHERE s.cycleId=c.id AND s.marketKey LIKE 'goal:%')
          ORDER BY e.fixtureId LIMIT ${limit}`).map((row) => row.fixtureId);
        const implied = (await tx.$queryRaw<{ fixtureId: string }[]>`
          SELECT DISTINCT e.fixtureId FROM ImpliedMarketExtension e JOIN PredictionCycle c ON c.lockedSetId=e.revisionId
          WHERE c.state IN ('closed','void') AND JSON_LENGTH(JSON_EXTRACT(e.body, '$.markets')) >
            (SELECT COUNT(*) FROM ExtendedMarketSettlement s WHERE s.cycleId=c.id AND s.marketKey LIKE 'implied:%')
          ORDER BY e.fixtureId LIMIT ${limit}`).map((row) => row.fixtureId);
        // Result-time statistics can be corrected without changing FT scores. Latest result-bound sequence remains discoverable without a watermark.
        const evidence = (await tx.$queryRaw<{ fixtureId: string }[]>`
          SELECT DISTINCT c.fixtureId FROM PredictionCycle c
          JOIN ImpliedMarketExtension x ON x.revisionId=c.lockedSetId
          JOIN FixtureResultState rs ON rs.fixtureId=c.fixtureId
          JOIN ImpliedMarketResultEvidence e ON e.fixtureId=c.fixtureId AND e.resultId=rs.resultId
          JOIN ExtendedMarketSettlement p ON p.cycleId=c.id AND p.marketKey LIKE 'implied:%'
          JOIN ExtendedMarketSettlementRevision r ON r.id=p.revisionId AND r.source='market-implied'
          WHERE c.state='closed' AND e.sequence=(SELECT MAX(latest.sequence) FROM ImpliedMarketResultEvidence latest
            WHERE latest.fixtureId=e.fixtureId AND latest.resultId=e.resultId)
            AND NOT (JSON_UNQUOTE(JSON_EXTRACT(r.body, '$.evidenceId')) <=> e.id)
          ORDER BY c.fixtureId LIMIT ${limit}`).map((row) => row.fixtureId);
        return [...new Set([...legacy, ...extended, ...implied, ...evidence])].sort().slice(0, limit);
      });
    },
    async reconcile(limit = 100) {
      const targets = await service.pending(limit), receipts = [];
      for (const fixtureId of targets) receipts.push(await service.settleFixture(fixtureId));
      return freezeEvidence(receipts);
    },
    async forFixture(fixtureId: string) {
      historyId.parse(fixtureId);
      return database.transaction(async (tx) => {
        const snapshot = await storedSettlementProjection(tx, fixtureId);
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
          const value = await storedSettlementRevision(tx, row.id);
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
    /** Separate keyed projection: extended markets never enter four-family headline metrics. */
    async extendedForFixture(fixtureId: string) {
      historyId.parse(fixtureId);
      if (!extendedMarketsEnabled) return historyFail("invalid-request");
      return database.transaction(async (tx) => {
        const fixture = await tx.footballFixture.findUniqueOrThrow({ where: { id: fixtureId }, select: { activeCycleId: true, dataVersion: true } });
        const plans = [...await planGoalMarketSettlements(tx, fixtureId), ...await planImpliedMarketSettlements(tx, fixtureId)];
        return freezeEvidence({ fixtureId, fixtureVersion: fixture.dataVersion, applicableCycleId: fixture.activeCycleId,
          markets: plans.map(({ base, inputHash, previous }) => ({ marketKey: base.marketKey, cycleId: base.cycleId, source: base.source,
            settlement: previous, isCurrent: previous?.inputHash === inputHash,
            applicable: base.cycleId === fixture.activeCycleId,
            eligibleForCounting: previous?.inputHash === inputHash && base.cycleId === fixture.activeCycleId && base.cycleState === "closed" &&
              base.selection !== null && ["correct", "incorrect", "half-win", "half-loss", "push"].includes(base.status) })) });
      }, { isolationLevel: "RepeatableRead" });
    },
    async extendedAudit(cycleId: string, marketKey: string) {
      historyId.parse(cycleId);
      if (!extendedMarketsEnabled || !/^(?:goal|implied):[a-z0-9:._-]+$/u.test(marketKey) || marketKey.length > 128) return historyFail("invalid-request");
      return database.transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ExtendedMarketSettlementRevision
          WHERE cycleId = ${cycleId} AND marketKey = ${marketKey}`;
        const values = await Promise.all(rows.map(({ id }) => marketKey.startsWith("goal:")
          ? readGoalMarketSettlement(tx, id) : readImpliedMarketSettlement(tx, id)));
        const ordered = [], byPrevious = new Map(values.map((value) => [value.previousId, value]));
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
