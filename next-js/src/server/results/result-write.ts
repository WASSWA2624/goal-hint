import "server-only";

import { isPlayedFinalStatus, type SettlementStatus } from "../../domain/market-settlement.ts";
import { evidenceFingerprint, evidenceSerialize } from "../evidence/evidence-input.ts";
import type { FootballFixture, Prisma } from "../generated/prisma/client.ts";
import type { LifecycleObservation } from "../predictions/lifecycle-contract.ts";
import { completeResultScore, hasRequiredFinalPhase, verifiedFinalPhaseScores } from "./result-phases.ts";
import { storedFixtureResult } from "./result-read.ts";
import { finalStatus } from "./result-sync-policy.ts";

type ResultFixture = Pick<FootballFixture, "status" | "providerStatus" | "elapsedMinutes" |
  "regulationHome" | "regulationAway" | "regulationEvidenceRef" | "regulationVerifiedAt">;
type ResultObservation = Pick<LifecycleObservation, "externalFixtureId" | "stoppageMinutes" |
  "reportedGoals" | "extraTimeScore" | "penaltyScore" | "halfTimeScore">;

function contradictsKnownScore(input: ResultObservation["extraTimeScore"], previous: NonNullable<ReturnType<typeof completeResultScore>>) {
  return (input.home !== null && input.home !== previous.home) || (input.away !== null && input.away !== previous.away);
}

/** Regulation evidence belongs to the occurrence, including later corrections to its finish phase. */
export function preserveRegulationEvidence(fixture: ResultFixture, status: string,
  score: Pick<NonNullable<LifecycleObservation["regulationScore"]>, "home" | "away"> | null) {
  return isPlayedFinalStatus(status as SettlementStatus) && isPlayedFinalStatus(fixture.status as SettlementStatus) &&
    fixture.regulationVerifiedAt !== null && fixture.regulationEvidenceRef !== null &&
    fixture.regulationHome !== null && fixture.regulationAway !== null &&
    (score === null || fixture.regulationHome === score.home && fixture.regulationAway === score.away);
}

/** Result scores come from canonical regulation evidence, never from the display score. */
export function fixtureResultValue(fixture: ResultFixture, observation: ResultObservation) {
  const verified = fixture.regulationHome !== null && fixture.regulationAway !== null &&
    fixture.regulationVerifiedAt !== null && fixture.regulationEvidenceRef !== null;
  const halfTime = observation.halfTimeScore;
  return { status: fixture.status, providerStatus: fixture.providerStatus, elapsedMinutes: fixture.elapsedMinutes,
    ...(observation.stoppageMinutes !== undefined ? { stoppageMinutes: observation.stoppageMinutes } : {}),
    reportedGoals: observation.reportedGoals, extraTimeScore: observation.extraTimeScore, penaltyScore: observation.penaltyScore,
    regulation: { verified, home: verified ? fixture.regulationHome : null, away: verified ? fixture.regulationAway : null,
      evidenceRef: verified ? fixture.regulationEvidenceRef : null },
    ...(verified && finalStatus(fixture.status) && halfTime?.verified && halfTime.fixtureId === observation.externalFixtureId &&
      halfTime.providerStatus === fixture.providerStatus && halfTime.sourceField === "score.halftime" &&
      halfTime.period === "first-half-including-stoppage-time" &&
      halfTime.home <= fixture.regulationHome! && halfTime.away <= fixture.regulationAway!
      ? { halfTime: { verified: true as const, period: halfTime.period, home: halfTime.home, away: halfTime.away,
        evidenceRef: `api-football:fixture:${observation.externalFixtureId}:${halfTime.providerStatus}:score.halftime` } } : {}) };
}

/** Both verified catalog scopes and fixture lookups advance the same append-only result. */
export async function projectFixtureResult(tx: Prisma.TransactionClient, fixture: ResultFixture & Pick<FootballFixture, "id">,
  observation: ResultObservation, input: Readonly<{
    previousId: string | null; observationId: string; appliedAt: number; observedAt: number;
    providerUpdatedAt: number | null; sameOccurrence: boolean;
  }>) {
  const { previousId, observationId, appliedAt, observedAt, providerUpdatedAt, sameOccurrence } = input;
  const previous = previousId === null ? null : await tx.fixtureResult.findUniqueOrThrow({ where: { id: previousId },
    select: { contentHash: true, status: true } });
  let value = fixtureResultValue(fixture, observation), contentHash = evidenceFingerprint(value);
  let contradictoryPhase = false;
  const projected = (resultId: string) => ({ resultId, phaseConfirmed: !contradictoryPhase && hasRequiredFinalPhase(fixture.status, value) });
  if (sameOccurrence && previousId !== null && previous?.contentHash === contentHash) return projected(previousId);
  if (sameOccurrence && previousId !== null && previous?.status === fixture.status) {
    const prior = await storedFixtureResult(tx, fixture.id, previousId);
    if (prior.providerStatus === fixture.providerStatus) {
      const phases = verifiedFinalPhaseScores(fixture.status, value), previousPhases = verifiedFinalPhaseScores(fixture.status, prior);
      contradictoryPhase =
        fixture.status === "finished-extra-time" && phases.extraTime === null && previousPhases.extraTime !== null &&
          contradictsKnownScore(value.extraTimeScore, previousPhases.extraTime) ||
        fixture.status === "finished-penalties" && phases.shootout === null && previousPhases.shootout !== null &&
          contradictsKnownScore(value.penaltyScore, previousPhases.shootout);
      value = {
        ...value,
        ...(value.stoppageMinutes === undefined && prior.stoppageMinutes !== undefined ? { stoppageMinutes: prior.stoppageMinutes } : {}),
        reportedGoals: completeResultScore(value.reportedGoals) === null ? prior.reportedGoals : value.reportedGoals,
        extraTimeScore: phases.extraTime ?? previousPhases.extraTime ?? value.extraTimeScore,
        penaltyScore: phases.shootout ?? previousPhases.shootout ?? value.penaltyScore,
        ...(value.halfTime === undefined && value.regulation.verified && prior.halfTime !== undefined &&
          prior.halfTime.home <= value.regulation.home! && prior.halfTime.away <= value.regulation.away! ? { halfTime: prior.halfTime } : {}),
      };
      contentHash = evidenceFingerprint(value);
      if (previous.contentHash === contentHash) return projected(previousId);
    }
  }
  const version = (await tx.footballFixture.update({ where: { id: fixture.id }, data: { dataVersion: { increment: 1 } },
    select: { dataVersion: true } })).dataVersion;
  const resultId = await insertFixtureResult(tx, { fixtureId: fixture.id, fixtureVersion: version, previousId, observationId,
    observedAt, providerUpdatedAt, regulationVerifiedAt: fixture.regulationVerifiedAt, value, contentHash });
  await tx.predictionChangeEvent.create({ data: { fixtureId: fixture.id, version, fixtureResultId: resultId,
    kind: "fixture-result", at: new Date(appliedAt) } });
  return projected(resultId);
}

/** Seal one immutable revision. The caller holds the fixture lock and owns the current-result projection. */
export async function insertFixtureResult(tx: Prisma.TransactionClient, input: Readonly<{
  fixtureId: string; fixtureVersion: bigint; previousId: string | null; observationId: string;
  observedAt: number; providerUpdatedAt: number | null; regulationVerifiedAt: Date | null;
  value: ReturnType<typeof fixtureResultValue>; contentHash: string;
}>) {
  const { fixtureId, fixtureVersion, previousId, observationId, observedAt, providerUpdatedAt, regulationVerifiedAt, value, contentHash } = input;
  const id = evidenceFingerprint({ observationId, kind: "fixture-result" });
  const body = evidenceSerialize({ id, fixtureId, fixtureVersion, previousId, observationId, observedAt, providerUpdatedAt,
    regulationVerifiedAt: value.regulation.verified ? regulationVerifiedAt!.getTime() : null, ...value });
  await tx.$executeRaw`INSERT INTO FixtureResult (id, fixtureId, fixtureVersion, observedAt, status,
    regulationVerified, regulationHome, regulationAway, contentHash, integrity, body)
    VALUES (${id}, ${fixtureId}, ${fixtureVersion}, ${new Date(observedAt)}, ${value.status}, ${value.regulation.verified},
      ${value.regulation.home}, ${value.regulation.away}, ${contentHash}, SHA2(CAST(JSON_EXTRACT(${body}, '$') AS CHAR), 256), JSON_EXTRACT(${body}, '$'))`;
  return id;
}
