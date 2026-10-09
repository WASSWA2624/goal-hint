import "server-only";

import { randomUUID } from "node:crypto";
import { addReportingDays, createPredictionWindow, getPublicationDeadline, isInWindow, parseReportingDate,
  utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { parseCatalogImportRequest } from "../football/catalog-input.ts";
import type { Prisma, DailyRun } from "../generated/prisma/client.ts";
import type { JobQueue } from "../jobs/job-contract.ts";
import { durableJobId, jobHash, parseJobEnvelope } from "../jobs/job-input.ts";
import { createMysqlPredictionHistoryStore } from "../predictions/history-mysql-store.ts";
import { DailySelectionError, selectionFail, type CycleSelectionEligibility, type DegradedSelectionAction,
  type SelectionAuthority, type SelectionCoverage, type SelectionEntry, type SelectionImport,
  type SelectionLease, type SelectionManifest, type SelectionPolicy } from "./selection-contract.ts";
import { parseCycleSelectionEligibility, parseSelection } from "./selection-input.ts";

type Transaction = Prisma.TransactionClient;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const strings = (value: unknown): string[] => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return selectionFail("unavailable");
  return value;
};
async function serverNow(tx: Transaction) {
  const rows = await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`;
  return utcInstantFromEpochMilliseconds(rows[0]!.at.getTime());
}
async function lockRun(tx: Transaction, id: string) {
  await tx.$queryRaw`SELECT id FROM DailyRun WHERE id = ${id} FOR UPDATE`;
  return tx.dailyRun.findUniqueOrThrow({ where: { id } });
}
async function assertOwned(tx: Transaction, lease: SelectionLease) {
  const row = await lockRun(tx, lease.runId), now = await serverNow(tx);
  if (row.ownerId !== lease.ownerId || row.fence !== lease.fence || row.leaseExpiresAt === null || row.leaseExpiresAt.getTime() <= now) return selectionFail("lost-lease");
  return { row, now };
}
async function manifestFromRow(tx: Transaction, row: DailyRun): Promise<SelectionManifest | null> {
  const sealed = await tx.dailyRunManifest.findUnique({ where: { runId: row.id } });
  if (sealed === null) return row.committedAt === null ? null : selectionFail("unavailable");
  if (evidenceFingerprint(sealed.manifestJson) !== sealed.manifestHash) return selectionFail("unavailable");
  const manifest = sealed.manifestJson as unknown as SelectionManifest;
  if (manifest.runId !== row.id || manifest.sequence !== String(row.sequence) || manifest.runDate !== row.eatDate.toISOString().slice(0, 10) ||
    manifest.selectionHash !== row.selectionHash || evidenceFingerprint(row.selectionJson) !== manifest.selectionHash ||
    manifest.committedAt !== row.committedAt?.getTime() || manifest.startInclusive !== row.windowStart?.getTime() ||
    manifest.endExclusive !== row.windowEnd?.getTime() || manifest.partial !== row.partial || manifest.entries.length !== row.totalJobs) return selectionFail("unavailable");
  return freezeEvidence(manifest);
}

export function createMysqlDailySelectionStore(database: DatabaseRuntime, queue: JobQueue) {
  const history = createMysqlPredictionHistoryStore(database);
  async function transact<Result>(operation: (tx: Transaction) => Promise<Result>): Promise<Result> {
    let failure: DailySelectionError | undefined;
    try { return await database.transaction(async (tx) => {
      try { return await operation(tx); } catch (error) { if (error instanceof DailySelectionError) failure = error; throw error; }
    }, { isolationLevel: "ReadCommitted", timeout: 60_000 }); }
    catch { if (failure) throw failure; return selectionFail("unavailable"); }
  }
  async function coverage(tx: Transaction, runId: string, runDate: string): Promise<SelectionCoverage[]> {
    const attempts = await tx.dailyRunImport.findMany({ where: { runId }, orderBy: { attempt: "desc" } });
    const result: SelectionCoverage[] = [];
    for (let offset = 0; offset < 7; offset++) {
      const date = addReportingDays(parseReportingDate(runDate), offset);
      const latest = attempts.find((row) => row.eatDate.toISOString().slice(0, 10) === date);
      const imported = latest ? await tx.footballImport.findUnique({ where: { id: latest.id } }) : null;
      const expected = { kind: "fixtures", query: { date } };
      if (imported && evidenceFingerprint(imported.selection) !== evidenceFingerprint(expected)) return selectionFail("unavailable");
      const retained = await tx.footballFixture.findMany({ where: { provider: "api-football", eatDate: new Date(`${date}T00:00:00Z`) }, select: { id: true } });
      const missing = imported ? strings(imported.missingCoverage) : ["date-not-retrieved"];
      result.push({ date, status: imported?.status ?? "failed", importId: imported?.id ?? null,
        fixtureIds: [...new Set([...(imported ? strings(imported.fixtureIds) : []), ...retained.map((row) => row.id)])].sort(),
        reasons: imported ? strings(imported.reasons) : [latest?.failure ?? "missing-import"],
        missingCoverage: imported?.status !== "complete" && missing.length === 0 ? ["date-retrieval-incomplete"] : missing,
        provenance: imported?.provenance ?? [] });
    }
    return result;
  }
  async function inspect(runId: string) {
    return transact(async (tx) => {
      const row = await tx.dailyRun.findUnique({ where: { id: runId } });
      if (!row) return null;
      const manifest = await manifestFromRow(tx, row);
      return freezeEvidence({ manifest, total: row.totalJobs, completed: row.completedJobs,
        terminal: row.terminalJobs, coverage: manifest?.coverage ?? await coverage(tx, row.id, row.eatDate.toISOString().slice(0, 10)) });
    });
  }
  return Object.freeze({
    inspect,
    async acquire(runDate: string, policy: SelectionPolicy, ownerId: string): Promise<SelectionLease | null> {
      parseSelection(jobHash, ownerId);
      const window = createPredictionWindow(parseReportingDate(runDate));
      const run = await history.createRun(runDate, window.startInclusive);
      return transact(async (tx) => {
        const row = await lockRun(tx, run.id), now = await serverNow(tx), hash = evidenceFingerprint(policy);
        if (row.selectionHash !== null && (row.selectionHash !== hash || evidenceFingerprint(row.selectionJson) !== hash)) return selectionFail("conflicting-request");
        if (row.leaseExpiresAt !== null && row.leaseExpiresAt.getTime() > now) return null;
        await tx.dailyRun.update({ where: { id: row.id }, data: { selectionHash: hash, selectionJson: json(policy),
          windowStart: new Date(window.startInclusive), windowEnd: new Date(window.endExclusive),
          ownerId, fence: { increment: 1 }, leaseExpiresAt: new Date(now + policy.leaseMs) } });
        return freezeEvidence({ runId: row.id, ownerId, fence: row.fence + 1 });
      });
    },
    async renew(lease: SelectionLease, leaseMs: number) {
      return transact(async (tx) => {
        const { row, now } = await assertOwned(tx, lease);
        const policy = row.selectionJson as unknown as SelectionPolicy;
        if (leaseMs !== policy.leaseMs) return selectionFail("invalid-request");
        await tx.dailyRun.update({ where: { id: row.id }, data: { leaseExpiresAt: new Date(now + leaseMs) } });
      });
    },
    async release(lease: SelectionLease) {
      return transact(async (tx) => {
        const { row } = await assertOwned(tx, lease);
        await tx.dailyRun.update({ where: { id: row.id }, data: { ownerId: null, leaseExpiresAt: null } });
      });
    },
    async beginImport(lease: SelectionLease, date: string, policy: SelectionPolicy): Promise<SelectionImport | null> {
      return transact(async (tx) => {
        const { row, now } = await assertOwned(tx, lease);
        if (row.committedAt !== null) return selectionFail("conflicting-request");
        const eatDate = new Date(`${parseReportingDate(date)}T00:00:00Z`);
        const window = createPredictionWindow(parseReportingDate(row.eatDate.toISOString().slice(0, 10)));
        if (date < window.runDate || date >= window.endDateExclusive || row.selectionHash !== evidenceFingerprint(policy)) return selectionFail("invalid-request");
        const previous = await tx.dailyRunImport.findFirst({ where: { runId: row.id, eatDate }, orderBy: { attempt: "desc" } });
        if (previous) {
          const receipt = await tx.footballImport.findUnique({ where: { id: previous.id } });
          if (receipt?.status === "complete") {
            if (previous.finishedAt === null) await tx.dailyRunImport.update({ where: { id: previous.id }, data: { finishedAt: new Date(now), failure: null } });
            return null;
          }
          const request = parseCatalogImportRequest(previous.requestJson);
          // A crash after catalog commit needs only receipt reconciliation, never another fetch.
          if (previous.finishedAt === null && (receipt !== null || request.bounds.deadlineAt > now)) return { id: previous.id, request, finished: false };
          if (previous.finishedAt === null) await tx.dailyRunImport.update({ where: { id: previous.id }, data: { finishedAt: new Date(now), failure: "attempt-expired" } });
        }
        const id = randomUUID(), { deadlineMs, ...bounds } = policy.importBounds;
        const request = parseCatalogImportRequest({ id, selection: { kind: "fixtures", query: { date } },
          retentionEvidenceRef: policy.retentionEvidenceRef, bounds: { ...bounds, deadlineAt: now + deadlineMs } });
        await tx.dailyRunImport.create({ data: { id, runId: row.id, eatDate, attempt: (previous?.attempt ?? 0) + 1, requestJson: json(request) } });
        return { id, request, finished: false };
      });
    },
    async finishImport(lease: SelectionLease, id: string, failed: boolean) {
      return transact(async (tx) => {
        const { now } = await assertOwned(tx, lease);
        const attempt = await tx.dailyRunImport.findUnique({ where: { id } });
        if (!attempt || attempt.runId !== lease.runId) return selectionFail("invalid-request");
        if (attempt.finishedAt !== null) return;
        const receipt = await tx.footballImport.findUnique({ where: { id } });
        if (!failed && receipt === null) return selectionFail("unavailable");
        await tx.dailyRunImport.update({ where: { id }, data: { finishedAt: new Date(now), failure: receipt ? null : "import-unavailable" } });
      });
    },
    async recordCycleEligibility(input: CycleSelectionEligibility, authority: SelectionAuthority) {
      const value = parseCycleSelectionEligibility(input);
      let verified = false;
      try { verified = authority.verifyCycleEligibility(value) === true; } catch { /* Fail closed. */ }
      if (!verified) return selectionFail("unauthorized");
      return history.withFixtureTransaction(value.fixtureId, async (_writer, tx) => {
        const previous = await tx.selectionCycleEligibility.findUnique({ where: { previousCycleId: value.previousCycleId } });
        if (previous) {
          const same = previous.id === value.id && previous.previousVersion === value.previousVersion && previous.kickoffAt.getTime() === value.kickoffAt &&
            previous.state === value.state && previous.actor === value.actor && previous.evidenceRef === value.evidenceRef;
          if (!same) return selectionFail("conflicting-request");
          return;
        }
        const cycle = await tx.predictionCycle.findUnique({ where: { id: value.previousCycleId } });
        const fixture = await tx.footballFixture.findUniqueOrThrow({ where: { id: value.fixtureId } });
        if (!cycle || cycle.fixtureId !== value.fixtureId || cycle.version !== value.previousVersion || fixture.activeCycleId !== cycle.id ||
          (value.state === "void" ? cycle.state !== "void" : cycle.state !== "closed" || fixture.status !== "postponed") ||
          cycle.closedAt === null) return selectionFail("invalid-request");
        await tx.selectionCycleEligibility.create({ data: { ...value, kickoffAt: new Date(value.kickoffAt), recordedAt: new Date(await serverNow(tx)) } });
      });
    },
    async commit(lease: SelectionLease, policy: SelectionPolicy, degradedAction: DegradedSelectionAction | null): Promise<SelectionManifest> {
      return transact(async (tx) => {
        const { row, now } = await assertOwned(tx, lease), known = await manifestFromRow(tx, row);
        if (known) return known;
        if (row.selectionHash !== evidenceFingerprint(policy)) return selectionFail("conflicting-request");
        const runDate = row.eatDate.toISOString().slice(0, 10), window = createPredictionWindow(parseReportingDate(runDate));
        const dates = await coverage(tx, row.id, runDate), partial = dates.some((date) => date.status !== "complete");
        if (partial && degradedAction === null) return selectionFail("incomplete-import");
        const ids = [...new Set(dates.flatMap((date) => date.fixtureIds))].sort();
        if (ids.length > policy.maxFixtures) return selectionFail("capacity-exceeded");
        const entries: Omit<SelectionEntry, "rank" | "envelope">[] = [], exclusions: { fixtureId: string; reason: string }[] = [];
        for (const fixtureId of ids) {
          await history.withFixtureTransaction(fixtureId, async (writer, nested) => {
            const fixture = await nested.footballFixture.findUniqueOrThrow({ where: { id: fixtureId }, include: {
              season: { include: { competition: { include: { providers: true } } } }, activeCycle: true,
              lifecycleState: true, _count: { select: { predictionCycles: true } } } });
            const exclude = (reason: string) => { exclusions.push({ fixtureId, reason }); };
            const competition = fixture.season.competition.providers.some((mapping) => mapping.provider === "api-football" && policy.competitionIds.includes(Number(mapping.externalId)));
            if (!competition) return exclude("competition-ineligible");
            if (fixture.lifecycleState?.issue) return exclude("lifecycle-conflict");
            if (!policy.eligibleStatuses.includes(fixture.status as "scheduled")) return exclude("status-ineligible");
            if (fixture.kickoff === null || !isInWindow(utcInstantFromEpochMilliseconds(fixture.kickoff.getTime()), window)) return exclude("outside-window");
            const kickoffAt = utcInstantFromEpochMilliseconds(fixture.kickoff.getTime());
            if (getPublicationDeadline(kickoffAt) <= now) return exclude("cutoff-passed");
            let cycle = fixture.activeCycle;
            if (!cycle && fixture._count.predictionCycles > 0) return exclude("no-active-cycle");
            if (cycle?.state !== "open" && cycle) {
              const eligible = await nested.selectionCycleEligibility.findUnique({ where: { previousCycleId: cycle.id } });
              if (!eligible || eligible.consumedRunId !== null || eligible.previousVersion !== cycle.version ||
                eligible.eligibleAfter !== null && eligible.eligibleAfter.getTime() >= window.startInclusive ||
                eligible.kickoffAt.getTime() !== kickoffAt || (eligible.state === "void" ? cycle.state !== "void" : cycle.state !== "closed")) return exclude("closed-cycle");
              const next = await writer.createCycle({ fixtureId, creationKey: evidenceFingerprint({ eligibility: eligible.id }), kickoffAt, openedAt: now,
                activate: true, actor: "daily-selection", reason: "Recorded eligible rescheduled cycle", evidenceRef: eligible.evidenceRef });
              cycle = await nested.predictionCycle.findUniqueOrThrow({ where: { id: next.id } });
              await nested.selectionCycleEligibility.update({ where: { id: eligible.id }, data: { consumedRunId: row.id } });
            } else if (!cycle) {
              const initial = await writer.createCycle({ fixtureId, creationKey: evidenceFingerprint({ fixtureId, kind: "initial-selection-cycle" }),
                kickoffAt, openedAt: now, activate: true, actor: "daily-selection", reason: "Initial daily selection", evidenceRef: policy.evidenceRef });
              cycle = await nested.predictionCycle.findUniqueOrThrow({ where: { id: initial.id } });
            }
            if (cycle.kickoffAt.getTime() !== kickoffAt || cycle.cutoffAt.getTime() <= now) return exclude("cycle-schedule-ineligible");
            entries.push({ fixtureId, cycleId: cycle.id, kickoffAt });
          }, tx);
        }
        entries.sort((a, b) => a.kickoffAt - b.kickoffAt || a.fixtureId.localeCompare(b.fixtureId));
        const selected = entries.map((entry, rank): SelectionEntry => {
          const refresh = { runId: row.id, fixtureId: entry.fixtureId, cycleId: entry.cycleId };
          const envelope = parseJobEnvelope({ ...policy.refresh, version: 1, idempotencyKey: evidenceFingerprint(refresh), refresh,
            payload: { input: policy.refresh.payload, ...refresh, runDate, rank },
            notBefore: window.startInclusive + rank, expiresAt: getPublicationDeadline(utcInstantFromEpochMilliseconds(entry.kickoffAt)),
            priority: 255 - Math.min(rank, 255) });
          return { ...entry, rank, envelope };
        });
        const manifest: SelectionManifest = { version: 1, runId: row.id, runDate, sequence: String(row.sequence), selectionHash: row.selectionHash!,
          startInclusive: window.startInclusive, endExclusive: window.endExclusive, committedAt: now, partial,
          degradedAction: partial ? degradedAction : null, coverage: dates, exclusions, entries: selected };
        for (const entry of selected) await tx.runFixture.create({ data: { runId: row.id, fixtureId: entry.fixtureId,
          cycleId: entry.cycleId, rank: entry.rank, kickoffAt: new Date(entry.kickoffAt), envelopeJson: json(entry.envelope) } });
        // Check ownership again after potentially long fixture work; all effects roll back on expiry.
        await assertOwned(tx, lease);
        await tx.dailyRunManifest.create({ data: { runId: row.id, manifestHash: evidenceFingerprint(manifest), manifestJson: json(manifest) } });
        await tx.dailyRun.update({ where: { id: row.id }, data: { committedAt: new Date(now), partial, totalJobs: selected.length } });
        return freezeEvidence(manifest);
      });
    },
    async reconcile(lease: SelectionLease) {
      const inspected = await inspect(lease.runId), manifest = inspected?.manifest;
      if (!manifest) return selectionFail("incomplete-import");
      for (const entry of manifest.entries) {
        // One transaction per entry avoids shard lock ordering and preserves recovery prefixes.
        await queue.withTransaction(async (enqueue, tx) => {
          await assertOwned(tx, lease);
          const key = { runId: lease.runId, fixtureId: entry.fixtureId, cycleId: entry.cycleId };
          const stored = await tx.runFixture.findUniqueOrThrow({ where: { runId_fixtureId_cycleId: key } });
          if (evidenceFingerprint(stored.envelopeJson) !== evidenceFingerprint(entry.envelope) || stored.rank !== entry.rank ||
            stored.kickoffAt.getTime() !== entry.kickoffAt) return selectionFail("unavailable");
          if (stored.jobId !== null) {
            if (stored.jobId !== durableJobId(entry.envelope)) return selectionFail("unavailable");
            return;
          }
          const job = await enqueue(entry.envelope);
          await tx.runFixture.update({ where: { runId_fixtureId_cycleId: key }, data: { jobId: job.id, jobState: job.state, terminalReason: job.terminalReason } });
        });
      }
      return this.progress(lease.runId);
    },
    async progress(runId: string) {
      return transact(async (tx) => {
        const row = await lockRun(tx, runId), manifest = await manifestFromRow(tx, row);
        if (!manifest) return selectionFail("incomplete-import");
        const entries = await tx.runFixture.findMany({ where: { runId }, include: { job: true } });
        if (entries.length !== manifest.entries.length) return selectionFail("unavailable");
        let completed = 0, terminal = 0;
        for (const entry of entries) {
          if (!entry.job) continue;
          const state = entry.job.state;
          if (state === "succeeded") completed++;
          if (["succeeded", "failed", "expired"].includes(state)) terminal++;
          if (entry.jobState !== state || entry.terminalReason !== entry.job.terminalReason)
            await tx.runFixture.update({ where: { runId_fixtureId_cycleId: { runId, fixtureId: entry.fixtureId, cycleId: entry.cycleId } },
              data: { jobState: state, terminalReason: entry.job.terminalReason } });
        }
        await tx.dailyRun.update({ where: { id: runId }, data: { completedJobs: completed, terminalJobs: terminal } });
        return freezeEvidence({ total: row.totalJobs, completed, terminal });
      });
    },
  });
}
export type DailySelectionStore = ReturnType<typeof createMysqlDailySelectionStore>;
