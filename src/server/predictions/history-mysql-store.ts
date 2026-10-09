import "server-only";

import { randomUUID } from "node:crypto";
import { getPublicationDeadline, parseReportingDate, type Clock } from "../../domain/calendar.ts";
import { MARKET_RULE_VERSION, marketSelections, type MarketFamily } from "../../domain/markets.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import { createFootballCatalogStore, type FootballCatalogStore } from "../football/catalog-mysql-store.ts";
import { PredictionHistoryError, historyFail, type AppendRevisionInput, type ChangeCycleInput, type CreateCycleInput,
  type HistoryActor, type StoredCycle, type StoredHistoryAudit, type StoredRevision, type StoredRun } from "./history-contract.ts";
import { historyId, historyInstant, historyVersion, nextHistoryVersion, parseAppendRevision, parseChangeCycle,
  parseCreateCycle, parseHistory, parseHistoryAuditSnapshot } from "./history-input.ts";
import { assertHistorySeal, historyDate, historyJson, historyTime, runFromRow, storedCycle, storedCycleDisplay, storedRevision,
  type HistoryRow, type HistoryTransaction } from "./history-read.ts";

export type PredictionHistoryWriter = Readonly<{
  createCycle(input: CreateCycleInput): Promise<StoredCycle>;
  appendRevision(input: AppendRevisionInput): Promise<StoredRevision>;
  changeCycle(input: ChangeCycleInput): Promise<StoredCycle>;
}>;

/** Storage primitives only. Callers own eligibility/manifest/freshness/lease
 * decisions and must do all provider I/O before entering this transaction. */
export function createMysqlPredictionHistoryStore(database: DatabaseRuntime, options: Readonly<{
  catalog?: FootballCatalogStore; clock?: Clock;
}> = {}) {
  const catalog = options.catalog ?? createFootballCatalogStore(database);

  async function read<Result>(operation: (transaction: HistoryTransaction) => Promise<Result>): Promise<Result> {
    let domainError: PredictionHistoryError | undefined;
    try {
      return await database.transaction(async (transaction) => {
        try { return await operation(transaction); }
        catch (error) { if (error instanceof PredictionHistoryError) domainError = error; throw error; }
      }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
    } catch { if (domainError) throw domainError; return historyFail("unavailable"); }
  }
  async function createRun(date: string, createdAt: number): Promise<StoredRun> {
    try { parseReportingDate(date); } catch { return historyFail("invalid-request"); }
    const at = parseHistory(historyInstant, createdAt), eatDate = new Date(`${date}T00:00:00.000Z`);
    parseHistory(historyInstant, eatDate.getTime());
    try {
      return await database.transaction(async (transaction) => {
        const previous = await transaction.dailyRun.findUnique({ where: { eatDate } });
        return runFromRow(previous ?? await transaction.dailyRun.create({ data: { id: randomUUID(), sequence: BigInt(date.replaceAll("-", "")), eatDate, createdAt: new Date(at) } }));
      }, { isolationLevel: "ReadCommitted", timeout: 30_000 });
    } catch {
      // A competing identical date may have won. Do not retry arbitrary effects.
      return read(async (transaction) => {
        const previous = await transaction.dailyRun.findUnique({ where: { eatDate } });
        return previous ? runFromRow(previous) : historyFail("unavailable");
      });
    }
  }

  async function withFixtureTransaction<Result>(fixtureId: string,
    operation: (writer: PredictionHistoryWriter, transaction: HistoryTransaction) => Promise<Result>, existingTransaction?: HistoryTransaction): Promise<Result> {
    parseHistory(historyId, fixtureId);
    let domainError: PredictionHistoryError | undefined;
    try {
      // Reuse catalog lock order (provider then fixture), shared with imports.
      return await catalog.withFixtureTransaction(fixtureId, async (transaction) => {
        const now = async () => parseHistory(historyInstant, options.clock?.now() ??
          (await transaction.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at.getTime());
        let active = true;
        let auditedActiveId = (await transaction.footballFixture.findUniqueOrThrow({ where: { id: fixtureId }, select: { activeCycleId: true } })).activeCycleId;
        const check = () => { if (!active) historyFail("invalid-state"); };
        async function cycle(id: string) {
          check();
          const value = await storedCycle(transaction, id);
          if (!value) return historyFail("not-found");
          if (value.fixtureId !== fixtureId) return historyFail("invalid-request");
          return value;
        }
        async function bumpFixture() {
          await transaction.footballFixture.update({ where: { id: fixtureId }, data: { dataVersion: { increment: 1 } } });
        }
        async function activate(value: StoredCycle) {
          const fixture = await transaction.footballFixture.findUniqueOrThrow({ where: { id: fixtureId }, select: { activeCycleId: true } });
          if (fixture.activeCycleId !== null && fixture.activeCycleId !== value.id) {
            const previous = await cycle(fixture.activeCycleId);
            if (previous.state === "open" || previous.ordinal >= value.ordinal) return historyFail("invalid-state");
          }
          await transaction.footballFixture.update({ where: { id: fixtureId }, data: { activeCycleId: value.id } });
        }
        async function audit(value: StoredCycle, eventKey: string, requestHash: string, kind: string, at: number,
          actor: HistoryActor, before: StoredCycle | null, revisionId: string | null = null) {
          const activeId = (await transaction.footballFixture.findUniqueOrThrow({ where: { id: fixtureId }, select: { activeCycleId: true } })).activeCycleId;
          const beforeJson = evidenceSerialize({ cycle: before, activeCycleId: auditedActiveId, revisionId: null });
          const afterJson = evidenceSerialize({ cycle: value, activeCycleId: activeId, revisionId });
          await transaction.$executeRaw`INSERT INTO PredictionAudit
            (id, fixtureId, cycleId, version, eventKey, requestHash, kind, recordedAt, actor, reason, evidenceRef, beforeJson, afterJson, integrity)
            VALUES (${randomUUID()}, ${fixtureId}, ${value.id}, ${value.version}, ${eventKey}, ${requestHash}, ${kind}, ${new Date(at)},
              ${actor.actor}, ${actor.reason}, ${actor.evidenceRef}, CAST(${beforeJson} AS JSON), CAST(${afterJson} AS JSON),
              SHA2(CONCAT(${eventKey}, ':', ${requestHash}, ':', COALESCE(CAST(CAST(${beforeJson} AS JSON) AS CHAR), 'null'), ':',
                CAST(CAST(${afterJson} AS JSON) AS CHAR)), 256))`;
          auditedActiveId = activeId;
        }
        async function schedule(value: StoredCycle, at: number, actor: HistoryActor,
          observation: ChangeCycleInput["schedule"] = { kickoffAt: value.kickoffAt, providerObservedAt: null, actualStartedAt: null }) {
          await transaction.predictionSchedule.create({ data: { id: randomUUID(), fixtureId, cycleId: value.id,
            version: value.scheduleVersion, kickoffAt: new Date(value.kickoffAt), cutoffAt: new Date(value.cutoffAt),
            observedAt: new Date(at), providerObservedAt: historyDate(observation.providerObservedAt),
            actualStartedAt: historyDate(observation.actualStartedAt), actor: actor.actor, reason: actor.reason, evidenceRef: actor.evidenceRef } });
        }
        const primitives: PredictionHistoryWriter = Object.freeze({
          async createCycle(input) {
            check(); const request = parseCreateCycle(input);
            if (request.fixtureId !== fixtureId) return historyFail("invalid-request");
            const requestHash = evidenceFingerprint(request);
            if (request.openedAt > await now()) return historyFail("invalid-request");
            const previous = await transaction.predictionCycle.findUnique({ where: { fixtureId_creationKey: { fixtureId, creationKey: request.creationKey } } });
            if (previous) {
              if (previous.creationHash !== requestHash) return historyFail("conflicting-request");
              return cycle(previous.id);
            }
            const last = await transaction.predictionCycle.findFirst({ where: { fixtureId }, orderBy: { ordinal: "desc" } });
            const id = randomUUID();
            await transaction.predictionCycle.create({ data: { id, fixtureId, creationKey: request.creationKey,
              creationHash: requestHash, ordinal: nextHistoryVersion(last?.ordinal ?? 0), scheduleVersion: 1,
              kickoffAt: new Date(request.kickoffAt), cutoffAt: new Date(getPublicationDeadline(request.kickoffAt)), openedAt: new Date(request.openedAt) } });
            // The initial schedule is inserted before the cycle is observable.
            const value: StoredCycle = freezeEvidence({ id, fixtureId, creationKey: request.creationKey, creationHash: requestHash,
              ordinal: nextHistoryVersion(last?.ordinal ?? 0), version: 1, scheduleVersion: 1,
              kickoffAt: request.kickoffAt, cutoffAt: getPublicationDeadline(request.kickoffAt), openedAt: request.openedAt,
              state: "open", currentSetId: null, lockedSetId: null, closedAt: null, lockedAt: null, voidedAt: null, voidReason: null });
            await schedule(value, request.openedAt, request);
            if (request.activate) await activate(value);
            await audit(value, request.creationKey, requestHash, "cycle-created", await now(), request, null);
            await bumpFixture(); return value;
          },
          async appendRevision(input) {
            check(); const request = parseAppendRevision(input), context = request.candidate.context.context;
            if (context.fixtureId !== fixtureId) return historyFail("invalid-request");
            const cycleId = context.cycleId!, runId = context.runId!, requestHash = evidenceFingerprint(request);
            const known = await transaction.predictionSet.findUnique({ where: { runId_fixtureId_cycleId: { runId, fixtureId, cycleId } } });
            if (known) {
              if (known.requestHash !== requestHash) return historyFail("conflicting-request");
              return (await storedRevision(transaction, known.id))!;
            }
            const previousCycle = await cycle(cycleId);
            if (previousCycle.state !== "open") return historyFail("closed-cycle");
            if (request.scheduleVersion !== previousCycle.scheduleVersion || context.kickoffAt !== previousCycle.kickoffAt) return historyFail("stale-version");
            const run = await transaction.dailyRun.findUnique({ where: { id: runId } });
            if (!run) return historyFail("not-found");
            const evidence = await transaction.fixtureEvidenceSnapshot.findUnique({ where: { requestId: request.evidenceSnapshotId } });
            if (!evidence || evidence.fixtureId !== fixtureId || evidence.cycleId !== cycleId || evidence.runId !== runId ||
              evidence.fixtureVersion !== context.fixtureVersion || evidence.contentHash !== request.candidate.context.evidenceHash ||
              evidence.cutoffAt.getTime() !== context.cutoffAt || evidence.analysisAt.getTime() !== context.analysisAt ||
              evidence.kickoffAt.getTime() !== context.kickoffAt || evidence.homeTeamId !== context.home.teamId ||
              evidence.awayTeamId !== context.away.teamId) return historyFail("invalid-request");
            const predecessor = await transaction.predictionSet.findFirst({ where: { cycleId }, orderBy: { cycleRevision: "desc" } });
            if (predecessor && predecessor.runSequence >= run.sequence) return historyFail("out-of-order");
            const latestFixture = await transaction.predictionSet.findFirst({ where: { fixtureId }, orderBy: { fixtureRevision: "desc" } });
            const at = await now(); if (at < request.publishedAt || at < previousCycle.openedAt) return historyFail("invalid-request");
            const id = randomUUID(), candidateJson = evidenceSerialize(request.candidate);
            await transaction.$executeRaw`INSERT INTO PredictionSet
              (id, fixtureId, fixtureVersion, cycleId, runId, runSequence, jobId, fixtureRevision, cycleRevision,
               predecessorId, scheduleVersion, modelVersionId, evidenceSnapshotId, evidenceHash, evidenceCutoffAt,
               generationCompletedAt, publishedAt, recordedAt, ruleVersion, requestHash, integrity, candidateJson)
              VALUES (${id}, ${fixtureId}, ${context.fixtureVersion}, ${cycleId}, ${runId}, ${run.sequence}, ${request.candidate.context.jobId},
                ${nextHistoryVersion(latestFixture?.fixtureRevision ?? 0)}, ${nextHistoryVersion(predecessor?.cycleRevision ?? 0)},
                ${predecessor?.id ?? null}, ${request.scheduleVersion}, ${request.candidate.context.pin?.modelVersionId ?? null},
                ${request.evidenceSnapshotId}, ${request.candidate.context.evidenceHash}, ${new Date(context.cutoffAt)},
                ${new Date(request.generationCompletedAt)}, ${new Date(request.publishedAt)}, ${new Date(at)}, ${MARKET_RULE_VERSION},
                ${requestHash}, SHA2(CONCAT(${id}, ':', ${requestHash}, ':', CAST(CAST(${candidateJson} AS JSON) AS CHAR)), 256), CAST(${candidateJson} AS JSON))`;
            for (const family of Object.keys(marketSelections) as MarketFamily[]) {
              const item = request.candidate.markets[family], payload = evidenceSerialize(item);
              const values = item.available ? marketSelections[family].map((selection) =>
                (item.market.probabilities as Readonly<Record<string, number>>)[selection]) : [];
              await transaction.$executeRaw`INSERT INTO MarketPrediction
                (setId, family, available, source, selection, selectedProbability, probability1, probability2, probability3,
                 unavailableReason, generatedAt, retrievedAt, providerUpdatedAt, integrity, payloadJson)
                VALUES (${id}, ${family}, ${item.available}, ${item.available ? item.market.source : null},
                  ${item.available ? item.market.selection : null}, ${item.available ? item.market.selectedProbability : null},
                  ${values[0] ?? null}, ${values[1] ?? null}, ${values[2] ?? null}, ${item.available ? null : item.reason},
                  ${historyDate(item.available ? item.timestamps.generatedAt : null)}, ${historyDate(item.available ? item.timestamps.retrievedAt : null)},
                  ${historyDate(item.available ? item.timestamps.providerUpdatedAt : null)}, SHA2(CAST(CAST(${payload} AS JSON) AS CHAR), 256), CAST(${payload} AS JSON))`;
            }
            const value = { ...previousCycle, version: nextHistoryVersion(previousCycle.version) };
            await transaction.predictionCycle.update({ where: { id: cycleId }, data: { version: value.version } });
            await audit(value, evidenceFingerprint({ kind: "revision-recorded", runId, fixtureId, cycleId }), requestHash,
              "revision-recorded", at, request, previousCycle, id);
            await bumpFixture(); return (await storedRevision(transaction, id))!;
          },
          async changeCycle(input) {
            check(); const request = parseChangeCycle(input), requestHash = evidenceFingerprint(request);
            if (request.at > await now()) return historyFail("invalid-request");
            const previous = await cycle(request.cycleId);
            const replay = await transaction.predictionAudit.findUnique({ where: { cycleId_eventKey: { cycleId: previous.id, eventKey: request.eventKey } } });
            if (replay) {
              if (replay.requestHash !== requestHash || replay.kind !== "cycle-changed") return historyFail("conflicting-request");
              return previous;
            }
            if (previous.version !== request.expectedVersion) return historyFail("stale-version");
            if (request.at < previous.openedAt || request.next.closedAt !== null && request.next.closedAt < previous.openedAt) return historyFail("invalid-request");
            if (previous.state !== "open" && (request.next.state === "open" || request.next.currentSetId !== previous.currentSetId ||
              request.next.lockedSetId !== previous.lockedSetId || request.next.lockedAt !== previous.lockedAt ||
              request.next.closedAt !== previous.closedAt || previous.state === "void" && request.next.state !== "void")) return historyFail("closed-cycle");
            for (const id of [request.next.currentSetId, request.next.lockedSetId]) if (id !== null) {
              const set = await storedRevision(transaction, id);
              if (!set || set.fixtureId !== fixtureId || set.cycleId !== previous.id) return historyFail("invalid-request");
            }
            const value: StoredCycle = freezeEvidence({ ...previous, ...request.next, version: nextHistoryVersion(previous.version),
              ...(request.schedule ? { scheduleVersion: nextHistoryVersion(previous.scheduleVersion), kickoffAt: request.schedule.kickoffAt,
                cutoffAt: getPublicationDeadline(request.schedule.kickoffAt) } : {}) });
            const { state, currentSetId, lockedSetId, voidReason } = value;
            await transaction.predictionCycle.update({ where: { id: value.id }, data: { state, currentSetId, lockedSetId, voidReason,
              version: value.version, scheduleVersion: value.scheduleVersion, kickoffAt: new Date(value.kickoffAt), cutoffAt: new Date(value.cutoffAt),
              closedAt: historyDate(value.closedAt), lockedAt: historyDate(value.lockedAt), voidedAt: historyDate(value.voidedAt) } });
            if (request.schedule) await schedule(value, request.at, request, request.schedule);
            if (request.activate) await activate(value);
            await audit(value, request.eventKey, requestHash, "cycle-changed", await now(), request, previous);
            await bumpFixture(); return value;
          },
        });
        // A caller cannot catch a failed write and commit its earlier partial SQL.
        let failed = false, failure: unknown;
        async function tracked<Value>(write: () => Promise<Value>): Promise<Value> {
          check(); if (failed) throw failure;
          try { return await write(); }
          catch (error) { failed = true; failure = error; throw error; }
        }
        const writer: PredictionHistoryWriter = Object.freeze({
          createCycle: (input) => tracked(() => primitives.createCycle(input)),
          appendRevision: (input) => tracked(() => primitives.appendRevision(input)),
          changeCycle: (input) => tracked(() => primitives.changeCycle(input)),
        });
        try { const result = await operation(writer, transaction); if (failed) throw failure; return result; }
        catch (error) { if (error instanceof PredictionHistoryError) domainError = error; throw error; }
        finally { active = false; }
      }, existingTransaction);
    } catch { if (domainError) throw domainError; return historyFail("unavailable"); }
  }

  async function referenced(transaction: HistoryTransaction, cycleId: string, key: "currentSetId" | "lockedSetId") {
    const cycle = await storedCycle(transaction, cycleId), id = cycle?.[key];
    return id ? storedRevision(transaction, id) : null;
  }
  return Object.freeze({
    createRun, withFixtureTransaction,
    createCycle(input: CreateCycleInput) { const request = parseCreateCycle(input); return withFixtureTransaction(request.fixtureId, (writer) => writer.createCycle(request)); },
    findCycle(id: string) { parseHistory(historyId, id); return read((transaction) => storedCycle(transaction, id)); },
    findRevision(id: string) { parseHistory(historyId, id); return read((transaction) => storedRevision(transaction, id)); },
    currentRevision(cycleId: string) { parseHistory(historyId, cycleId); return read((transaction) => referenced(transaction, cycleId, "currentSetId")); },
    lockedRevision(cycleId: string) { parseHistory(historyId, cycleId); return read((transaction) => referenced(transaction, cycleId, "lockedSetId")); },
    displayForCycle(id: string) { parseHistory(historyId, id); return read((transaction) => storedCycleDisplay(transaction, id)); },
    displayForFixture(id: string) {
      parseHistory(historyId, id);
      return read(async (transaction) => {
        const fixture = await transaction.footballFixture.findUnique({ where: { id }, select: { activeCycleId: true } });
        return fixture?.activeCycleId ? storedCycleDisplay(transaction, fixture.activeCycleId) : null;
      });
    },
    earlierRevisions(cycleId: string, { beforeRevision, limit = 30 }: Readonly<{ beforeRevision?: number; limit?: number }> = {}) {
      parseHistory(historyId, cycleId); parseHistory(historyVersion.max(100), limit);
      if (beforeRevision !== undefined) parseHistory(historyVersion, beforeRevision);
      return read(async (transaction) => {
        const rows = await transaction.predictionSet.findMany({ where: { cycleId,
          ...(beforeRevision === undefined ? {} : { cycleRevision: { lt: beforeRevision } }) },
          orderBy: { cycleRevision: "desc" }, take: limit, select: { id: true } });
        return freezeEvidence(await Promise.all(rows.map(async (row) => (await storedRevision(transaction, row.id))!)));
      });
    },
    cyclesForFixture(fixtureId: string, { beforeOrdinal, limit = 30 }: Readonly<{ beforeOrdinal?: number; limit?: number }> = {}) {
      parseHistory(historyId, fixtureId); parseHistory(historyVersion.max(100), limit);
      if (beforeOrdinal !== undefined) parseHistory(historyVersion, beforeOrdinal);
      return read(async (transaction) => {
        const rows = await transaction.predictionCycle.findMany({ where: { fixtureId,
          ...(beforeOrdinal === undefined ? {} : { ordinal: { lt: beforeOrdinal } }) }, orderBy: { ordinal: "desc" }, take: limit, select: { id: true } });
        return freezeEvidence(await Promise.all(rows.map(async (row) => (await storedCycle(transaction, row.id))!)));
      });
    },
    auditHistory(cycleId: string, { beforeVersion, limit = 30 }: Readonly<{ beforeVersion?: number; limit?: number }> = {}) {
      parseHistory(historyId, cycleId); parseHistory(historyVersion.max(100), limit);
      if (beforeVersion !== undefined) parseHistory(historyVersion, beforeVersion);
      return read(async (transaction) => {
        const rows = await transaction.$queryRaw<HistoryRow[]>`SELECT *, integrity = SHA2(CONCAT(eventKey, ':', requestHash, ':',
          COALESCE(CAST(beforeJson AS CHAR), 'null'), ':', CAST(afterJson AS CHAR)), 256) AS validIntegrity
          FROM PredictionAudit WHERE cycleId = ${cycleId} AND version < ${beforeVersion ?? 4_294_967_295 + 1} ORDER BY version DESC LIMIT ${limit}`;
        return freezeEvidence(rows.map((row): StoredHistoryAudit => {
          assertHistorySeal(row.validIntegrity);
          const before = parseHistoryAuditSnapshot(historyJson(row.beforeJson)), after = parseHistoryAuditSnapshot(historyJson(row.afterJson));
          if (!after.cycle || after.cycle.id !== row.cycleId || after.cycle.fixtureId !== row.fixtureId ||
            after.cycle.version !== Number(row.version) || before.cycle !== null && before.cycle.id !== row.cycleId ||
            !["cycle-created", "cycle-changed", "revision-recorded"].includes(String(row.kind))) return historyFail("invalid-state");
          return { id: String(row.id), fixtureId: String(row.fixtureId), cycleId: String(row.cycleId), version: Number(row.version),
            eventKey: String(row.eventKey), requestHash: String(row.requestHash), kind: row.kind as StoredHistoryAudit["kind"],
            actor: String(row.actor), reason: String(row.reason), evidenceRef: String(row.evidenceRef), recordedAt: historyTime(row.recordedAt), before, after };
        }));
      });
    },
    scheduleHistory(cycleId: string, { afterVersion, limit = 30 }: Readonly<{ afterVersion?: number; limit?: number }> = {}) {
      parseHistory(historyId, cycleId); parseHistory(historyVersion.max(100), limit);
      if (afterVersion !== undefined) parseHistory(historyVersion, afterVersion);
      return read(async (transaction) => freezeEvidence((await transaction.predictionSchedule.findMany({ where: { cycleId,
        ...(afterVersion === undefined ? {} : { version: { gt: afterVersion } }) }, orderBy: { version: "asc" }, take: limit })).map((row) => ({
          ...row, kickoffAt: historyTime(row.kickoffAt), cutoffAt: historyTime(row.cutoffAt), observedAt: historyTime(row.observedAt),
          providerObservedAt: row.providerObservedAt === null ? null : historyTime(row.providerObservedAt),
          actualStartedAt: row.actualStartedAt === null ? null : historyTime(row.actualStartedAt),
        }))));
    },
  });
}
