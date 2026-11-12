import "server-only";

import { evidenceFingerprint, evidenceSerialize } from "../evidence/evidence-input.ts";
import type { FootballFixture, Prisma } from "../generated/prisma/client.ts";
import type { LifecycleObservation } from "../predictions/lifecycle-contract.ts";
import { finalStatus } from "./result-sync-policy.ts";

type ResultFixture = Pick<FootballFixture, "status" | "providerStatus" | "elapsedMinutes" |
  "regulationHome" | "regulationAway" | "regulationEvidenceRef" | "regulationVerifiedAt">;
type ResultObservation = Pick<LifecycleObservation, "externalFixtureId" | "stoppageMinutes" |
  "reportedGoals" | "extraTimeScore" | "penaltyScore" | "halfTimeScore">;

/** Result scores come from canonical regulation evidence, never from the display score. */
export function fixtureResultValue(fixture: ResultFixture, observation: ResultObservation) {
  const verified = fixture.regulationHome !== null && fixture.regulationAway !== null && fixture.regulationVerifiedAt !== null;
  const halfTime = observation.halfTimeScore;
  return { status: fixture.status, providerStatus: fixture.providerStatus, elapsedMinutes: fixture.elapsedMinutes,
    ...(observation.stoppageMinutes !== undefined ? { stoppageMinutes: observation.stoppageMinutes } : {}),
    reportedGoals: observation.reportedGoals, extraTimeScore: observation.extraTimeScore, penaltyScore: observation.penaltyScore,
    regulation: { verified, home: verified ? fixture.regulationHome : null, away: verified ? fixture.regulationAway : null,
      evidenceRef: verified ? fixture.regulationEvidenceRef : null },
    ...(verified && finalStatus(fixture.status) && halfTime?.verified &&
      halfTime.home <= fixture.regulationHome! && halfTime.away <= fixture.regulationAway!
      ? { halfTime: { verified: true as const, period: halfTime.period, home: halfTime.home, away: halfTime.away,
        evidenceRef: `api-football:fixture:${observation.externalFixtureId}:${halfTime.providerStatus}:score.halftime` } } : {}) };
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
