import "server-only";

import { randomUUID } from "node:crypto";
import { addReportingDays, createPredictionWindow, getPublicationDeadline, isInWindow, parseReportingDate, predictionWindowDays,
  utcInstantFromEpochMilliseconds, type PredictionWindowDays } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { parseCatalogImportRequest } from "../football/catalog-input.ts";
import { lockCatalog } from "../football/catalog-mysql-store.ts";
import { Prisma } from "../generated/prisma/client.ts";
import type { JobQueue } from "../jobs/job-contract.ts";
import { durableJobId, jobHash, parseJobEnvelope } from "../jobs/job-input.ts";
import type { CreateCycleInput } from "../predictions/history-contract.ts";
import { createMysqlPredictionHistoryStore } from "../predictions/history-mysql-store.ts";
import { DailySelectionError, selectionFail, type CycleSelectionEligibility, type DegradedSelectionAction,
  type SelectionAuthority, type SelectionCoverage, type SelectionEntry, type SelectionImport,
  type SelectionLease, type SelectionManifest, type SelectionPolicy } from "./selection-contract.ts";
import { parseCycleSelectionEligibility, parseSelection, parseSelectionPolicy } from "./selection-input.ts";
import { selectionRunWindow, storedSelectionManifest } from "./selection-read.ts";

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
async function selectionFixtures(tx: Transaction, ids: readonly string[]) {
  const select = {
    id: true, kickoff: true, status: true,
    season: { select: { competition: { select: {
      providers: { where: { provider: "api-football" }, select: { externalId: true } },
    } } } },
    activeCycle: { select: { id: true, state: true, version: true, kickoffAt: true, cutoffAt: true } },
    lifecycleState: { select: { issue: true } },
    _count: { select: { predictionCycles: true } },
  } satisfies Prisma.FootballFixtureSelect;
  const rows: Prisma.FootballFixtureGetPayload<{ select: typeof select }>[] = [];
  if (ids.length === 0) return rows;
  await lockCatalog(tx);
  for (let offset = 0; offset < ids.length; offset += 500) {
    const batch = ids.slice(offset, offset + 500);
    // Lock in the catalog's order before reading the fields used for eligibility.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM FootballFixture WHERE id IN (${Prisma.join(batch)}) ORDER BY id FOR UPDATE`);
    rows.push(...await tx.footballFixture.findMany({ where: { id: { in: batch } }, select, orderBy: { id: "asc" } }));
  }
  return rows.length === ids.length ? rows : selectionFail("unavailable");
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
  async function coverage(tx: Transaction, runId: string, runDate: string, days: PredictionWindowDays): Promise<SelectionCoverage[]> {
    const attempts = await tx.dailyRunImport.findMany({ where: { runId }, orderBy: { attempt: "desc" } });
    const result: SelectionCoverage[] = [];
    for (let offset = 0; offset < days; offset++) {
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
      const manifest = await storedSelectionManifest(tx, row);
      return freezeEvidence({ manifest, total: row.totalJobs, completed: row.completedJobs,
        terminal: row.terminalJobs, coverage: manifest?.coverage ?? await coverage(tx, row.id, row.eatDate.toISOString().slice(0, 10),
          predictionWindowDays(selectionRunWindow(row))) });
    });
  }
  return Object.freeze({
    inspect,
    async acquire(runDate: string, policy: SelectionPolicy, ownerId: string): Promise<SelectionLease | null> {
      parseSelection(jobHash, ownerId);
      const window = createPredictionWindow(parseReportingDate(runDate), policy.windowDays ?? 7);
      const run = await history.createRun(runDate, window.startInclusive);
      return transact(async (tx) => {
        const row = await lockRun(tx, run.id), now = await serverNow(tx), hash = evidenceFingerprint(policy);
        if (row.selectionHash !== null && evidenceFingerprint(row.selectionJson) !== row.selectionHash) return selectionFail("unavailable");
        if (row.selectionHash !== null && row.selectionHash !== hash && row.committedAt === null) return selectionFail("conflicting-request");
        if (row.selectionHash !== null) selectionRunWindow(row);
        if (row.leaseExpiresAt !== null && row.leaseExpiresAt.getTime() > now) return null;
        if (row.committedAt !== null) {
          if (!await storedSelectionManifest(tx, row)) return selectionFail("unavailable");
          const original = parseSelectionPolicy(row.selectionJson);
          await tx.dailyRun.update({ where: { id: row.id }, data: {
            ownerId, fence: { increment: 1 }, leaseExpiresAt: new Date(now + original.leaseMs) } });
          return freezeEvidence({ runId: row.id, ownerId, fence: row.fence + 1, leaseMs: original.leaseMs });
        }
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
        const window = selectionRunWindow(row);
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
        const { row } = await assertOwned(tx, lease), known = await storedSelectionManifest(tx, row);
        if (known) return known;
        if (row.selectionHash !== evidenceFingerprint(policy)) return selectionFail("conflicting-request");
        const runDate = row.eatDate.toISOString().slice(0, 10), window = selectionRunWindow(row);
        const dates = await coverage(tx, row.id, runDate, policy.windowDays ?? 7), partial = dates.some((date) => date.status !== "complete");
        if (partial && degradedAction === null) return selectionFail("incomplete-import");
        const ids = [...new Set(dates.flatMap((date) => date.fixtureIds))].sort();
        if (ids.length > policy.maxFixtures) return selectionFail("capacity-exceeded");
        const entries: Omit<SelectionEntry, "rank" | "envelope">[] = [], exclusions: { fixtureId: string; reason: string }[] = [];
        const capacity = policy.refreshCapacity, competitions = new Set(policy.competitionIds), initial: CreateCycleInput[] = [];
        const fixtures = await selectionFixtures(tx, ids);
        // Budgeted runs visit nearest kickoffs first so deferral never displaces an earlier match.
        if (capacity !== undefined) fixtures.sort((a, b) => (a.kickoff?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (b.kickoff?.getTime() ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
        const { now: selectedAt } = await assertOwned(tx, lease);
        for (const fixture of fixtures) {
          const fixtureId = fixture.id;
          const exclude = (reason: string) => exclusions.push({ fixtureId, reason });
          if (!fixture.season.competition.providers.some((mapping) => competitions.has(Number(mapping.externalId)))) { exclude("competition-ineligible"); continue; }
          if (fixture.lifecycleState?.issue) { exclude("lifecycle-conflict"); continue; }
          if (!policy.eligibleStatuses.includes(fixture.status as "scheduled")) { exclude("status-ineligible"); continue; }
          if (fixture.kickoff === null || !isInWindow(utcInstantFromEpochMilliseconds(fixture.kickoff.getTime()), window)) { exclude("outside-window"); continue; }
          const kickoffAt = utcInstantFromEpochMilliseconds(fixture.kickoff.getTime()), cutoffAt = getPublicationDeadline(kickoffAt);
          if (cutoffAt <= selectedAt) { exclude("cutoff-passed"); continue; }
          if (policy.refreshLeadMs !== undefined && cutoffAt <= selectedAt + policy.refreshLeadMs) { exclude("cutoff-too-close"); continue; }
          if (capacity !== undefined && entries.length + initial.length >= capacity) { exclude("refresh-capacity"); continue; }
          const cycle = fixture.activeCycle;
          if (!cycle) {
            if (fixture._count.predictionCycles > 0) { exclude("no-active-cycle"); continue; }
            initial.push({ fixtureId, creationKey: evidenceFingerprint({ fixtureId, kind: "initial-selection-cycle" }), kickoffAt,
              openedAt: selectedAt, activate: true, actor: "daily-selection", reason: "Initial daily selection", evidenceRef: policy.evidenceRef });
          } else if (cycle.state === "open") {
            if (cycle.kickoffAt.getTime() !== kickoffAt || cycle.cutoffAt.getTime() <= selectedAt) { exclude("cycle-schedule-ineligible"); continue; }
            entries.push({ fixtureId, cycleId: cycle.id, kickoffAt });
          } else {
            const eligible = await tx.selectionCycleEligibility.findUnique({ where: { previousCycleId: cycle.id } });
            if (!eligible || eligible.consumedRunId !== null || eligible.previousVersion !== cycle.version ||
              eligible.eligibleAfter !== null && eligible.eligibleAfter.getTime() >= window.startInclusive ||
              eligible.kickoffAt.getTime() !== kickoffAt || (eligible.state === "void" ? cycle.state !== "void" : cycle.state !== "closed")) { exclude("closed-cycle"); continue; }
            const next = await history.withFixtureTransaction(fixtureId, (writer) => writer.createCycle({
              fixtureId, creationKey: evidenceFingerprint({ eligibility: eligible.id }), kickoffAt, openedAt: selectedAt,
              activate: true, actor: "daily-selection", reason: "Recorded eligible rescheduled cycle", evidenceRef: eligible.evidenceRef,
            }), tx);
            await tx.selectionCycleEligibility.update({ where: { id: eligible.id }, data: { consumedRunId: row.id } });
            entries.push({ fixtureId, cycleId: next.id, kickoffAt });
          }
        }
        for (const cycle of await history.createInitialCyclesInTransaction(tx, initial, selectedAt))
          entries.push({ fixtureId: cycle.fixtureId, cycleId: cycle.id, kickoffAt: cycle.kickoffAt });
        entries.sort((a, b) => a.kickoffAt - b.kickoffAt || a.fixtureId.localeCompare(b.fixtureId));
        // Kickoff-ordered visits restore the original identifier order for the manifest.
        if (capacity !== undefined) exclusions.sort((a, b) => a.fixtureId < b.fixtureId ? -1 : a.fixtureId > b.fixtureId ? 1 : 0);
        const selected = entries.map((entry, rank): SelectionEntry => {
          const refresh = { runId: row.id, fixtureId: entry.fixtureId, cycleId: entry.cycleId };
          const envelope = parseJobEnvelope({ ...policy.refresh, version: 1, idempotencyKey: evidenceFingerprint(refresh), refresh,
            payload: { input: policy.refresh.payload, ...refresh, runDate, rank },
            notBefore: window.startInclusive + rank, expiresAt: getPublicationDeadline(utcInstantFromEpochMilliseconds(entry.kickoffAt)),
            priority: 255 - Math.min(rank, 255) });
          return { ...entry, rank, envelope };
        });
        for (let offset = 0; offset < selected.length; offset += 200)
          await tx.runFixture.createMany({ data: selected.slice(offset, offset + 200).map((entry) => ({ runId: row.id, fixtureId: entry.fixtureId,
            cycleId: entry.cycleId, rank: entry.rank, kickoffAt: new Date(entry.kickoffAt), envelopeJson: json(entry.envelope) })) });
        // Check ownership again after potentially long fixture work; all effects roll back on expiry.
        const { now: committedAt } = await assertOwned(tx, lease);
        const manifest: SelectionManifest = { version: 1, runId: row.id, runDate, sequence: String(row.sequence), selectionHash: row.selectionHash!,
          startInclusive: window.startInclusive, endExclusive: window.endExclusive, committedAt, partial,
          degradedAction: partial ? degradedAction : null, coverage: dates, exclusions, entries: selected };
        await tx.dailyRunManifest.create({ data: { runId: row.id, manifestHash: evidenceFingerprint(manifest), manifestJson: json(manifest) } });
        await tx.dailyRun.update({ where: { id: row.id }, data: { committedAt: new Date(committedAt), partial, totalJobs: selected.length } });
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
        const row = await lockRun(tx, runId), manifest = await storedSelectionManifest(tx, row);
        if (!manifest) return selectionFail("incomplete-import");
        // Match all four durable-job identity columns while avoiding per-job hydration and writes.
        const linkage = Prisma.sql`job.id = entry.jobId AND job.refreshRunId = entry.runId
          AND job.refreshFixtureId = entry.fixtureId AND job.refreshCycleId = entry.cycleId`;
        await tx.$executeRaw(Prisma.sql`UPDATE RunFixture entry JOIN DurableJob job ON ${linkage}
          SET entry.jobState = job.state, entry.terminalReason = job.terminalReason
          WHERE entry.runId = ${runId} AND NOT (entry.jobState <=> job.state AND entry.terminalReason <=> job.terminalReason)`);
        const [counts] = await tx.$queryRaw<{ total: bigint; completed: bigint; terminal: bigint }[]>(Prisma.sql`
          SELECT COUNT(*) AS total, COALESCE(SUM(job.id IS NOT NULL AND entry.jobState = 'succeeded'), 0) AS completed,
            COALESCE(SUM(job.id IS NOT NULL AND entry.jobState IN ('succeeded', 'failed', 'expired')), 0) AS terminal
          FROM RunFixture entry LEFT JOIN DurableJob job ON ${linkage} WHERE entry.runId = ${runId}`);
        if (!counts || Number(counts.total) !== manifest.entries.length) return selectionFail("unavailable");
        const completed = Number(counts.completed), terminal = Number(counts.terminal);
        if (row.completedJobs !== completed || row.terminalJobs !== terminal)
          await tx.dailyRun.update({ where: { id: runId }, data: { completedJobs: completed, terminalJobs: terminal } });
        return freezeEvidence({ total: row.totalJobs, completed, terminal });
      });
    },
  });
}
export type DailySelectionStore = ReturnType<typeof createMysqlDailySelectionStore>;
