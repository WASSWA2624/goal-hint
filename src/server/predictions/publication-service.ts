import "server-only";

import { createPredictionWindow, isInWindow, parseReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { SettlementStatus } from "../../domain/market-settlement.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import { createMysqlEvidenceStore } from "../evidence/evidence-mysql-store.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { JobQueueError, type JobLease, type JobQueue } from "../jobs/job-contract.ts";
import { durableJobId, parseJobEnvelope } from "../jobs/job-input.ts";
import { createMysqlModelVersionStore } from "../predictor/predictor-mysql-store.ts";
import type { SelectionManifest } from "../selection/selection-contract.ts";
import { PredictionHistoryError } from "./history-contract.ts";
import { historyHash, historyId, historyVersion } from "./history-input.ts";
import { createMysqlPredictionHistoryStore } from "./history-mysql-store.ts";
import { historyTime, storedCycle, storedCycleDisplay, storedRevision } from "./history-read.ts";
import { publicationFail, RevisionPublicationError, type PublicationAuthority, type PublicationPolicy,
  type PublicationResult, type PublishRevisionInput, type RefreshPublicationResult } from "./publication-contract.ts";
import { observationShowsPlay, publicationEligibility, publicationSourceIsFresh, revisionEligibleForSchedule, statusShowsPlay } from "./publication-eligibility.ts";
import { parsePublication, parsePublicationPolicy, parsePublishRevision } from "./publication-input.ts";
import { publicationResult, storedPublicationBarrier, storedRefreshResult } from "./publication-read.ts";
import { recordPublicationBarrier } from "./publication-barrier.ts";

type Transaction = Prisma.TransactionClient;
async function serverNow(tx: Transaction) {
  return utcInstantFromEpochMilliseconds((await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at.getTime());
}
function checked(value: unknown, expected: true | undefined) {
  if (value === expected) return;
  void Promise.resolve(value).catch(() => {});
  publicationFail("unauthorized");
}
function authorized(authority: PublicationAuthority, policy: PublicationPolicy, input: PublishRevisionInput, now: ReturnType<typeof utcInstantFromEpochMilliseconds>) {
  try {
    checked(authority.authorize(input), undefined); checked(authority.verifyPolicy(policy), true);
    checked(authority.verifyObservation(input.observation), true); checked(authority.verifyCandidate(input, now), true);
  } catch { return publicationFail("unauthorized"); }
}

/** Only acceptance entry point. Provider/evidence/model I/O completes before
 * entry; the transaction shares catalog/history synchronization with lifecycle writes. */
export function createRevisionPublicationService(options: Readonly<{
  database: DatabaseRuntime; queue: Pick<JobQueue, "assertOwned">; policy: unknown; authority: PublicationAuthority;
}>) {
  const { database, authority, queue } = options, policy = parsePublicationPolicy(options.policy);
  const history = createMysqlPredictionHistoryStore(database), evidence = createMysqlEvidenceStore(database), models = createMysqlModelVersionStore(database);

  async function publish(value: PublishRevisionInput, lease: JobLease): Promise<PublicationResult> {
    const input = parsePublishRevision(value), candidate = input.candidate, context = candidate.context.context;
    const identity = { runId: context.runId!, fixtureId: context.fixtureId, cycleId: context.cycleId! };
    const id = evidenceFingerprint({ ...identity, attemptKey: input.attemptKey }), requestHash = evidenceFingerprint(input);
    let failure: unknown;
    try {
      return await history.withFixtureTransaction(context.fixtureId, async (writer, tx) => {
        try {
          // Accepted jobs are final. Recover the original receipt even after closure,
          // lease loss, changed composition/pin or an ambiguous commit response.
          const accepted = await tx.predictionRefreshResult.findFirst({ where: { ...identity, outcome: "published" }, select: { id: true } });
          if (accepted) return publicationResult(tx, (await storedRefreshResult(tx, accepted.id))!);
          const replay = await storedRefreshResult(tx, id);
          if (replay) {
            if (replay.requestHash !== requestHash) return publicationFail("conflicting-request");
            return publicationResult(tx, replay);
          }
          let now = await serverNow(tx); authorized(authority, policy, input, now);
          const member = await tx.runFixture.findUnique({ where: { runId_fixtureId_cycleId: identity }, include: { run: { include: { manifest: true } } } });
          if (!member || !member.run.manifest || member.run.committedAt === null) return publicationFail("invalid-request");
          const run = member.run, sealed = run.manifest!, manifest = sealed.manifestJson as unknown as SelectionManifest;
          const window = createPredictionWindow(parseReportingDate(run.eatDate.toISOString().slice(0, 10)));
          const entry = manifest.entries.find((item) => item.fixtureId === identity.fixtureId && item.cycleId === identity.cycleId);
          if (evidenceFingerprint(manifest) !== sealed.manifestHash || manifest.runId !== run.id || manifest.sequence !== String(run.sequence) ||
            manifest.selectionHash !== run.selectionHash || evidenceFingerprint(run.selectionJson) !== run.selectionHash ||
            manifest.runDate !== window.runDate || manifest.startInclusive !== window.startInclusive || manifest.endExclusive !== window.endExclusive ||
            run.windowStart?.getTime() !== window.startInclusive || run.windowEnd?.getTime() !== window.endExclusive ||
            manifest.committedAt !== run.committedAt!.getTime() || !entry || entry.kickoffAt !== member.kickoffAt.getTime() ||
            entry.rank !== member.rank || evidenceFingerprint(entry.envelope) !== evidenceFingerprint(member.envelopeJson) ||
            !isInWindow(utcInstantFromEpochMilliseconds(entry.kickoffAt), window)) return publicationFail("invalid-request");
          const envelope = parseJobEnvelope(member.envelopeJson), jobId = durableJobId(envelope);
          if (member.jobId !== jobId || candidate.context.jobId !== jobId || lease.jobId !== jobId ||
            evidenceFingerprint(envelope.refresh) !== evidenceFingerprint(identity)) return publicationFail("invalid-request");
          const fixture = await tx.footballFixture.findUniqueOrThrow({ where: { id: context.fixtureId } });
          const cycle = await storedCycle(tx, identity.cycleId);
          if (!cycle || cycle.fixtureId !== fixture.id || fixture.externalId !== BigInt(context.externalFixtureId) ||
            fixture.homeTeamId !== context.home.teamId || fixture.awayTeamId !== context.away.teamId ||
            context.fixtureVersion > fixture.dataVersion || context.analysisAt < run.committedAt!.getTime() ||
            context.analysisAt < cycle.openedAt) return publicationFail("invalid-request");
          const previous = cycle.currentSetId === null ? null : await storedRevision(tx, cycle.currentSetId);
          let barrier = await storedPublicationBarrier(tx, cycle.id);
          // A trusted observation permanently closes publication, even if stale.
          // Final closure/locked-set selection remains the responsibility of 023.
          const play = input.observation.retrievedAt <= now && observationShowsPlay(input.observation) ? input.observation
            : statusShowsPlay(fixture.status) && fixture.retrievedAt.getTime() <= now ? { ...input.observation,
              status: fixture.status as SettlementStatus, retrievedAt: utcInstantFromEpochMilliseconds(fixture.retrievedAt.getTime()),
              providerUpdatedAt: fixture.providerUpdatedAt === null ? null : historyTime(fixture.providerUpdatedAt), actualStartedAt: null,
              evidenceRef: `canonical-fixture:${fixture.id}:version:${fixture.dataVersion}` } : null;
          if (!barrier && fixture.activeCycleId === cycle.id && cycle.state === "open" && play !== null) {
            barrier = await recordPublicationBarrier(tx, play, now);
          }
          let reason = publicationEligibility({ now, cycle, activeCycleId: fixture.activeCycleId,
            kickoffAt: fixture.kickoff === null ? null : utcInstantFromEpochMilliseconds(fixture.kickoff.getTime()), status: fixture.status,
            scheduleVersion: input.scheduleVersion, candidateKickoffAt: context.kickoffAt, originalWindow: window,
            observation: input.observation, maxObservationAgeMs: policy.maxObservationAgeMs,
            earlierCloseAt: barrier?.closedAt ?? null });
          // Do not let an older observation override newer canonical status/kickoff evidence.
          if (reason === null && input.observation.retrievedAt < fixture.retrievedAt.getTime()) reason = "stale-observation";
          const latest = await tx.predictionSet.findFirst({ where: { fixtureId: fixture.id }, orderBy: { fixtureRevision: "desc" } });
          if (reason === null && latest && latest.runSequence >= run.sequence) reason = "older-run";
          let revision = null, outcome: RefreshPublicationResult["outcome"] = "skipped";
          if (reason === null) {
            await queue.assertOwned(tx, lease);
            const snapshot = await evidence.findInTransaction(tx, input.evidenceSnapshotId);
            if (!snapshot || snapshot.snapshot.hash !== candidate.context.evidenceHash ||
              evidenceFingerprint(snapshot.snapshot.context) !== evidenceFingerprint(context)) return publicationFail("invalid-request");
            const model = candidate.context.pin === null ? null : await models.findInTransaction(tx, candidate.context.pin.modelVersionId);
            if (candidate.context.pin !== null && model === null) return publicationFail("invalid-request");
            for (const [family, item] of Object.entries(candidate.markets)) if (item.available) {
              if (item.provenance.kind === "ai" ? candidate.audit.aiStatus !== "candidate"
                : candidate.audit.providerStatus !== "candidate" || !item.provenance.source.supportEvidenceRefs[
                  (family === "double-chance" ? "match-result" : family) as "match-result" | "total-goals" | "both-teams-to-score"])
                return publicationFail("invalid-request");
            }
            for (const item of Object.values(candidate.markets)) if (item.available && item.provenance.kind === "ai") {
              const source = item.provenance;
              if (!model || !snapshot.snapshot.coverage.sufficient || item.timestamps.generatedAt !== null && item.timestamps.generatedAt < context.analysisAt ||
                evidenceFingerprint(source.pin) !== evidenceFingerprint(candidate.context.pin) ||
                evidenceFingerprint(source.outputTiming) !== evidenceFingerprint(model.outputTiming) ||
                source.calibration.version !== model.calibration.version || source.evaluation.version !== model.evaluation.version ||
                evidenceFingerprint(source.evidence) !== evidenceFingerprint({ policyVersion: snapshot.snapshot.policy.version,
                  coverage: snapshot.snapshot.coverage, missingness: snapshot.snapshot.missingness }) || source.sources.some((attribution) => {
                  const original = snapshot.snapshot.sources.find((entry) => entry.id === attribution.sourceId);
                  return !original || evidenceFingerprint(attribution) !== evidenceFingerprint({ sourceId: original.id,
                    publisher: original.publisher, title: original.title, sourceUrl: original.sourceUrl, version: original.version,
                    publishedAt: original.publishedAt, retrievedAt: original.retrievedAt, providerUpdatedAt: original.providerUpdatedAt });
                })) return publicationFail("invalid-request");
            }
            now = await serverNow(tx); authorized(authority, policy, input, now);
            const selected = Object.values(candidate.markets).filter((item) => item.available);
            if (input.generationCompletedAt > now) return publicationFail("invalid-request");
            if (now >= cycle.cutoffAt || now - input.observation.retrievedAt > policy.maxObservationAgeMs) return publicationFail("eligibility-expired");
            if (selected.some((item) => !publicationSourceIsFresh(item.timestamps, policy.sources[item.market.source], now) ||
              item.provenance.kind === "ai" && !publicationSourceIsFresh(item.timestamps, item.provenance.outputTiming, now))) reason = "stale-source";
            else if (selected.length === 0) {
              reason = "no-valid-family";
              if (previous && revisionEligibleForSchedule(previous, cycle, barrier?.closedAt ?? null)) {
                revision = previous; outcome = "retained-previous";
              } else outcome = "unavailable";
            } else {
              const actor = { actor: "revision-publication", reason: "Eligible complete snapshot accepted", evidenceRef: policy.evidenceRef };
              revision = await writer.appendRevision({ ...actor, candidate, evidenceSnapshotId: input.evidenceSnapshotId,
                scheduleVersion: input.scheduleVersion, generationCompletedAt: input.generationCompletedAt, publishedAt: now });
              const recorded = (await storedCycle(tx, cycle.id))!;
              await writer.changeCycle({ ...actor, cycleId: cycle.id, expectedVersion: recorded.version,
                eventKey: evidenceFingerprint({ kind: "revision-published", ...identity }), at: now,
                next: { state: "open", currentSetId: revision.id, lockedSetId: null, closedAt: null, lockedAt: null, voidedAt: null, voidReason: null } });
              outcome = "published"; reason = "accepted";
            }
          }
          // History mutations already advance the fixture version. Operational
          // refresh outcomes also change its public freshness/delay projection.
          if (outcome !== "published") await tx.footballFixture.update({ where: { id: fixture.id }, data: { dataVersion: { increment: 1 } } });
          const version = (await tx.footballFixture.findUniqueOrThrow({ where: { id: fixture.id }, select: { dataVersion: true } })).dataVersion;
          const refresh: RefreshPublicationResult = freezeEvidence({ id, requestHash, attemptKey: input.attemptKey, ...identity,
            runSequence: run.sequence, jobId, fixtureVersion: version, outcome, reason: reason!, revisionId: revision?.id ?? null, at: now,
            evidenceSnapshotId: input.evidenceSnapshotId, candidateHash: evidenceFingerprint(candidate), generationCompletedAt: input.generationCompletedAt,
            policyHash: evidenceFingerprint(policy), observation: input.observation });
          const payload = evidenceSerialize(refresh);
          await tx.$executeRaw`INSERT INTO PredictionRefreshResult
            (id, requestHash, attemptKey, runId, runSequence, fixtureId, cycleId, jobId, fixtureVersion, outcome, reason, revisionId, at, integrity, resultJson)
            VALUES (${id}, ${requestHash}, ${input.attemptKey}, ${run.id}, ${run.sequence}, ${fixture.id}, ${cycle.id}, ${jobId}, ${version},
              ${outcome}, ${reason}, ${revision?.id ?? null}, ${new Date(now)}, SHA2(CAST(CAST(${payload} AS JSON) AS CHAR), 256), CAST(${payload} AS JSON))`;
          await tx.predictionChangeEvent.create({ data: { fixtureId: fixture.id, version, resultId: id,
            kind: outcome === "published" ? "revision-published" : reason === "early-play" ? "eligibility-closed" : "refresh-result", at: new Date(now) } });
          const result = await publicationResult(tx, refresh);
          if (outcome === "published" || outcome === "retained-previous" || outcome === "unavailable") {
            await queue.assertOwned(tx, lease);
            const finished = await serverNow(tx); authorized(authority, policy, input, finished);
            if (finished < now || finished >= cycle.cutoffAt || finished - input.observation.retrievedAt > policy.maxObservationAgeMs ||
              Object.values(candidate.markets).some((item) => item.available && (!publicationSourceIsFresh(item.timestamps, policy.sources[item.market.source], finished) ||
                item.provenance.kind === "ai" && !publicationSourceIsFresh(item.timestamps, item.provenance.outputTiming, finished)))) return publicationFail("eligibility-expired");
          }
          return result;
        } catch (error) { failure = error; throw error; }
      });
    } catch {
      if (failure instanceof RevisionPublicationError) throw failure;
      if (failure instanceof JobQueueError && failure.reason === "lost-lease") return publicationFail("lost-lease");
      if (failure instanceof PredictionHistoryError && ["invalid-request", "conflicting-request"].includes(failure.reason)) return publicationFail("invalid-request");
      return publicationFail("unavailable");
    }
  }
  async function read<Result>(operation: (tx: Transaction) => Promise<Result>) {
    try { return await database.transaction(operation, { isolationLevel: "RepeatableRead", timeout: 30_000 }); }
    catch { return publicationFail("unavailable"); }
  }
  return Object.freeze({
    publish,
    resultForAttempt(id: string) { parsePublication(historyHash, id);
      return read(async (tx) => { const refresh = await storedRefreshResult(tx, id); return refresh === null ? null : publicationResult(tx, refresh); }); },
    changesForFixture(fixtureId: string, { afterVersion = 0n, limit = 100 }: Readonly<{ afterVersion?: bigint; limit?: number }> = {}) {
      parsePublication(historyId, fixtureId); parsePublication(historyVersion.max(100), limit);
      if (typeof afterVersion !== "bigint" || afterVersion < 0n || afterVersion > 18_446_744_073_709_551_615n) return publicationFail("invalid-request");
      return read(async (tx) => freezeEvidence((await tx.predictionChangeEvent.findMany({ where: { fixtureId, version: { gt: afterVersion } },
        orderBy: { version: "asc" }, take: limit })).map((event) => ({ ...event, at: historyTime(event.at) }))));
    },
    displayForFixture(fixtureId: string) {
      parsePublication(historyId, fixtureId);
      return read(async (tx) => {
        const fixture = await tx.footballFixture.findUnique({ where: { id: fixtureId } });
        if (!fixture || fixture.activeCycleId === null) return null;
        const display = await storedCycleDisplay(tx, fixture.activeCycleId);
        if (!display) return publicationFail("unavailable");
        const { cycle, revision } = display;
        const latest = await tx.predictionRefreshResult.findFirst({ where: { fixtureId, cycleId: cycle.id },
          orderBy: [{ runSequence: "desc" }, { fixtureVersion: "desc" }], select: { id: true } });
        const refresh = latest === null ? null : await storedRefreshResult(tx, latest.id);
        return freezeEvidence({ fixtureVersion: fixture.dataVersion, ...display, refresh,
          updateDelayed: cycle.state === "open" && refresh?.outcome === "retained-previous" && refresh.revisionId === revision?.id });
      });
    },
  });
}
