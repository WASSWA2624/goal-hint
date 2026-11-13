import "server-only";

import { randomUUID } from "node:crypto";
import { predictionRunOrder } from "../../domain/prediction-run-order.ts";
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
import { parseCycleSelectionEligibility, parseSelection, parseSelectionPolicy, SELECTION_HOUR_MS } from "./selection-input.ts";
import { createHourlyEvidenceReader } from "./hourly-evidence.ts";
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
    id: true, kickoff: true, status: true, homeTeamId: true, awayTeamId: true, seasonId: true, round: true,
    season: { select: { competitionId: true, competition: { select: {
      providers: { where: { provider: "api-football" }, select: { externalId: true } },
    } } } },
    activeCycle: { select: { id: true, state: true, version: true, kickoffAt: true, cutoffAt: true, currentSetId: true } },
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
export function createMysqlDailySelectionStore(database: DatabaseRuntime, queue: JobQueue, options: Readonly<{
  hourly?: { localEvidence: boolean; scheduleCutoff?(entry: { fixtureId: string; cycleId: string }, tx: Transaction): Promise<unknown> };
}> = {}) {
  const history = createMysqlPredictionHistoryStore(database);
  const emptyEvidenceHash = evidenceFingerprint(null);
  type MaterialInput = { scheduleHash: string; evidenceHash: string; evidenceReady: boolean };
  type StoredMaterialInput = MaterialInput & { cycleId: string; runId: string };
  async function recordInput(tx: Transaction, fixtureId: string, value: StoredMaterialInput) {
    // Update only mutable columns, including on MariaDB's stricter duplicate-key path.
    const changed = await tx.selectionFixtureInput.updateMany({ where: { fixtureId }, data: value });
    if (changed.count === 0) await tx.selectionFixtureInput.create({ data: { fixtureId, ...value } });
  }
  async function transact<Result>(operation: (tx: Transaction) => Promise<Result>): Promise<Result> {
    let failure: DailySelectionError | undefined;
    try { return await database.transaction(async (tx) => {
      try { return await operation(tx); } catch (error) { if (error instanceof DailySelectionError) failure = error; throw error; }
    }, { isolationLevel: "ReadCommitted", timeout: 60_000 }); }
    catch { if (failure) throw failure; return selectionFail("unavailable"); }
  }
  async function coverage(tx: Transaction, runId: string, runDate: string, days: PredictionWindowDays, hourly: boolean): Promise<SelectionCoverage[]> {
    const attempts = await tx.dailyRunImport.findMany({ where: { runId }, orderBy: { attempt: "desc" } });
    const result: SelectionCoverage[] = [];
    for (let offset = 0; offset < days; offset++) {
      const date = addReportingDays(parseReportingDate(runDate), offset);
      const latest = attempts.find((row) => row.eatDate.toISOString().slice(0, 10) === date);
      const imported = latest ? await tx.footballImport.findUnique({ where: { id: latest.id } }) : null;
      const expected = { kind: "fixtures", query: { date } };
      if (imported && evidenceFingerprint(imported.selection) !== evidenceFingerprint(expected)) return selectionFail("unavailable");
      const retained = hourly ? [] : await tx.footballFixture.findMany({ where: { provider: "api-football", eatDate: new Date(`${date}T00:00:00Z`) }, select: { id: true } });
      const missing = imported ? strings(imported.missingCoverage) : ["date-not-retrieved"];
      result.push({ date, status: imported?.status ?? "failed", importId: imported?.id ?? null,
        fixtureIds: [...new Set([...(imported && (!hourly || imported.status === "complete") ? strings(imported.fixtureIds) : []), ...retained.map((row) => row.id)])].sort(),
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
          predictionWindowDays(selectionRunWindow(row)), row.slotHour > 0) });
    });
  }
  return Object.freeze({
    inspect,
    async acquire(runDate: string, policy: SelectionPolicy, ownerId: string, slotHour = 0): Promise<SelectionLease | null> {
      parseSelection(jobHash, ownerId);
      const window = createPredictionWindow(parseReportingDate(runDate), policy.windowDays ?? 7);
      if (slotHour !== 0 && !options.hourly) return selectionFail("unauthorized");
      const run = await history.createRun(runDate, window.startInclusive + slotHour * SELECTION_HOUR_MS, slotHour);
      return transact(async (tx) => {
        const row = await lockRun(tx, run.id), now = await serverNow(tx), hash = evidenceFingerprint(policy);
        if (row.selectionHash !== null && evidenceFingerprint(row.selectionJson) !== row.selectionHash) return selectionFail("unavailable");
        if (row.selectionHash !== null && row.selectionHash !== hash && row.committedAt === null) return selectionFail("conflicting-request");
        if (row.selectionHash !== null) selectionRunWindow(row);
        if (row.leaseExpiresAt !== null && row.leaseExpiresAt.getTime() > now) return null;
        if (slotHour > 0 && row.committedAt === null && now >= window.startInclusive + (slotHour + 1) * SELECTION_HOUR_MS)
          return selectionFail("lost-lease");
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
        if (row.slotHour > 0 && (previous?.attempt ?? 0) >= 2) return null;
        const deadlineAt = row.slotHour === 0 ? now + deadlineMs
          : Math.min(now + deadlineMs, window.startInclusive + (row.slotHour + 1) * SELECTION_HOUR_MS);
        if (deadlineAt <= now) return null;
        const request = parseCatalogImportRequest({ id, selection: { kind: "fixtures", query: { date } },
          retentionEvidenceRef: policy.retentionEvidenceRef, bounds: { ...bounds, deadlineAt } });
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
    async commit(lease: SelectionLease, policy: SelectionPolicy, degradedAction: DegradedSelectionAction | null, confirmed: readonly string[] = []): Promise<SelectionManifest> {
      const evidenceByFixture = new Map<string, { identity: string; fingerprint: string; evidenceReady: boolean }>();
      if (options.hourly?.localEvidence) {
        const prepared = await database.query(async (tx) => {
          const run = await tx.dailyRun.findUniqueOrThrow({ where: { id: lease.runId } });
          if (run.committedAt !== null) return null;
          const at = await serverNow(tx);
          const window = selectionRunWindow(run);
          const dates = await coverage(tx, run.id, window.runDate, policy.windowDays ?? 7, run.slotHour > 0);
          if (degradedAction === null && dates.some((date) => date.status !== "complete")) return null;
          const ids = [...new Set([...dates.flatMap((date) => date.fixtureIds), ...confirmed])];
          if (ids.length > policy.maxFixtures) return null;
          const candidates = await tx.footballFixture.findMany({ where: { id: { in: ids }, status: "scheduled",
            kickoff: { gt: new Date(at + (policy.refreshLeadMs ?? 0)) },
            season: { competition: { providers: { some: { provider: "api-football", externalId: { in: policy.competitionIds.map(BigInt) } } } } } },
          select: { id: true, kickoff: true, homeTeamId: true, awayTeamId: true, season: { select: { competitionId: true } } } });
          return { at, candidates };
        }).catch(() => selectionFail("unavailable"));
        // Prepare evidence before holding the catalog lock used by live score and lifecycle writes.
        if (prepared) {
          const { candidates, at } = prepared;
          const reader = createHourlyEvidenceReader({ $queryRaw: (...args) => database.query((tx) => tx.$queryRaw(...args)) }, at);
          const concurrency = 2;
          for (let offset = 0; offset < candidates.length; offset += concurrency) {
            await Promise.all(candidates.slice(offset, offset + concurrency).map(async (fixture) => {
              if (fixture.kickoff === null) return;
              const target = { id: fixture.id, competitionId: fixture.season.competitionId,
                homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId, kickoffAt: fixture.kickoff.getTime() };
              const evidence = await reader(target).catch(() => null);
              if (evidence) evidenceByFixture.set(fixture.id, { identity: evidenceFingerprint(target), ...evidence });
            }));
          }
        }
      }
      return transact(async (tx) => {
        const { row } = await assertOwned(tx, lease), known = await storedSelectionManifest(tx, row);
        if (known) return known;
        if (row.selectionHash !== evidenceFingerprint(policy)) return selectionFail("conflicting-request");
        const runDate = row.eatDate.toISOString().slice(0, 10), window = selectionRunWindow(row);
        const hourly = row.slotHour > 0;
        const dates = await coverage(tx, row.id, runDate, policy.windowDays ?? 7, hourly), partial = dates.some((date) => date.status !== "complete");
        if (partial && degradedAction === null) return selectionFail("incomplete-import");
        const ids = [...new Set([...dates.flatMap((date) => date.fixtureIds), ...confirmed])].sort();
        if (ids.length > policy.maxFixtures) return selectionFail("capacity-exceeded");
        const entries: Omit<SelectionEntry, "rank" | "envelope">[] = [], exclusions: { fixtureId: string; reason: string }[] = [];
        const capacity = hourly && policy.refreshCapacity !== undefined
          ? Math.ceil(policy.refreshCapacity / 24) : policy.refreshCapacity;
        const competitions = new Set(policy.competitionIds), initial: CreateCycleInput[] = [];
        const fixtures = await selectionFixtures(tx, ids);
        // Budgeted runs visit nearest kickoffs first so deferral never displaces an earlier match.
        if (capacity !== undefined) fixtures.sort((a, b) => (a.kickoff?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (b.kickoff?.getTime() ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
        const { now: selectedAt } = await assertOwned(tx, lease);
        const inputByFixture = new Map<string, MaterialInput>();
        const cycles = fixtures.flatMap((fixture) => fixture.activeCycle?.state === "open" ? [fixture.activeCycle.id] : []);
        const latest = new Map<string, { cycleId: string; kickoffAt: Date; sequence: bigint; jobState: string | null }>();
        if (hourly) for (let offset = 0; offset < cycles.length; offset += 500) {
          const rows = await tx.$queryRaw<{ cycleId: string; kickoffAt: Date; sequence: bigint; jobState: string | null }[]>(Prisma.sql`
            SELECT r.cycleId, r.kickoffAt, d.sequence, j.state AS jobState FROM RunFixture r
            JOIN DailyRun d ON d.id = r.runId LEFT JOIN DurableJob j ON j.id = r.jobId
            WHERE r.cycleId IN (${Prisma.join(cycles.slice(offset, offset + 500))})
            ORDER BY d.eatDate DESC, d.slotHour DESC`);
          for (const entry of rows) if (!latest.has(entry.cycleId)) latest.set(entry.cycleId, entry);
        }
        const previousInputs = options.hourly && ids.length
          ? await tx.selectionFixtureInput.findMany({ where: { fixtureId: { in: ids } } }) : [];
        const inputs = new Map(previousInputs.map((entry) => [entry.fixtureId, entry]));
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
          const cycle = fixture.activeCycle;
          if (options.hourly) {
            const scheduleHash = evidenceFingerprint({ kickoffAt, homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId,
              seasonId: fixture.seasonId, round: fixture.round });
            const target = { id: fixtureId, competitionId: fixture.season.competitionId,
              homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId, kickoffAt };
            const candidateEvidence = evidenceByFixture.get(fixtureId);
            const evidence = candidateEvidence?.identity === evidenceFingerprint(target) ? candidateEvidence : undefined;
            const previous = inputs.get(fixtureId);
            const retainedEvidence = previous?.cycleId === cycle?.id ? previous : undefined;
            const evidenceReady = evidence?.evidenceReady ?? retainedEvidence?.evidenceReady ?? false;
            const evidenceHash = evidence?.fingerprint ?? retainedEvidence?.evidenceHash ?? emptyEvidenceHash;
            inputByFixture.set(fixtureId, { scheduleHash, evidenceHash, evidenceReady });
            if (hourly && cycle?.state === "open") {
              const lastRun = latest.get(cycle.id);
              if (lastRun && predictionRunOrder(lastRun.sequence) >= predictionRunOrder(row.sequence)) { exclude("newer-run"); continue; }
              const known = previous?.cycleId === cycle.id;
              const scheduleChanged = known ? previous.scheduleHash !== scheduleHash
                : lastRun !== undefined && lastRun.kickoffAt.getTime() !== kickoffAt;
              const pending = lastRun !== undefined && (lastRun.jobState === null || ["pending", "running"].includes(lastRun.jobState));
              const newCandidate = !lastRun && cycle.currentSetId === null;
              const nowReady = evidenceReady && (known ? !previous.evidenceReady : cycle.currentSetId === null);
              const evidenceChanged = evidenceReady && known && previous.evidenceHash !== evidenceHash;
              const becameInsufficient = known && previous.evidenceReady && !evidenceReady && evidence !== undefined;
              if ((!scheduleChanged && (!newCandidate && !nowReady && !evidenceChanged)) ||
                  (pending && lastRun.kickoffAt.getTime() === kickoffAt)) {
                if ((!known || becameInsufficient) && !pending) {
                  await recordInput(tx, fixtureId, { cycleId: cycle.id, runId: row.id, scheduleHash, evidenceHash, evidenceReady });
                }
                exclude(pending ? "refresh-pending" : "inputs-unchanged"); continue;
              }
            }
          }
          if (capacity !== undefined && entries.length + initial.length >= capacity) { exclude("refresh-capacity"); continue; }
          if (!cycle) {
            if (fixture._count.predictionCycles > 0) { exclude("no-active-cycle"); continue; }
            initial.push({ fixtureId, creationKey: evidenceFingerprint({ fixtureId, kind: "initial-selection-cycle" }), kickoffAt,
              openedAt: selectedAt, activate: true, actor: hourly ? "hourly-selection" : "daily-selection",
              reason: hourly ? "Initial hourly fixture selection" : "Initial daily selection", evidenceRef: policy.evidenceRef });
          } else if (cycle.state === "open") {
            if (cycle.kickoffAt.getTime() !== kickoffAt || cycle.cutoffAt.getTime() <= selectedAt) { exclude("cycle-schedule-ineligible"); continue; }
            entries.push({ fixtureId, cycleId: cycle.id, kickoffAt });
          } else {
            const eligible = await tx.selectionCycleEligibility.findUnique({ where: { previousCycleId: cycle.id } });
            if (!eligible || eligible.consumedRunId !== null || eligible.previousVersion !== cycle.version ||
              eligible.eligibleAfter !== null && eligible.eligibleAfter.getTime() >= (hourly ? selectedAt : window.startInclusive) ||
              eligible.kickoffAt.getTime() !== kickoffAt || (eligible.state === "void" ? cycle.state !== "void" : cycle.state !== "closed")) { exclude("closed-cycle"); continue; }
            const next = await history.withFixtureTransaction(fixtureId, (writer) => writer.createCycle({
              fixtureId, creationKey: evidenceFingerprint({ eligibility: eligible.id }), kickoffAt, openedAt: selectedAt,
              activate: true, actor: hourly ? "hourly-selection" : "daily-selection", reason: "Recorded eligible rescheduled cycle", evidenceRef: eligible.evidenceRef,
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
            notBefore: (hourly ? selectedAt : window.startInclusive) + rank, expiresAt: getPublicationDeadline(utcInstantFromEpochMilliseconds(entry.kickoffAt)),
            priority: 255 - Math.min(rank, 255) });
          return { ...entry, rank, envelope };
        });
        for (let offset = 0; offset < selected.length; offset += 200)
          await tx.runFixture.createMany({ data: selected.slice(offset, offset + 200).map((entry) => ({ runId: row.id, fixtureId: entry.fixtureId,
            cycleId: entry.cycleId, rank: entry.rank, kickoffAt: new Date(entry.kickoffAt), envelopeJson: json(entry.envelope) })) });
        for (const entry of selected) {
          const input = inputByFixture.get(entry.fixtureId);
          if (!input) continue;
          const previous = inputs.get(entry.fixtureId);
          if (!hourly && previous && previous.runId !== row.id) {
            const previousRun = await tx.dailyRun.findUniqueOrThrow({ where: { id: previous.runId }, select: { sequence: true } });
            if (predictionRunOrder(previousRun.sequence) > predictionRunOrder(row.sequence)) continue;
          }
          await recordInput(tx, entry.fixtureId, { cycleId: entry.cycleId, runId: row.id, ...input });
        }
        if (hourly) for (const entry of selected) {
          const job = await queue.enqueueInTransaction(tx, entry.envelope);
          await tx.runFixture.update({ where: { runId_fixtureId_cycleId: { runId: row.id, fixtureId: entry.fixtureId, cycleId: entry.cycleId } },
            data: { jobId: job.id, jobState: job.state, terminalReason: job.terminalReason } });
          await options.hourly?.scheduleCutoff?.(entry, tx);
        }
        // Check ownership again after potentially long fixture work; all effects roll back on expiry.
        const { now: committedAt } = await assertOwned(tx, lease);
        if (hourly && committedAt >= window.startInclusive + (row.slotHour + 1) * SELECTION_HOUR_MS) return selectionFail("lost-lease");
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
