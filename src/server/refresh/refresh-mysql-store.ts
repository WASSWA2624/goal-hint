import "server-only";

import { createPredictionWindow, getReportingDate, isInWindow, parseReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence, parseEvidenceContext } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { JobQueueError, type JobLease, type JobQueue, type JobUsage } from "../jobs/job-contract.ts";
import { durableJobId, parseJobEnvelope } from "../jobs/job-input.ts";
import { storedCycle } from "../predictions/history-read.ts";
import { publicationResult, storedRefreshResult } from "../predictions/publication-read.ts";
import type { SelectionManifest } from "../selection/selection-contract.ts";
import { PredictionRefreshError, refreshFail, type RefreshIntent, type RefreshMember, type RefreshOutcome, type RefreshPhase } from "./refresh-contract.ts";
import { parseRefreshPlan, refreshPin } from "./refresh-input.ts";

type Transaction = Prisma.TransactionClient;
type Table = "PredictionRefreshIntent" | "PredictionRefreshStage" | "PredictionRefreshOutcome";
type Stage = Readonly<{ jobId: string; phase: RefreshPhase; kind: "started" | "completed"; attemptId: string; at: number; value: unknown }>;
function decode(value: unknown): unknown {
  return JSON.parse(typeof value === "string" ? value : JSON.stringify(value), (_key, child: unknown) => {
    if (child !== null && typeof child === "object" && "$evidenceInteger" in child) {
      if (Object.keys(child).length !== 1 || typeof child.$evidenceInteger !== "string" || !/^(?:0|[1-9][0-9]{0,37})$/u.test(child.$evidenceInteger)) return refreshFail("unavailable");
      return BigInt(child.$evidenceInteger);
    }
    return child;
  });
}
async function read<Value>(tx: Transaction, table: Table, jobId: string, phase?: RefreshPhase, kind?: Stage["kind"]): Promise<Value | null> {
  // Identifiers are closed internal constants; all external values remain bound parameters.
  const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT body, integrity = SHA2(CAST(body AS CHAR), 256) AS sealed
    FROM ${table} WHERE jobId = ?${phase === undefined ? "" : " AND phase = ? AND kind = ?"}`, jobId, ...(phase === undefined ? [] : [phase, kind]));
  if (!rows[0]) return null;
  if (![true, 1, 1n].includes(rows[0].sealed as boolean | number | bigint)) return refreshFail("unavailable");
  return freezeEvidence(decode(rows[0].body) as Value);
}
async function insert(tx: Transaction, table: Table, jobId: string, body: unknown, phase?: RefreshPhase, kind?: Stage["kind"]) {
  const encoded = evidenceSerialize(body);
  if (Buffer.byteLength(encoded) > 8_388_608) return refreshFail("invalid-request");
  await tx.$executeRawUnsafe(`INSERT INTO ${table} (jobId, ${phase === undefined ? "" : "phase, kind,"} integrity, body)
    VALUES (?, ${phase === undefined ? "" : "?, ?,"} SHA2(CAST(CAST(? AS JSON) AS CHAR), 256), CAST(? AS JSON))`,
    jobId, ...(phase === undefined ? [] : [phase, kind]), encoded, encoded);
}
export function createMysqlRefreshStore(database: DatabaseRuntime, queue: JobQueue) {
  async function transact<Value>(operation: (tx: Transaction) => Promise<Value>): Promise<Value> {
    let failure: unknown;
    try {
      return await database.transaction(async (tx) => {
        try { return await operation(tx); } catch (error) { failure = error; throw error; }
      }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
    } catch {
      if (failure instanceof PredictionRefreshError || failure instanceof JobQueueError) throw failure;
      return refreshFail("unavailable");
    }
  }
  async function member(tx: Transaction, lease: Pick<JobLease, "job" | "jobId">): Promise<RefreshMember> {
    const identity = lease.job.envelope.refresh;
    if (!identity) return refreshFail("invalid-request");
    const row = await tx.runFixture.findUnique({ where: { runId_fixtureId_cycleId: identity }, include: { run: { include: { manifest: true } } } });
    if (!row?.run.manifest || row.run.committedAt === null) return refreshFail("invalid-request");
    const manifest = row.run.manifest.manifestJson as unknown as SelectionManifest;
    const window = createPredictionWindow(parseReportingDate(row.run.eatDate.toISOString().slice(0, 10)));
    const entry = manifest.entries.find((item) => item.fixtureId === identity.fixtureId && item.cycleId === identity.cycleId);
    const envelope = parseJobEnvelope(row.envelopeJson);
    if (!entry || row.jobId !== lease.jobId || durableJobId(envelope) !== lease.jobId ||
      evidenceFingerprint(envelope) !== evidenceFingerprint(lease.job.envelope) || evidenceFingerprint(entry.envelope) !== evidenceFingerprint(envelope) ||
      evidenceFingerprint(manifest) !== row.run.manifest.manifestHash || manifest.runId !== row.runId || manifest.sequence !== String(row.run.sequence) ||
      manifest.selectionHash !== row.run.selectionHash || evidenceFingerprint(row.run.selectionJson) !== row.run.selectionHash ||
      manifest.committedAt !== row.run.committedAt.getTime() || manifest.runDate !== window.runDate || manifest.startInclusive !== window.startInclusive ||
      manifest.endExclusive !== window.endExclusive || row.run.windowStart?.getTime() !== window.startInclusive || row.run.windowEnd?.getTime() !== window.endExclusive ||
      entry.rank !== row.rank || entry.kickoffAt !== row.kickoffAt.getTime() || !isInWindow(utcInstantFromEpochMilliseconds(entry.kickoffAt), window))
      return refreshFail("invalid-request");
    const fixture = await tx.footballFixture.findUniqueOrThrow({ where: { id: identity.fixtureId }, include: { homeTeam: { include: { providers: true } }, awayTeam: { include: { providers: true } } } });
    const cycle = await storedCycle(tx, identity.cycleId);
    if (!cycle || fixture.activeCycleId !== cycle.id) return refreshFail("ineligible", "wrong-cycle");
    if (cycle.state !== "open") return refreshFail("ineligible", "closed-cycle");
    if (fixture.status !== "scheduled") return refreshFail("ineligible", "status-ineligible");
    if (fixture.kickoff?.getTime() !== cycle.kickoffAt) return refreshFail("ineligible", "schedule-changed");
    if ((await tx.fixtureLifecycleState.findUnique({ where: { fixtureId: fixture.id } }))?.issue) return refreshFail("ineligible", "lifecycle-conflict");
    const now = utcInstantFromEpochMilliseconds((await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at.getTime());
    if (now >= cycle.cutoffAt) return refreshFail("ineligible", "cutoff-passed");
    if (!isInWindow(cycle.kickoffAt, createPredictionWindow(getReportingDate(now)))) return refreshFail("ineligible", "outside-window");
    const latest = await tx.predictionSet.findFirst({ where: { fixtureId: fixture.id }, orderBy: { runSequence: "desc" }, select: { runSequence: true } });
    if (latest && latest.runSequence >= row.run.sequence) return refreshFail("ineligible", "older-run");
    const external = (team: typeof fixture.homeTeam) => Number(team.providers.find((item) => item.provider === "api-football")?.externalId);
    const context = parseEvidenceContext({ ...identity, fixtureVersion: fixture.dataVersion, provider: "api-football", externalFixtureId: Number(fixture.externalId),
      home: { teamId: fixture.homeTeamId, externalId: external(fixture.homeTeam) }, away: { teamId: fixture.awayTeamId, externalId: external(fixture.awayTeam) },
      kickoffAt: cycle.kickoffAt, analysisAt: now, cutoffAt: now });
    return freezeEvidence({ jobId: lease.jobId, manifest, entry, cycle, context, now });
  }
  return Object.freeze({
    /** Reuse publication eligibility for reviewed queue recovery, without dispatching I/O. */
    recoveryMember: (tx: Transaction, job: JobLease["job"]) => member(tx, { job, jobId: job.id }),
    loadMember: (lease: JobLease) => transact((tx) => member(tx, lease)),
    intent: (jobId: string) => transact(async (tx) => {
      const intent = await read<RefreshIntent>(tx, "PredictionRefreshIntent", jobId);
      if (intent && (intent.member.jobId !== jobId || evidenceFingerprint(parseRefreshPlan(intent.plan, intent.member)) !== evidenceFingerprint(intent.plan) ||
        evidenceFingerprint(refreshPin(intent.member, intent.plan)) !== evidenceFingerprint(intent.pin))) return refreshFail("unavailable");
      return intent;
    }),
    saveIntent: (lease: JobLease, intent: RefreshIntent) => transact(async (tx) => {
      await queue.assertOwned(tx, lease);
      const known = await read<RefreshIntent>(tx, "PredictionRefreshIntent", lease.jobId);
      if (known) return known;
      await member(tx, lease);
      if (intent.member.jobId !== lease.jobId) return refreshFail("invalid-request");
      await insert(tx, "PredictionRefreshIntent", lease.jobId, intent); return intent;
    }),
    stage: (jobId: string, phase: RefreshPhase, kind: Stage["kind"]) => transact(async (tx) => {
      const value = await read<Stage>(tx, "PredictionRefreshStage", jobId, phase, kind);
      if (value && (value.jobId !== jobId || value.phase !== phase || value.kind !== kind)) return refreshFail("unavailable");
      return value;
    }),
    start: (lease: JobLease, phase: RefreshPhase) => transact(async (tx) => {
      const at = await queue.assertOwned(tx, lease);
      if (await read(tx, "PredictionRefreshStage", lease.jobId, phase, "started")) return false;
      await insert(tx, "PredictionRefreshStage", lease.jobId, { jobId: lease.jobId, phase, kind: "started", attemptId: lease.attemptId, at, value: null }, phase, "started");
      return true;
    }),
    complete: (lease: JobLease, phase: RefreshPhase, value: unknown, usage: readonly JobUsage[] = []) => transact(async (tx) => {
      const at = await queue.assertOwned(tx, lease);
      const known = await read<Stage>(tx, "PredictionRefreshStage", lease.jobId, phase, "completed");
      if (known) { if (evidenceFingerprint(known.value) !== evidenceFingerprint(value)) return refreshFail("invalid-request"); return; }
      if (!await read(tx, "PredictionRefreshStage", lease.jobId, phase, "started")) return refreshFail("invalid-request");
      for (const item of usage) await queue.recordUsageInTransaction(tx, lease, item);
      await insert(tx, "PredictionRefreshStage", lease.jobId, { jobId: lease.jobId, phase, kind: "completed", attemptId: lease.attemptId, at, value }, phase, "completed");
    }),
    outcome: (jobId: string) => transact((tx) => read<RefreshOutcome>(tx, "PredictionRefreshOutcome", jobId)),
    finish: (lease: JobLease, value: RefreshOutcome) => transact(async (tx) => {
      await queue.assertOwned(tx, lease);
      const known = await read<RefreshOutcome>(tx, "PredictionRefreshOutcome", lease.jobId);
      if (known) return known;
      if (value.jobId !== lease.jobId || evidenceFingerprint(lease.job.envelope.refresh) !== evidenceFingerprint({ runId: value.runId, fixtureId: value.fixtureId, cycleId: value.cycleId })) return refreshFail("invalid-request");
      await insert(tx, "PredictionRefreshOutcome", lease.jobId, value); return value;
    }),
    publication: (jobId: string) => transact(async (tx) => {
      const row = await tx.predictionRefreshResult.findFirst({ where: { jobId }, orderBy: [{ outcome: "asc" }, { at: "desc" }], select: { id: true } });
      return row ? publicationResult(tx, (await storedRefreshResult(tx, row.id))!) : null;
    }),
    unrecordedTerminal: (runId: string) => transact(async (tx) => (await tx.runFixture.findMany({ where: { runId,
      job: { state: { in: ["succeeded", "failed", "expired"] }, refreshOutcome: null } }, select: { jobId: true } })).flatMap((row) => row.jobId ? [row.jobId] : [])),
    async reconcileTerminal(runId: string, summaries: ReadonlyMap<string, RefreshOutcome["costs"]>) {
      // Terminal jobs cannot dispatch again. Repair missing receipts after a process
      // dies between publication/queue completion/progress, including pre-claim expiry.
      return transact(async (tx) => {
        await tx.$queryRaw`SELECT id FROM DailyRun WHERE id = ${runId} FOR UPDATE`;
        const entries = await tx.runFixture.findMany({ where: { runId }, include: { job: true } });
        for (const entry of entries) {
          const job = entry.job;
          if (!job || !["succeeded", "failed", "expired"].includes(job.state) || await read(tx, "PredictionRefreshOutcome", job.id)) continue;
          const result = await tx.predictionRefreshResult.findFirst({ where: { jobId: job.id }, orderBy: [{ outcome: "asc" }, { at: "desc" }], select: { id: true } });
          const published = result ? await storedRefreshResult(tx, result.id) : null;
          const value: RefreshOutcome = { jobId: job.id, runId, fixtureId: entry.fixtureId, cycleId: entry.cycleId,
            at: job.finishedAt!.getTime(), outcome: published?.outcome ?? (job.state === "expired" ? "skipped" : "failed"),
            reason: published?.reason ?? job.terminalReason ?? "handler-failed", revisionId: published?.revisionId ?? null,
            publicationId: published?.id ?? null, costs: summaries.get(job.id) ?? { ai: { status: "denied", reason: "service-unavailable" }, research: null }, phases: {} };
          await insert(tx, "PredictionRefreshOutcome", job.id, value);
        }
      });
    },
  });
}
export type RefreshStore = ReturnType<typeof createMysqlRefreshStore>;
