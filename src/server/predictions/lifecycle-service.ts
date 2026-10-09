import "server-only";

import { createPredictionWindow, getPublicationDeadline, getReportingDate, isInWindow, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { CatalogMutationCoordinator } from "../football/catalog-mysql-store.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { createCutoffLockingService } from "./cutoff-service.ts";
import { CutoffLockingError } from "./cutoff-contract.ts";
import { createMysqlPredictionHistoryStore } from "./history-mysql-store.ts";
import { historyHash, historyId, historyVersion } from "./history-input.ts";
import { historyTime, storedCycle, storedRevision } from "./history-read.ts";
import { ScheduleLifecycleError, lifecycleFail, type LifecycleAuthority, type LifecycleInput, type LifecycleObservation, type LifecycleReceipt } from "./lifecycle-contract.ts";
import { parseLifecycle, parseLifecycleInput, parseLifecyclePolicy } from "./lifecycle-input.ts";
import { lifecycleContentHash, lifecycleDecision } from "./lifecycle-policy.ts";
import { storedLifecycleReceipt } from "./lifecycle-read.ts";
import { recordPublicationBarrier } from "./publication-barrier.ts";
import { statusShowsPlay } from "./publication-eligibility.ts";
import { storedPublicationBarrier } from "./publication-read.ts";

type Transaction = Prisma.TransactionClient;
type Cutoff = ReturnType<typeof createCutoffLockingService>;
const date = (at: number | null) => at === null ? null : new Date(at);
async function serverNow(tx: Transaction) {
  return historyTime((await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at);
}
function checked(value: unknown, expected: true | undefined) {
  if (value === expected) return;
  void Promise.resolve(value).catch(() => {}); lifecycleFail("unauthorized");
}

/** Shared ingestion boundary for normalized catalog observations and future polling.
 * External verification completes before entry. All effects use the same fixture lock. */
export function createScheduleLifecycleService(options: Readonly<{
  database: DatabaseRuntime; cutoff: Cutoff; policy: unknown; authority: LifecycleAuthority;
}>) {
  const { database, cutoff, authority } = options, policy = parseLifecyclePolicy(options.policy);
  const history = createMysqlPredictionHistoryStore(database);
  function authorize(value: LifecycleObservation) {
    try { checked(authority.authorize(value), undefined); checked(authority.verifyPolicy(policy), true);
      checked(authority.verifyObservation(value), true);
    } catch { return lifecycleFail("unauthorized"); }
  }
  async function ingest(input: LifecycleInput, existingTransaction?: Transaction,
    canonical?: Readonly<{ apply(): Promise<unknown>; retain(): Promise<unknown> }>): Promise<LifecycleReceipt> {
    const observation = parseLifecycleInput(input), id = evidenceFingerprint(observation);
    let failure: unknown;
    try { return await history.withFixtureTransaction(observation.fixtureId, async (writer, tx) => {
      try {
        authorize(observation);
        const replay = await storedLifecycleReceipt(tx, id);
        if (replay) { await canonical?.retain(); return replay; }
        const now = await serverNow(tx);
        if (observation.retrievedAt > now) return lifecycleFail("invalid-request");
        const fixture = await tx.footballFixture.findUniqueOrThrow({ where: { id: observation.fixtureId }, include: {
          homeTeam: { include: { providers: true } }, awayTeam: { include: { providers: true } },
          season: { include: { competition: { include: { providers: true } } } } } });
        const mapped = (rows: readonly { provider: string; externalId: bigint }[], externalId: number) =>
          rows.some((entry) => entry.provider === "api-football" && entry.externalId === BigInt(externalId));
        if (fixture.provider !== "api-football" || fixture.externalId !== BigInt(observation.externalFixtureId) ||
          !mapped(fixture.homeTeam.providers, observation.homeExternalId) || !mapped(fixture.awayTeam.providers, observation.awayExternalId) ||
          !mapped(fixture.season.competition.providers, observation.competitionExternalId) || fixture.season.year !== observation.season)
          return lifecycleFail("identity-unresolved");
        const target = fixture.activeCycleId === null ? null : { fixtureId: fixture.id, cycleId: fixture.activeCycleId };
        let cycle = target === null ? null : await storedCycle(tx, target.cycleId);
        const state = await tx.fixtureLifecycleState.findUnique({ where: { fixtureId: fixture.id } });
        const barrier = target ? await storedPublicationBarrier(tx, target.cycleId) : null;
        const previousStart = state?.actualStartedAt?.getTime() ?? null;
        const decision = lifecycleDecision(observation, policy, { retrievedAt: state?.retrievedAt.getTime() ?? fixture.retrievedAt.getTime(),
          providerUpdatedAt: state?.providerUpdatedAt?.getTime() ?? fixture.providerUpdatedAt?.getTime() ?? null,
          contentHash: state?.contentHash ?? null, status: fixture.status, kickoffAt: fixture.kickoff?.getTime() ?? null,
          hasPlayed: previousStart !== null || barrier !== null });
        const accepted = decision.outcome === "accepted" || decision.outcome === "unchanged";
        const provenPlay = statusShowsPlay(observation.status) && policy.mappings.some((entry) =>
          entry.providerStatus === observation.providerStatus && entry.status === observation.status);
        const start = observation.actualStartedAt ?? (provenPlay ? observation.retrievedAt : null);
        const earlierStart = start !== null && (previousStart === null || start < previousStart);
        const actualStartedAt = earlierStart ? start : previousStart;
        const issue = decision.outcome === "conflict" ? decision.reason : accepted ? null : state?.issue ?? null;
        let material = earlierStart || issue !== (state?.issue ?? null);
        if (accepted) {
          const kickoff = observation.kickoffAt ?? fixture.kickoff?.getTime() ?? null;
          const score = observation.regulationScore?.verified ? observation.regulationScore : null;
          const keepScore = fixture.status === observation.status && fixture.providerStatus === observation.providerStatus;
          const data = { kickoff: date(kickoff), eatDate: kickoff === null ? null : new Date(`${getReportingDate(utcInstantFromEpochMilliseconds(kickoff))}T00:00:00Z`),
            status: observation.status, providerStatus: observation.providerStatus, elapsedMinutes: observation.elapsedMinutes,
            regulationHome: score?.home ?? (keepScore ? fixture.regulationHome : null),
            regulationAway: score?.away ?? (keepScore ? fixture.regulationAway : null) };
          const visibleChanged = Object.entries(data).some(([key, value]) => {
            const previous = fixture[key as keyof typeof data];
            return value instanceof Date && previous instanceof Date ? value.getTime() !== previous.getTime() : value !== previous;
          });
          material ||= visibleChanged;
          if (canonical) await canonical.apply();
          else await tx.footballFixture.update({ where: { id: fixture.id }, data: { ...data,
            retrievedAt: new Date(observation.retrievedAt), providerUpdatedAt: date(observation.providerUpdatedAt) ?? fixture.providerUpdatedAt,
            regulationEvidenceRef: score ? observation.evidenceRef : keepScore ? fixture.regulationEvidenceRef : null,
            regulationVerifiedAt: score ? new Date(observation.retrievedAt) : keepScore ? fixture.regulationVerifiedAt : null,
            ...(visibleChanged ? { dataVersion: { increment: 1 } } : {}) } });
          if (cycle && observation.kickoffAt !== null && (cycle.kickoffAt !== observation.kickoffAt || earlierStart)) {
            cycle = await writer.changeCycle({ actor: observation.actor, reason: earlierStart ? "actual-start-observation" : "kickoff-adjustment",
              evidenceRef: observation.evidenceRef, cycleId: cycle.id, expectedVersion: cycle.version,
              eventKey: evidenceFingerprint({ id, kind: "schedule" }), at: now, next: { state: cycle.state,
                currentSetId: cycle.currentSetId, lockedSetId: cycle.lockedSetId, closedAt: cycle.closedAt,
                lockedAt: cycle.lockedAt, voidedAt: cycle.voidedAt, voidReason: cycle.voidReason },
              schedule: { kickoffAt: observation.kickoffAt, providerObservedAt: observation.providerUpdatedAt,
                actualStartedAt: actualStartedAt === null ? null : utcInstantFromEpochMilliseconds(actualStartedAt) } });
            material = true;
          }
        } else await canonical?.retain();
        // Attributable actual-start proof remains a safety bound even when an
        // older observation cannot replace newer status/kickoff/result fields.
        if (cycle && target && earlierStart) {
          await recordPublicationBarrier(tx, { provider: "api-football", fixtureId: fixture.id, cycleId: cycle.id,
            externalFixtureId: observation.externalFixtureId, kickoffAt: cycle.kickoffAt,
            status: observation.status, retrievedAt: observation.retrievedAt, providerUpdatedAt: observation.providerUpdatedAt,
            actualStartedAt: utcInstantFromEpochMilliseconds(start!), evidenceRef: observation.evidenceRef }, now);
        }
        if (cycle && target && cycle.state !== "void") {
          let voidReason: string | null = accepted && observation.status === "postponed" ? "formal-postponement"
            : accepted && ["canceled", "abandoned", "awarded"].includes(observation.status) ? `fixture-${observation.status}` : null;
          if (!voidReason && cycle.state === "closed" && cycle.lockedSetId) {
            const locked = await storedRevision(tx, cycle.lockedSetId);
            if (!locked) return lifecycleFail("unavailable");
            const cutoffAt = accepted && observation.kickoffAt !== null ? getPublicationDeadline(observation.kickoffAt) : cycle.cutoffAt;
            if (locked.publishedAt >= Math.min(cutoffAt, actualStartedAt ?? Infinity)) voidReason = "locked-cutoff-invalidated";
          }
          if (voidReason) {
            await cutoff.voidCycle({ ...target, actor: observation.actor, reason: voidReason, evidenceRef: observation.evidenceRef }, tx);
            material = true;
          } else if (cycle.state === "open") {
            // close() reconstructs every earlier deadline before a later delay.
            try { await cutoff.close(target, undefined, undefined, tx); material = true; }
            catch (error) { if (!(error instanceof CutoffLockingError && error.reason === "not-due")) throw error; }
            cycle = await storedCycle(tx, cycle.id);
            if (cycle?.state === "open" && accepted) await cutoff.scheduleCycle(target, undefined, tx);
          }
        }
        cycle = target ? await storedCycle(tx, target.cycleId) : null;
        // This is a handoff only. Daily selection creates the next ordinal and
        // consumes it after its new immutable manifest has been prepared.
        if (cycle?.state === "void" && cycle.voidReason === "formal-postponement" && accepted &&
          observation.status === "scheduled" && observation.kickoffAt !== null) {
          const previous = await tx.selectionCycleEligibility.findUnique({ where: { previousCycleId: cycle.id } });
          if (previous?.consumedRunId == null && (!previous || previous.previousVersion !== cycle.version ||
            previous.kickoffAt.getTime() !== observation.kickoffAt)) {
            const data = { previousVersion: cycle.version, kickoffAt: new Date(observation.kickoffAt), state: "void",
              actor: observation.actor, evidenceRef: observation.evidenceRef, recordedAt: new Date(now), eligibleAfter: new Date(now) };
            if (previous) await tx.selectionCycleEligibility.update({ where: { id: previous.id }, data });
            else await tx.selectionCycleEligibility.create({ data: { id: evidenceFingerprint({ cycleId: cycle.id, kind: "lifecycle-reschedule" }),
              fixtureId: fixture.id, previousCycleId: cycle.id, ...data } });
          }
        }
        const cursor = accepted || decision.outcome === "conflict" ? { retrievedAt: new Date(observation.retrievedAt),
          providerUpdatedAt: date(observation.providerUpdatedAt) ?? state?.providerUpdatedAt ?? fixture.providerUpdatedAt,
          contentHash: lifecycleContentHash(observation) } : { retrievedAt: state?.retrievedAt ?? fixture.retrievedAt,
          providerUpdatedAt: state?.providerUpdatedAt ?? fixture.providerUpdatedAt, contentHash: state?.contentHash ?? null };
        const stateData = { ...cursor, actualStartedAt: date(actualStartedAt), issue };
        await tx.fixtureLifecycleState.upsert({ where: { fixtureId: fixture.id }, create: { fixtureId: fixture.id, ...stateData }, update: stateData });
        // Guarantee a distinct cursor after safety/issue changes even when no
        // canonical fields or cycle references needed to move.
        let version = (await tx.footballFixture.findUniqueOrThrow({ where: { id: fixture.id }, select: { dataVersion: true } })).dataVersion;
        if (material && version === fixture.dataVersion) {
          version = (await tx.footballFixture.update({ where: { id: fixture.id }, data: { dataVersion: { increment: 1 } }, select: { dataVersion: true } })).dataVersion;
        }
        if (material && await tx.predictionChangeEvent.findUnique({ where: { fixtureId_version: { fixtureId: fixture.id, version } } }))
          version = (await tx.footballFixture.update({ where: { id: fixture.id }, data: { dataVersion: { increment: 1 } }, select: { dataVersion: true } })).dataVersion;
        const receipt: LifecycleReceipt = freezeEvidence({ id, fixtureId: fixture.id, cycleId: target?.cycleId ?? null,
          fixtureVersion: version, at: now, outcome: decision.outcome, reason: decision.reason, policyHash: evidenceFingerprint(policy), observation });
        const payload = evidenceSerialize(receipt);
        await tx.$executeRaw`INSERT INTO FixtureLifecycleObservation
          (id, fixtureId, cycleId, fixtureVersion, at, retrievedAt, outcome, reason, integrity, receiptJson)
          VALUES (${id}, ${fixture.id}, ${target?.cycleId ?? null}, ${version}, ${new Date(now)}, ${new Date(observation.retrievedAt)},
            ${receipt.outcome}, ${receipt.reason}, SHA2(CAST(CAST(${payload} AS JSON) AS CHAR), 256), CAST(${payload} AS JSON))`;
        if (material) await tx.predictionChangeEvent.create({ data: { fixtureId: fixture.id, version, lifecycleId: id,
          kind: issue ? "lifecycle-conflict" : "schedule-lifecycle", at: new Date(now) } });
        authorize(observation);
        return (await storedLifecycleReceipt(tx, id))!;
      } catch (error) { failure = error; throw error; }
    }, existingTransaction); } catch {
      if (failure instanceof ScheduleLifecycleError) throw failure;
      return lifecycleFail("unavailable");
    }
  }
  const coordinateFixtureMutation: CatalogMutationCoordinator = async (mutation) => {
    if (!mutation.before || !mutation.observation) { await mutation.apply(); return; }
    await ingest({ fixtureId: mutation.before.id, fixture: mutation.observation, actualStartedAt: null,
      actor: "catalog-schedule-lifecycle", evidenceRef: mutation.evidenceRef! }, mutation.transaction, mutation);
  };
  return Object.freeze({ observe: (input: LifecycleInput) => ingest(input), coordinateFixtureMutation,
    receipt(id: string) { parseLifecycle(historyHash, id); return database.transaction((tx) => storedLifecycleReceipt(tx, id)); },
    history(fixtureId: string, limit = 100) {
      parseLifecycle(historyId, fixtureId); parseLifecycle(historyVersion.max(100), limit);
      return database.transaction(async (tx) => {
        const rows = await tx.fixtureLifecycleObservation.findMany({ where: { fixtureId }, orderBy: [{ at: "desc" }, { id: "asc" }], take: limit, select: { id: true } });
        return freezeEvidence(await Promise.all(rows.map(async (row) => (await storedLifecycleReceipt(tx, row.id))!)));
      }, { isolationLevel: "RepeatableRead" });
    },
    refreshEligibility(fixtureId: string) {
      parseLifecycle(historyId, fixtureId);
      return database.transaction(async (tx) => {
        const fixture = await tx.footballFixture.findUniqueOrThrow({ where: { id: fixtureId }, include: { activeCycle: true, lifecycleState: true } });
        const now = await serverNow(tx), kickoff = fixture.kickoff?.getTime();
        const reason = fixture.lifecycleState?.issue ?? (fixture.status !== "scheduled" ? "status-ineligible"
          : fixture.activeCycle?.state !== "open" ? "closed-cycle" : kickoff === undefined ||
            !isInWindow(utcInstantFromEpochMilliseconds(kickoff), createPredictionWindow(getReportingDate(now))) ? "outside-window"
            : fixture.activeCycle.cutoffAt.getTime() <= now ? "cutoff-passed" : null);
        return freezeEvidence({ eligible: reason === null, reason, trackResult: true as const, fixtureVersion: fixture.dataVersion });
      });
    },
  });
}
