import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import { evidenceSerialize } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { PublicationObservation } from "./publication-contract.ts";
import { storedPublicationBarrier } from "./publication-read.ts";

/** Caller holds the shared canonical provider/fixture lock. First proof is immutable. */
export async function recordPublicationBarrier(tx: Prisma.TransactionClient, observation: PublicationObservation, at: UtcInstant) {
  const previous = await storedPublicationBarrier(tx, observation.cycleId);
  if (previous) return previous;
  const payload = evidenceSerialize(observation), closedAt = observation.actualStartedAt ?? observation.retrievedAt;
  await tx.$executeRaw`INSERT INTO PredictionPublicationBarrier (cycleId, fixtureId, closedAt, recordedAt, integrity, observationJson)
    VALUES (${observation.cycleId}, ${observation.fixtureId}, ${new Date(closedAt)}, ${new Date(at)},
      SHA2(CAST(CAST(${payload} AS JSON) AS CHAR), 256), CAST(${payload} AS JSON))`;
  return (await storedPublicationBarrier(tx, observation.cycleId))!;
}
