import "server-only";

import type { UtcInstant } from "../../domain/calendar.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { FixtureDetailFacts } from "./fixture-match-details.ts";

export type FixtureFactObservation = Readonly<{ values: FixtureDetailFacts; retrievedAt: UtcInstant }>;
export const FIXTURE_FACTS_MAX_BYTES = 1_000_000;

function teamId(value: unknown): number | null {
  if (!value || typeof value !== "object" || !("team" in value)) return null;
  const team = value.team;
  return team && typeof team === "object" && "id" in team && typeof team.id === "number" ? team.id : null;
}

/** Fill missing observations from a complete pair and retain saved values for each team. */
function archiveTeamFacts(previous: unknown, incoming: readonly unknown[] | null, fields: readonly string[]): readonly unknown[] | null {
  if (!incoming?.length) return null;
  if (previous == null || Array.isArray(previous) && !previous.length) return incoming;
  if (!Array.isArray(previous) || previous.length > 2 || incoming.length !== 2) return null;
  const ids = new Set(previous.map(teamId)), byTeam = new Map(incoming.map((row) => [teamId(row), row]));
  if (ids.has(null) || ids.size !== previous.length || [...ids].some((id) => !byTeam.has(id))) return null;
  const combined: unknown[] = previous.map((row: Record<string, unknown>) => {
    const supplied = byTeam.get(teamId(row)) as Record<string, unknown>;
    const missing = fields.filter((field) => {
      const old = row[field], next = supplied[field];
      return (old == null || Array.isArray(old) && old.length === 0) && Array.isArray(next) && next.length > 0;
    });
    return missing.length ? { ...row, ...Object.fromEntries(missing.map((field) => [field, supplied[field]])) } : row;
  });
  combined.push(...incoming.filter((row) => !ids.has(teamId(row))));
  return combined.length !== previous.length || combined.some((row, index) => row !== previous[index]) ? combined : null;
}

/** The caller locks and verifies the canonical fixture before writing its observations. */
export async function saveFixtureFacts(tx: Prisma.TransactionClient, target: Readonly<{ fixtureId: string; externalId: number }>,
  observation: FixtureFactObservation, now: Date, replaceExisting = true): Promise<boolean> {
  const { events, statistics, lineups, players, info } = observation.values;
  if ((!info && ![events, statistics, lineups, players].some((rows) => rows?.length)) ||
    observation.retrievedAt > now.getTime() || Buffer.byteLength(JSON.stringify(observation.values)) > FIXTURE_FACTS_MAX_BYTES) return false;
  const previous = await tx.fixtureFacts.findUnique({ where: { fixtureId: target.fixtureId }, select: {
    events: !replaceExisting, eventsHash: true, statistics: !replaceExisting, statisticsHash: true, lineups: true, playerStatistics: true,
    eventsRetrievedAt: true, statisticsRetrievedAt: true, detailsRetrievedAt: true, infoRetrievedAt: true,
    venueExternalId: true, venueName: true, venueCity: true, referee: true,
  } });
  const at = new Date(observation.retrievedAt);
  const eventsHash = events?.length ? evidenceFingerprint(events) : null;
  const teamStatistics = replaceExisting ? statistics : archiveTeamFacts(previous?.statistics, statistics, ["statistics"]);
  const teamLineups = replaceExisting ? lineups : archiveTeamFacts(previous?.lineups, lineups, ["startXI", "substitutes"]);
  const teamPlayers = replaceExisting ? players : archiveTeamFacts(previous?.playerStatistics, players, ["players"]);
  const statisticsHash = teamStatistics?.length ? evidenceFingerprint(teamStatistics) : null;
  const canWrite = (old: Date | null | undefined) => old == null || at >= old;
  const venueId = info?.venueId == null ? null : BigInt(info.venueId);
  const compatibleVenue = venueId !== null && previous?.venueExternalId != null ? venueId === previous.venueExternalId :
    info?.venueName == null || previous?.venueName == null || info.venueName.toLowerCase() === previous.venueName.toLowerCase();
  const infoFields = info && canWrite(previous?.infoRetrievedAt) ? {
    ...(compatibleVenue && venueId !== null && previous?.venueExternalId == null ? { venueExternalId: venueId } : {}),
    ...(compatibleVenue && info.venueName !== null && previous?.venueName == null ? { venueName: info.venueName } : {}),
    ...(compatibleVenue && info.venueCity !== null && previous?.venueCity == null ? { venueCity: info.venueCity } : {}),
    ...(info.referee !== null && previous?.referee == null ? { referee: info.referee } : {}),
  } : {};
  const changes = {
    ...(eventsHash && eventsHash !== previous?.eventsHash && canWrite(previous?.eventsRetrievedAt) &&
      (replaceExisting || previous?.events == null || Array.isArray(previous.events) && !previous.events.length) ?
      { events: events as Prisma.InputJsonArray, eventsHash, eventsRetrievedAt: at } : {}),
    ...(statisticsHash && statisticsHash !== previous?.statisticsHash && canWrite(previous?.statisticsRetrievedAt) ?
      { statistics: teamStatistics as Prisma.InputJsonArray, statisticsHash, statisticsRetrievedAt: at } : {}),
    ...(teamLineups?.length && canWrite(previous?.detailsRetrievedAt) &&
      evidenceFingerprint(teamLineups) !== evidenceFingerprint(previous?.lineups ?? null) ? { lineups: teamLineups as Prisma.InputJsonArray } : {}),
    ...(teamPlayers?.length && canWrite(previous?.detailsRetrievedAt) &&
      evidenceFingerprint(teamPlayers) !== evidenceFingerprint(previous?.playerStatistics ?? null) ? { playerStatistics: teamPlayers as Prisma.InputJsonArray } : {}),
    ...infoFields,
    ...(Object.keys(infoFields).length ? { infoRetrievedAt: at } : {}),
  };
  if (Object.keys(changes).length === 0) return false;
  const data = { ...changes, updatedAt: now, ...("lineups" in changes || "playerStatistics" in changes ? { detailsRetrievedAt: at } : {}) };
  await tx.fixtureFacts.upsert({ where: { fixtureId: target.fixtureId },
    create: { fixtureId: target.fixtureId, providerFixtureId: BigInt(target.externalId), ...data }, update: data });
  return true;
}
